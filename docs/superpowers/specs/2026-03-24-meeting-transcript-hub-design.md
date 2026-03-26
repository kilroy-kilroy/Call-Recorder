# Meeting Transcript Hub — Design Spec

## Problem

Existing meeting recording tools (Granola, Otter, Fireflies, etc.) prioritize AI summaries over raw transcripts, bury the actual data behind UI friction, and charge $15/month for the privilege of doing workarounds. When the summary is wrong — and it often is — there's no easy way to get to the underlying transcript to copy it into Claude, paste it into a CRM, or use it however you need.

The current Electron + Recall.ai prototype is unreliable, overly complex (full video recording, per-app SDK hooks), and solves the wrong problem.

## Goal

Build a personal, reliable, botless meeting recorder where **the transcript is the primary artifact**. Summaries are a convenience layer on top, not a replacement. The transcript must always be front and center, one-click copyable, and trivially exportable to wherever it needs to go — Copper, Call Lab Pro, Claude, or anywhere else.

## Design Principles

1. **Transcript first** — the raw transcript is the default view, always accessible, one-click copy. Summaries are secondary.
2. **Dumb capture, smart hub** — the local agent does one thing (capture audio). All intelligence lives in the web app.
3. **Deliberate exports, not automation** — the user decides what goes where. No automatic syncing — just fast, frictionless "send to..." actions.
4. **Own your data** — self-hosted, no vendor lock-in on the data layer. API costs only.
5. **Minimal moving parts** — fewer things to break. If a component isn't essential, cut it.

## Architecture Overview

```
┌─────────────────────┐
│  Swift Menubar App   │
│  (macOS)             │
│                      │
│  • Record/Stop       │
│  • Capture sys audio │
│  • Upload to API     │
└──────────┬──────────┘
           │ HTTPS POST (audio file)
           ▼
┌─────────────────────────────────────────┐
│  Next.js Web App (Vercel)               │
│                                         │
│  API Routes:                            │
│  • POST /api/upload    ← receives audio │
│  • Pipeline: audio → Deepgram → LLM    │
│                                         │
│  Pages:                                 │
│  • /dashboard          ← meeting list   │
│  • /meeting/[id]       ← detail + AI    │
│  • /settings           ← config         │
│                                         │
│  Exports:                               │
│  • Clipboard / Download / Webhook       │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Supabase            │
│                      │
│  • Postgres (data)   │
│  • Storage (audio)   │
└─────────────────────┘

External APIs:
  • Deepgram Nova-2 (transcription w/ speaker diarization)
  • Vercel AI Gateway → Claude/GPT (summaries)
```

## Component 1: Swift Menubar Agent (macOS)

### Purpose
Capture system audio during meetings and upload it to the web app. Nothing else.

### Behavior
- Lives in the macOS menubar as a small icon (microphone or similar)
- No dock icon, no window — just a dropdown menu when clicked
- States: Idle → Recording → Uploading → Done
- Visual indicator in menubar changes color/icon per state

### Audio Capture
- Uses macOS `ScreenCaptureKit` framework to capture system audio
- Records to a local temporary file in AAC/M4A format (compressed, small)
- Requires Screen Recording permission (one-time grant in System Settings)
- Platform-agnostic: captures whatever audio is playing — Zoom, Meet, Teams, phone calls, anything

### Upload
- When recording stops, uploads the audio file to the web app's `/api/upload` endpoint
- Simple HTTPS POST with multipart form data
- Includes metadata: timestamp, duration
- Shows upload progress in the menubar dropdown
- Retries on failure (3 attempts with exponential backoff)
- Deletes local temp file after successful upload

### Authentication
- Simple shared secret / API key configured on first launch
- Stored in macOS Keychain

### What It Does NOT Do
- No transcription
- No summarization
- No meeting detection (v1 — could add later)
- No settings beyond server URL and API key
- No UI beyond the menubar dropdown

## Component 2: Next.js Web App (Vercel)

### Purpose
The meeting intelligence hub. View transcripts, generate summaries, search, and export.

### Pages

#### Dashboard (`/dashboard`)
- List of all meetings, most recent first
- Each card shows: date/time, duration, auto-generated title, status badge (processing/ready)
- Search bar — full-text search across transcripts
- Filter by date range

#### Meeting Detail (`/meeting/[id]`)
- **Transcript (primary view)** — full transcript with speaker labels (Speaker 1, Speaker 2, etc.) and timestamps. Searchable within the page. "Copy Transcript" button always visible at the top.
- **Summary (secondary)** — below the transcript or in a collapsible panel. Shows the structured summary (key points, decisions, action items, follow-ups). "Re-summarize" button with a custom prompt field to generate alternative summaries.
- **Summaries list** — if multiple summaries have been generated, show them as tabs or a list (most recent first).
- **Export actions** — "Send to..." button with configured destinations.

#### Settings (`/settings`)
- Deepgram API key
- Default summary prompt template
- Export destinations configuration (webhook URLs, etc.)
- Upload API key (for authenticating the menubar agent)

### API Routes

#### `POST /api/upload`
- Receives audio file from the menubar agent
- Validates API key
- Stores audio in Supabase Storage
- Creates a meeting record in Postgres with status "processing"
- Triggers the transcription pipeline (async)

#### `POST /api/transcribe` (internal, triggered by upload)
- Sends audio from Supabase Storage to Deepgram Nova-2 API
- Requests speaker diarization and punctuation
- On completion: stores transcript in Postgres, updates meeting status
- Triggers summarization

#### `POST /api/summarize` (internal, triggered by transcription OR manual re-prompt)
- Sends transcript to LLM via Vercel AI Gateway
- Uses default structured prompt or user-provided custom prompt
- Stores summary in Postgres linked to the meeting
- Updates meeting status to "ready"

#### `POST /api/export/[type]`
- Handles export to configured destinations
- Types: `clipboard` (returns formatted text), `download` (returns file), `webhook` (POSTs to configured URL)

### Processing Pipeline

```
Audio uploaded
  → Store in Supabase Storage
  → Create meeting record (status: "processing")
  → Send to Deepgram Nova-2 (status: "transcribing")
  → Receive transcript with speaker labels
  → Store transcript (status: "summarizing")
  → Send to LLM for structured summary
  → Store summary (status: "ready")
  → Delete audio from Supabase Storage (optional, configurable)
```

Each step updates the meeting status so the dashboard reflects current state. If any step fails, status shows "error" with a retry button.

### Async Pipeline Mechanism

The upload route stores the file and creates the meeting record synchronously, then triggers the transcription pipeline asynchronously. Two options depending on Deepgram's callback support:

1. **Deepgram callback (preferred)** — Deepgram supports a `callback` URL parameter. The upload route sends audio to Deepgram with `callback=https://yourapp.vercel.app/api/transcribe-callback`. Deepgram posts the transcript back when done. No long-running Vercel function needed.
2. **Sequential in a single function** — For a 45-minute meeting, Deepgram pre-recorded transcription typically returns in 30-60 seconds. This fits within Vercel's function timeout (300s default). The upload route can call Deepgram, wait for the response, store the transcript, then call the LLM for summarization — all in one request.

Option 1 is more resilient. Option 2 is simpler. Either works; decide at implementation time.

## Component 3: Data Storage (Supabase)

### Postgres Tables

#### `meetings`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| title | text | Auto-generated from transcript content |
| recorded_at | timestamptz | When the recording started |
| duration_seconds | integer | Recording length |
| status | text | processing / transcribing / summarizing / ready / error |
| error_message | text | Null unless status is error |
| created_at | timestamptz | |

#### `transcripts`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| meeting_id | uuid | FK to meetings |
| segments | jsonb | Array of {speaker, text, start_time, end_time} |
| full_text | text | Plain text version for search and copy |
| created_at | timestamptz | |

#### `summaries`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| meeting_id | uuid | FK to meetings |
| prompt_used | text | The prompt that generated this summary |
| content | jsonb | Structured: {title, key_points, decisions, action_items, follow_ups} |
| raw_text | text | Plain text version |
| created_at | timestamptz | |

#### `export_destinations`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| name | text | Display name (e.g., "Copper Webhook") |
| type | text | clipboard / download / webhook |
| config | jsonb | URL, headers, format template, etc. |
| created_at | timestamptz | |

#### `export_log`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| meeting_id | uuid | FK to meetings |
| destination_id | uuid | FK to export_destinations |
| content_type | text | transcript / summary / both |
| exported_at | timestamptz | |
| status | text | success / error |

### Supabase Storage
- Bucket: `meeting-audio`
- Temporary storage for audio files during transcription pipeline
- Files deleted after successful transcription (configurable)

## Component 4: Export System

### Built-in Destinations (v1)

#### Clipboard
- Copies formatted transcript or summary as plain text / markdown
- One-click from meeting detail page

#### Download
- Exports as `.md`, `.txt`, or `.json`
- Transcript includes speaker labels and timestamps
- Summary exports structured sections

#### Webhook (Generic)
- POST to any configured URL
- Payload includes meeting metadata, transcript, and/or summary
- Configurable headers (for auth tokens)
- This covers Copper, Call Lab Pro, and any future tool — either directly via their API or through a Zapier/Make bridge

### Adding New Destinations (Future)
Each destination is a small adapter function (~50-100 lines) that takes meeting data and sends it somewhere. The webhook adapter is generic enough to cover most cases without writing new code.

## External Services & Costs

| Service | Purpose | Cost |
|---------|---------|------|
| Vercel (free tier) | Web app hosting | $0/month |
| Supabase (free tier) | Database + file storage | $0/month |
| Deepgram Nova-2 | Transcription w/ speaker diarization | ~$0.0043/min (~$3-4/month for 15hrs) |
| Vercel AI Gateway | LLM routing for summaries | ~$1/month for personal use |
| **Total** | | **~$4-5/month** |

## What's NOT in Scope (v1)

- Automatic meeting detection (start recording manually)
- Real-time / live transcription during the call
- Speaker name assignment (speakers labeled as Speaker 1, 2, etc. — no name matching)
- Windows support (macOS only for the capture agent)
- Multi-user / team features
- Deep Copper or Call Lab Pro integrations (webhook covers this)
- Mobile app (web app is mobile-accessible via browser)

## Error Handling & Reliability

- **Menubar agent upload failure** — retries 3 times with exponential backoff, keeps local file until upload succeeds, shows error state in menubar
- **Transcription failure** — meeting shows "error" status with retry button in web UI. Audio file retained in Supabase Storage until transcription succeeds.
- **Summarization failure** — transcript is still available. Summary shows "error" with retry. Non-blocking — the transcript (the primary artifact) is not affected.
- **Web app downtime** — menubar agent queues uploads locally until the server is reachable

## Security

- Upload endpoint authenticated with API key (shared secret between agent and server)
- Web app protected with a simple password gate (environment variable) — single-user personal tool, no need for full auth system
- Web app behind Vercel's default security (HTTPS, DDoS protection)
- Supabase row-level security for data access
- No sensitive data stored in the web app's environment beyond API keys (Deepgram, Supabase)
- Audio files are transient — deleted after transcription

## Tech Stack Summary

| Component | Technology |
|-----------|-----------|
| Capture agent | Swift, ScreenCaptureKit, macOS menubar app |
| Web app | Next.js (App Router), deployed on Vercel |
| Database | Supabase Postgres |
| File storage | Supabase Storage |
| Transcription | Deepgram Nova-2 API |
| AI summaries | Vercel AI Gateway → Claude/GPT |
| UI styling | Tailwind CSS + shadcn/ui |

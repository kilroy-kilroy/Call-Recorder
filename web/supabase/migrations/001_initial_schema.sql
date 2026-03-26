-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Meetings table
create table meetings (
  id uuid primary key default uuid_generate_v4(),
  title text,
  recorded_at timestamptz not null,
  duration_seconds integer,
  status text not null default 'processing'
    check (status in ('processing', 'transcribing', 'summarizing', 'ready', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

-- Transcripts table
create table transcripts (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  segments jsonb not null default '[]',
  full_text text not null default '',
  created_at timestamptz not null default now()
);

create unique index transcripts_meeting_id_idx on transcripts(meeting_id);

-- Summaries table (multiple per meeting)
create table summaries (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  prompt_used text not null,
  content jsonb not null default '{}',
  raw_text text not null default '',
  created_at timestamptz not null default now()
);

create index summaries_meeting_id_idx on summaries(meeting_id);

-- Export destinations table
create table export_destinations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null check (type in ('clipboard', 'download', 'webhook')),
  config jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Export log table
create table export_log (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  destination_id uuid references export_destinations(id) on delete set null,
  content_type text not null check (content_type in ('transcript', 'summary', 'both')),
  exported_at timestamptz not null default now(),
  status text not null default 'success' check (status in ('success', 'error'))
);

create index export_log_meeting_id_idx on export_log(meeting_id);

-- Full-text search index on transcript text
create index transcripts_full_text_search_idx on transcripts using gin(to_tsvector('english', full_text));

-- MANUAL STEP REQUIRED: Create the "meeting-audio" storage bucket in your Supabase dashboard.
-- Go to Storage > New Bucket, name it "meeting-audio", and set it to private.
-- This bucket will store raw audio files uploaded from the desktop recorder app.

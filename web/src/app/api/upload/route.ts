import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { put } from "@vercel/blob";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.UPLOAD_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const recordedAt = (formData.get("recordedAt") as string) || new Date().toISOString();
    const durationSeconds = formData.get("durationSeconds")
      ? Number(formData.get("durationSeconds"))
      : null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Create meeting record
    const [meeting] = await sql`
      INSERT INTO meetings (recorded_at, duration_seconds, status)
      VALUES (${recordedAt}, ${durationSeconds}, 'processing')
      RETURNING *
    `;

    const pathname = `audio/${meeting.id}-${Date.now()}.m4a`;

    // Upload to Vercel Blob server-side
    const blob = await put(pathname, file, {
      access: "public",
      contentType: file.type || "audio/mp4",
      addRandomSuffix: false,
    });

    // Trigger transcription via Deepgram with callback
    const callbackUrl = `${request.nextUrl.origin}/api/transcribe-callback?meeting_id=${meeting.id}&audio_url=${encodeURIComponent(blob.url)}`;

    const dgResponse = await fetch(
      `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&paragraphs=true&punctuate=true&callback=${encodeURIComponent(callbackUrl)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: blob.url }),
      }
    );

    if (!dgResponse.ok) {
      await sql`
        UPDATE meetings SET status = 'error', error_message = 'Failed to start transcription'
        WHERE id = ${meeting.id}
      `;
      throw new Error(`Deepgram request failed: ${dgResponse.status}`);
    }

    await sql`
      UPDATE meetings SET status = 'transcribing' WHERE id = ${meeting.id}
    `;

    return NextResponse.json({
      meetingId: String(meeting.id),
      status: "transcribing",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

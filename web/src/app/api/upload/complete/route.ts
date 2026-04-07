import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.UPLOAD_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { meetingId, blobUrl } = await request.json();

    if (!meetingId || !blobUrl) {
      return NextResponse.json(
        { error: "meetingId and blobUrl are required" },
        { status: 400 }
      );
    }

    // Trigger transcription via Deepgram with callback
    const callbackUrl = `${request.nextUrl.origin}/api/transcribe-callback?meeting_id=${meetingId}&audio_url=${encodeURIComponent(blobUrl)}`;

    const dgResponse = await fetch(
      `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&paragraphs=true&punctuate=true&callback=${encodeURIComponent(callbackUrl)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: blobUrl }),
      }
    );

    if (!dgResponse.ok) {
      await sql`
        UPDATE meetings SET status = 'error', error_message = 'Failed to start transcription'
        WHERE id = ${meetingId}
      `;
      throw new Error(`Deepgram request failed: ${dgResponse.status}`);
    }

    await sql`
      UPDATE meetings SET status = 'transcribing' WHERE id = ${meetingId}
    `;

    return NextResponse.json({
      meetingId,
      status: "transcribing",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

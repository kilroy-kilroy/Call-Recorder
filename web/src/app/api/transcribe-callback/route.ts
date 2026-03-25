import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { del } from "@vercel/blob";
import { generateSummary } from "@/lib/summarize";

interface DeepgramParagraph {
  speaker: number;
  sentences: { text: string; start: number; end: number }[];
}

export async function POST(request: NextRequest) {
  const meetingId = request.nextUrl.searchParams.get("meeting_id");
  const audioUrl = request.nextUrl.searchParams.get("audio_url");

  if (!meetingId) {
    return NextResponse.json(
      { error: "Missing meeting_id" },
      { status: 400 }
    );
  }

  try {
    const data = await request.json();

    const paragraphs: DeepgramParagraph[] =
      data.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs ??
      [];

    const segments = paragraphs.flatMap((para) =>
      para.sentences.map((sentence) => ({
        speaker: `Speaker ${para.speaker + 1}`,
        text: sentence.text,
        start_time: sentence.start,
        end_time: sentence.end,
      }))
    );

    const fullText = segments
      .map((s) => `${s.speaker}: ${s.text}`)
      .join("\n");

    // Store transcript
    await sql`
      INSERT INTO transcripts (meeting_id, segments, full_text)
      VALUES (${meetingId}, ${JSON.stringify(segments)}, ${fullText})
    `;

    // Update meeting status
    await sql`
      UPDATE meetings SET status = 'summarizing' WHERE id = ${meetingId}
    `;

    // Generate summary
    try {
      const { structured, rawText, promptUsed } =
        await generateSummary(fullText);

      await sql`
        INSERT INTO summaries (meeting_id, prompt_used, content, raw_text)
        VALUES (${meetingId}, ${promptUsed}, ${JSON.stringify(structured)}, ${rawText})
      `;

      // Update meeting title and status
      await sql`
        UPDATE meetings SET title = ${structured.title}, status = 'ready'
        WHERE id = ${meetingId}
      `;
    } catch {
      // Summarization failure is non-blocking -- transcript is safe
      await sql`
        UPDATE meetings SET status = 'ready', error_message = 'Summary generation failed'
        WHERE id = ${meetingId}
      `;
    }

    // Delete audio file from blob storage
    if (audioUrl) {
      await del(audioUrl);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await sql`
      UPDATE meetings SET status = 'error', error_message = ${message}
      WHERE id = ${meetingId}
    `;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

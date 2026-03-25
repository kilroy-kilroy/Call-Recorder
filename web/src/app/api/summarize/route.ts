import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateSummary } from "@/lib/summarize";

export async function POST(request: Request) {
  try {
    const { meetingId, customPrompt } = await request.json();

    if (!meetingId) {
      return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
    }

    // Get transcript
    const transcripts = await sql`
      SELECT full_text FROM transcripts WHERE meeting_id = ${meetingId} LIMIT 1
    `;

    if (transcripts.length === 0) {
      return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
    }

    const { structured, rawText, promptUsed } = await generateSummary(
      transcripts[0].full_text,
      customPrompt
    );

    const [summary] = await sql`
      INSERT INTO summaries (meeting_id, prompt_used, content, raw_text)
      VALUES (${meetingId}, ${promptUsed}, ${JSON.stringify(structured)}, ${rawText})
      RETURNING *
    `;

    return NextResponse.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

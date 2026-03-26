import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { formatForClipboard, formatForDownload, sendWebhook } from "@/lib/export-adapters";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  try {
    const body = await request.json();
    const { meetingId, contentType = "both", format = "md", destinationId } = body;

    if (!meetingId) {
      return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
    }

    // Fetch meeting data
    const [transcripts, summaries, meetings] = await Promise.all([
      sql`SELECT full_text FROM transcripts WHERE meeting_id = ${meetingId} LIMIT 1`,
      sql`SELECT content FROM summaries WHERE meeting_id = ${meetingId} ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT recorded_at FROM meetings WHERE id = ${meetingId} LIMIT 1`,
    ]);

    const transcript = transcripts[0]?.full_text ?? null;
    const summary = summaries[0]?.content ?? null;
    const dateStr = meetings[0]?.recorded_at
      ? new Date(meetings[0].recorded_at).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    if (type === "clipboard") {
      const text = formatForClipboard(contentType, transcript, summary);
      return NextResponse.json({ text });
    }

    if (type === "download") {
      const { filename, content, mimeType } = formatForDownload(
        contentType,
        format,
        transcript,
        summary,
        dateStr
      );
      return new NextResponse(content, {
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    if (type === "webhook") {
      if (!destinationId) {
        return NextResponse.json({ error: "Missing destinationId" }, { status: 400 });
      }

      const destinations = await sql`
        SELECT config FROM export_destinations WHERE id = ${destinationId} LIMIT 1
      `;

      if (destinations.length === 0) {
        return NextResponse.json({ error: "Destination not found" }, { status: 404 });
      }

      await sendWebhook(destinations[0].config, {
        meetingId,
        transcript,
        summary,
      });

      // Log the export
      await sql`
        INSERT INTO export_log (meeting_id, destination_id, content_type, status)
        VALUES (${meetingId}, ${destinationId}, ${contentType}, 'success')
      `;

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Unknown export type: ${type}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

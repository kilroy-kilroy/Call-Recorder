import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
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
    const [transcriptResult, summaryResult, meetingResult] = await Promise.all([
      supabase
        .from("transcripts")
        .select("full_text")
        .eq("meeting_id", meetingId)
        .single(),
      supabase
        .from("summaries")
        .select("content")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from("meetings")
        .select("recorded_at")
        .eq("id", meetingId)
        .single(),
    ]);

    const transcript = transcriptResult.data?.full_text ?? null;
    const summary = summaryResult.data?.content ?? null;
    const dateStr = meetingResult.data?.recorded_at
      ? new Date(meetingResult.data.recorded_at).toISOString().split("T")[0]
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

      const { data: destination } = await supabase
        .from("export_destinations")
        .select("config")
        .eq("id", destinationId)
        .single();

      if (!destination) {
        return NextResponse.json({ error: "Destination not found" }, { status: 404 });
      }

      await sendWebhook(destination.config, {
        meetingId,
        transcript,
        summary,
      });

      // Log the export
      await supabase.from("export_log").insert({
        meeting_id: meetingId,
        destination_id: destinationId,
        content_type: contentType,
        status: "success",
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Unknown export type: ${type}` }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

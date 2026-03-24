import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateSummary } from "@/lib/summarize";

interface DeepgramParagraph {
  speaker: number;
  sentences: { text: string; start: number; end: number }[];
}

export async function POST(request: NextRequest) {
  const meetingId = request.nextUrl.searchParams.get("meeting_id");
  const audioPath = request.nextUrl.searchParams.get("audio_path");

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
    const { error: transcriptError } = await supabase
      .from("transcripts")
      .insert({ meeting_id: meetingId, segments, full_text: fullText });

    if (transcriptError) {
      throw new Error(`Transcript insert failed: ${transcriptError.message}`);
    }

    // Update meeting status
    await supabase
      .from("meetings")
      .update({ status: "summarizing" })
      .eq("id", meetingId);

    // Generate summary
    try {
      const { structured, rawText, promptUsed } =
        await generateSummary(fullText);

      await supabase.from("summaries").insert({
        meeting_id: meetingId,
        prompt_used: promptUsed,
        content: structured,
        raw_text: rawText,
      });

      // Update meeting title and status
      await supabase
        .from("meetings")
        .update({ title: structured.title, status: "ready" })
        .eq("id", meetingId);
    } catch {
      // Summarization failure is non-blocking -- transcript is safe
      await supabase
        .from("meetings")
        .update({
          status: "ready",
          error_message: "Summary generation failed",
        })
        .eq("id", meetingId);
    }

    // Delete audio file from storage
    if (audioPath) {
      await supabase.storage.from("meeting-audio").remove([audioPath]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await supabase
      .from("meetings")
      .update({ status: "error", error_message: message })
      .eq("id", meetingId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

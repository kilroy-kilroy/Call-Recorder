import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateSummary } from "@/lib/summarize";

export async function POST(request: NextRequest) {
  try {
    const { meetingId, customPrompt } = await request.json();

    if (!meetingId) {
      return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
    }

    // Get transcript
    const { data: transcript, error: txError } = await supabase
      .from("transcripts")
      .select("full_text")
      .eq("meeting_id", meetingId)
      .single();

    if (txError || !transcript) {
      return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
    }

    const { structured, rawText, promptUsed } = await generateSummary(
      transcript.full_text,
      customPrompt
    );

    const { data: summary, error: insertError } = await supabase
      .from("summaries")
      .insert({
        meeting_id: meetingId,
        prompt_used: promptUsed,
        content: structured,
        raw_text: rawText,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Summary insert failed: ${insertError.message}`);
    }

    return NextResponse.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

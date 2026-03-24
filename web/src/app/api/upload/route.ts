import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  // Validate API key
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.UPLOAD_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("audio") as File | null;
    const recordedAt = formData.get("recorded_at") as string | null;
    const durationSeconds = formData.get("duration_seconds") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Upload to Supabase Storage
    const fileName = `audio/${Date.now()}-${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("meeting-audio")
      .upload(fileName, buffer, { contentType: file.type });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Create meeting record
    const { data: meeting, error: dbError } = await supabase
      .from("meetings")
      .insert({
        recorded_at: recordedAt ?? new Date().toISOString(),
        duration_seconds: durationSeconds ? parseInt(durationSeconds) : null,
        status: "processing",
      })
      .select()
      .single();

    if (dbError) {
      throw new Error(`Database insert failed: ${dbError.message}`);
    }

    // Get a signed URL for Deepgram to access the audio
    const { data: signedUrlData } = await supabase.storage
      .from("meeting-audio")
      .createSignedUrl(fileName, 3600);

    if (!signedUrlData?.signedUrl) {
      throw new Error("Failed to create signed URL for audio");
    }

    // Trigger transcription via Deepgram with callback
    const callbackUrl = `${request.nextUrl.origin}/api/transcribe-callback?meeting_id=${meeting.id}&audio_path=${encodeURIComponent(fileName)}`;

    const dgResponse = await fetch(
      `https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&paragraphs=true&punctuate=true&callback=${encodeURIComponent(callbackUrl)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: signedUrlData.signedUrl }),
      }
    );

    if (!dgResponse.ok) {
      await supabase
        .from("meetings")
        .update({
          status: "error",
          error_message: "Failed to start transcription",
        })
        .eq("id", meeting.id);
      throw new Error(`Deepgram request failed: ${dgResponse.status}`);
    }

    // Update status to transcribing
    await supabase
      .from("meetings")
      .update({ status: "transcribing" })
      .eq("id", meeting.id);

    return NextResponse.json({
      meetingId: meeting.id,
      status: "transcribing",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.UPLOAD_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { recordedAt, durationSeconds } = await request.json();

    // Create meeting record
    const [meeting] = await sql`
      INSERT INTO meetings (recorded_at, duration_seconds, status)
      VALUES (${recordedAt ?? new Date().toISOString()}, ${durationSeconds ?? null}, 'processing')
      RETURNING *
    `;

    const pathname = `audio/${meeting.id}-${Date.now()}.m4a`;

    // Generate a scoped client token for direct Blob upload
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN!,
      allowedContentTypes: ["audio/*"],
      maximumSizeInBytes: 500 * 1024 * 1024, // 500 MB
      validUntil: Date.now() + 60 * 60 * 1000, // 1 hour
      addRandomSuffix: false,
      pathname,
    });

    return NextResponse.json({
      meetingId: String(meeting.id),
      clientToken,
      pathname,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

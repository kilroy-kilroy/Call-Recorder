import { notFound } from "next/navigation";
import { sql } from "@/lib/db";

interface MeetingPageProps {
  params: Promise<{ id: string }>;
}

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { id } = await params;

  const meetingRows = await sql`SELECT * FROM meetings WHERE id = ${id} LIMIT 1`;
  const meeting = meetingRows[0];
  if (!meeting) notFound();

  const transcriptRows = await sql`SELECT * FROM transcripts WHERE meeting_id = ${id} LIMIT 1`;
  const transcript = transcriptRows[0] ?? null;

  const summaryRows = await sql`SELECT * FROM summaries WHERE meeting_id = ${id} ORDER BY created_at DESC LIMIT 1`;
  const summaryContent = summaryRows[0]?.content as Record<string, string[]> | null;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 32, fontFamily: "system-ui" }}>
      <a href="/dashboard" style={{ color: "#999", fontSize: 14 }}>&larr; Back</a>
      <h1 style={{ marginTop: 16 }}>{String(meeting.title ?? "Untitled Meeting")}</h1>
      <p style={{ color: "#999", fontSize: 14 }}>{String(meeting.status)}</p>

      <h2 style={{ marginTop: 32 }}>Transcript</h2>
      {transcript?.full_text ? (
        <pre style={{ whiteSpace: "pre-wrap", background: "#111", padding: 16, borderRadius: 8, fontSize: 14, lineHeight: 1.6 }}>
          {String(transcript.full_text)}
        </pre>
      ) : (
        <p style={{ color: "#666" }}>No transcript available.</p>
      )}

      {summaryContent && (
        <>
          <h2 style={{ marginTop: 32 }}>Summary</h2>
          {Object.entries(summaryContent).map(([key, values]) => {
            if (!Array.isArray(values) || values.length === 0) return null;
            return (
              <div key={key} style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, color: "#ccc", textTransform: "capitalize" }}>
                  {String(key).replace(/_/g, " ")}
                </h3>
                <ul style={{ paddingLeft: 20 }}>
                  {values.map((v, i) => (
                    <li key={i} style={{ color: "#999", fontSize: 14 }}>{String(v)}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

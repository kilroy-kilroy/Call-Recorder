import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { Nav } from "@/components/nav";

interface MeetingPageProps {
  params: Promise<{ id: string }>;
}

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { id } = await params;

  const [meetingRows, transcriptRows, summaryRows] = await Promise.all([
    sql`SELECT * FROM meetings WHERE id = ${id} LIMIT 1`,
    sql`SELECT * FROM transcripts WHERE meeting_id = ${id} LIMIT 1`,
    sql`SELECT * FROM summaries WHERE meeting_id = ${id} ORDER BY created_at DESC LIMIT 1`,
  ]);

  const meeting = meetingRows[0];
  if (!meeting) notFound();

  const transcript = transcriptRows[0] ?? null;
  const summary = summaryRows[0] ?? null;
  const summaryContent = summary?.content as {
    title?: string;
    key_points?: string[];
    decisions?: string[];
    action_items?: string[];
    follow_ups?: string[];
  } | null;

  const recordedAt = meeting.recorded_at instanceof Date
    ? meeting.recorded_at.toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit",
      })
    : String(meeting.recorded_at);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            &larr; Back to meetings
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold">
            {meeting.title ?? "Untitled Meeting"}
          </h1>
          <p className="text-sm text-zinc-400">
            {recordedAt}
            {meeting.duration_seconds
              ? ` · ${Math.floor(meeting.duration_seconds / 60)}m`
              : ""}
          </p>
          <span className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            meeting.status === "ready"
              ? "bg-green-900/30 text-green-400"
              : meeting.status === "error"
                ? "bg-red-900/30 text-red-400"
                : "bg-zinc-800 text-zinc-400"
          }`}>
            {meeting.status}
          </span>
        </div>

        {/* Transcript — primary view */}
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-medium">Transcript</h2>
          {transcript && transcript.full_text ? (
            <pre className="whitespace-pre-wrap rounded-lg bg-zinc-900/50 p-4 font-mono text-sm leading-relaxed text-zinc-300">
              {transcript.full_text}
            </pre>
          ) : (
            <p className="text-sm text-zinc-500">
              {meeting.status === "transcribing"
                ? "Transcribing..."
                : meeting.status === "error"
                  ? `Error: ${meeting.error_message ?? "Unknown error"}`
                  : "No transcript available."}
            </p>
          )}
        </section>

        {/* Summary */}
        {summaryContent && (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-medium">Summary</h2>
            <div className="space-y-3 rounded-lg border border-zinc-800 p-4">
              {summaryContent.key_points && summaryContent.key_points.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-zinc-300">Key Points</h4>
                  <ul className="space-y-1">
                    {summaryContent.key_points.map((p: string, i: number) => (
                      <li key={i} className="text-sm text-zinc-400">• {p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summaryContent.decisions && summaryContent.decisions.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-zinc-300">Decisions</h4>
                  <ul className="space-y-1">
                    {summaryContent.decisions.map((d: string, i: number) => (
                      <li key={i} className="text-sm text-zinc-400">• {d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summaryContent.action_items && summaryContent.action_items.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-zinc-300">Action Items</h4>
                  <ul className="space-y-1">
                    {summaryContent.action_items.map((a: string, i: number) => (
                      <li key={i} className="text-sm text-zinc-400">• {a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {summaryContent.follow_ups && summaryContent.follow_ups.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-zinc-300">Follow-ups</h4>
                  <ul className="space-y-1">
                    {summaryContent.follow_ups.map((f: string, i: number) => (
                      <li key={i} className="text-sm text-zinc-400">• {f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Error display */}
        {meeting.status === "error" && meeting.error_message && (
          <div className="mt-6 rounded-lg border border-red-900 bg-red-950/30 p-4">
            <p className="text-sm text-red-400">{String(meeting.error_message)}</p>
          </div>
        )}
      </main>
    </>
  );
}

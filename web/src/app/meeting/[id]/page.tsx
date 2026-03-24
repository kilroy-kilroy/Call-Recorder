import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Nav } from "@/components/nav";
import { TranscriptView } from "@/components/transcript-view";
import { SummaryPanel } from "@/components/summary-panel";
import { ReSummarizeForm } from "@/components/re-summarize-form";
import { ExportMenu } from "@/components/export-menu";
import { Badge } from "@/components/ui/badge";

interface MeetingPageProps {
  params: Promise<{ id: string }>;
}

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { id } = await params;

  const [meetingResult, transcriptResult, summariesResult] = await Promise.all([
    supabase.from("meetings").select("*").eq("id", id).single(),
    supabase.from("transcripts").select("*").eq("meeting_id", id).single(),
    supabase
      .from("summaries")
      .select("*")
      .eq("meeting_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const meeting = meetingResult.data;
  if (!meeting) notFound();

  const transcript = transcriptResult.data;
  const summaries = summariesResult.data ?? [];
  const latestSummary = summaries[0]?.content ?? null;

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

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              {meeting.title ?? "Untitled Meeting"}
            </h1>
            <p className="text-sm text-zinc-400">
              {new Date(meeting.recorded_at).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {meeting.duration_seconds
                ? ` · ${Math.floor(meeting.duration_seconds / 60)}m`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                meeting.status === "ready"
                  ? "default"
                  : meeting.status === "error"
                    ? "destructive"
                    : "secondary"
              }
            >
              {meeting.status}
            </Badge>
            <ExportMenu meetingId={id} />
          </div>
        </div>

        {/* Transcript — primary view, always visible */}
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-medium">Transcript</h2>
          {transcript ? (
            <TranscriptView
              segments={transcript.segments}
              fullText={transcript.full_text}
            />
          ) : (
            <p className="text-sm text-zinc-500">
              {meeting.status === "transcribing"
                ? "Transcribing..."
                : meeting.status === "error"
                  ? `Error: ${meeting.error_message}`
                  : "No transcript available."}
            </p>
          )}
        </section>

        {/* Summary — secondary, below transcript */}
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-medium">Summary</h2>
          <SummaryPanel summary={latestSummary} />
        </section>

        {/* Re-summarize */}
        {transcript && (
          <section>
            <h2 className="mb-3 text-lg font-medium">Re-summarize</h2>
            <ReSummarizeForm meetingId={id} />
          </section>
        )}

        {/* Error display */}
        {meeting.status === "error" && meeting.error_message && (
          <div className="mt-6 rounded-lg border border-red-900 bg-red-950/30 p-4">
            <p className="text-sm text-red-400">{meeting.error_message}</p>
          </div>
        )}
      </main>
    </>
  );
}

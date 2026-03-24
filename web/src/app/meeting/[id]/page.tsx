import { notFound } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Nav } from "@/components/nav";
import { Badge } from "@/components/ui/badge";
import { MeetingDetail } from "./meeting-detail";
import type { StructuredSummary } from "@/lib/summarize";

interface MeetingPageProps {
  params: Promise<{ id: string }>;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { id } = await params;

  const [meetingResult, transcriptResult, summaryResult] = await Promise.all([
    supabase
      .from("meetings")
      .select("id, title, recorded_at, duration_seconds, status")
      .eq("id", id)
      .single(),
    supabase
      .from("transcripts")
      .select("full_text")
      .eq("meeting_id", id)
      .single(),
    supabase
      .from("summaries")
      .select("content")
      .eq("meeting_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const meeting = meetingResult.data;
  if (!meeting) {
    notFound();
  }

  const transcript = transcriptResult.data?.full_text ?? null;
  const summary = (summaryResult.data?.content as StructuredSummary) ?? null;

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

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {meeting.title ?? "Untitled Meeting"}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {formatDate(meeting.recorded_at)}
              {meeting.duration_seconds
                ? ` · ${formatDuration(meeting.duration_seconds)}`
                : ""}
            </p>
          </div>
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
        </div>

        <MeetingDetail
          meetingId={meeting.id}
          transcript={transcript}
          initialSummary={summary}
        />
      </main>
    </>
  );
}

import { supabase } from "@/lib/supabase";
import { Nav } from "@/components/nav";
import { SearchBar } from "@/components/search-bar";
import { MeetingCard } from "@/components/meeting-card";

interface DashboardProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const { q } = await searchParams;

  let query = supabase
    .from("meetings")
    .select("id, title, recorded_at, duration_seconds, status")
    .order("recorded_at", { ascending: false })
    .limit(50);

  if (q) {
    // Search via transcript full text
    const { data: transcriptMatches } = await supabase
      .from("transcripts")
      .select("meeting_id")
      .textSearch("full_text", q);

    const meetingIds = transcriptMatches?.map((t) => t.meeting_id) ?? [];
    if (meetingIds.length > 0) {
      query = query.in("id", meetingIds);
    } else {
      // No matches — also try title search
      query = query.ilike("title", `%${q}%`);
    }
  }

  const { data: meetings } = await query;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Meetings</h1>
          <SearchBar />
        </div>
        <div className="space-y-3">
          {meetings && meetings.length > 0 ? (
            meetings.map((meeting) => (
              <MeetingCard
                key={meeting.id}
                id={meeting.id}
                title={meeting.title}
                recordedAt={meeting.recorded_at}
                durationSeconds={meeting.duration_seconds}
                status={meeting.status}
              />
            ))
          ) : (
            <p className="py-12 text-center text-zinc-500">
              {q
                ? "No meetings match your search."
                : "No meetings yet. Record one to get started."}
            </p>
          )}
        </div>
      </main>
    </>
  );
}

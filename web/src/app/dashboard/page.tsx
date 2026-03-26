import { sql } from "@/lib/db";
import { Nav } from "@/components/nav";
import { SearchBar } from "@/components/search-bar";
import { MeetingCard } from "@/components/meeting-card";

interface DashboardProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const { q } = await searchParams;

  let meetings;

  if (q) {
    // Search via transcript full text first
    const transcriptMatches = await sql`
      SELECT meeting_id FROM transcripts
      WHERE to_tsvector('english', full_text) @@ plainto_tsquery('english', ${q})
    `;

    const meetingIds = transcriptMatches.map((t) => t.meeting_id);

    if (meetingIds.length > 0) {
      meetings = await sql`
        SELECT id, title, recorded_at, duration_seconds, status
        FROM meetings
        WHERE id = ANY(${meetingIds})
        ORDER BY recorded_at DESC
        LIMIT 50
      `;
    } else {
      // No transcript matches — try title search
      meetings = await sql`
        SELECT id, title, recorded_at, duration_seconds, status
        FROM meetings
        WHERE title ILIKE ${'%' + q + '%'}
        ORDER BY recorded_at DESC
        LIMIT 50
      `;
    }
  } else {
    meetings = await sql`
      SELECT id, title, recorded_at, duration_seconds, status
      FROM meetings
      ORDER BY recorded_at DESC
      LIMIT 50
    `;
  }

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

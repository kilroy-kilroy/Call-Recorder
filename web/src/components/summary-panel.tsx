"use client";

import type { StructuredSummary } from "@/lib/summarize";

interface SummaryPanelProps {
  summary: StructuredSummary | null;
  loading?: boolean;
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-zinc-300">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-zinc-400">
            <span className="mt-1 block h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SummaryPanel({ summary, loading }: SummaryPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
        Generating summary...
      </div>
    );
  }

  if (!summary) {
    return (
      <p className="py-8 text-center text-zinc-500">
        No summary generated yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <SectionList title="Key Points" items={summary.key_points} />
      <SectionList title="Decisions" items={summary.decisions} />
      <SectionList title="Action Items" items={summary.action_items} />
      <SectionList title="Follow-ups" items={summary.follow_ups} />
    </div>
  );
}

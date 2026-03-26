import type { StructuredSummary } from "@/lib/summarize";

interface SummaryPanelProps {
  summary: StructuredSummary | null;
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1 text-sm font-medium text-zinc-300">{title}</h4>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-zinc-400">
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SummaryPanel({ summary }: SummaryPanelProps) {
  if (!summary) {
    return (
      <p className="text-sm text-zinc-500">No summary generated yet.</p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 p-4">
      <Section title="Key Points" items={summary.key_points} />
      <Section title="Decisions" items={summary.decisions} />
      <Section title="Action Items" items={summary.action_items} />
      <Section title="Follow-ups" items={summary.follow_ups} />
    </div>
  );
}

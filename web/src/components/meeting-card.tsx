import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface MeetingCardProps {
  id: string;
  title: string | null;
  recordedAt: string;
  durationSeconds: number | null;
  status: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const statusVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"
> = {
  ready: "default",
  processing: "secondary",
  transcribing: "secondary",
  summarizing: "secondary",
  error: "destructive",
};

export function MeetingCard({
  id,
  title,
  recordedAt,
  durationSeconds,
  status,
}: MeetingCardProps) {
  return (
    <Link href={`/meeting/${id}`}>
      <Card className="flex items-center justify-between p-4 transition-colors hover:bg-zinc-900">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {title ?? "Untitled Meeting"}
          </p>
          <p className="text-sm text-zinc-400">
            {formatDate(recordedAt)}
            {durationSeconds ? ` · ${formatDuration(durationSeconds)}` : ""}
          </p>
        </div>
        <Badge variant={statusVariant[status] ?? "outline"}>{status}</Badge>
      </Card>
    </Link>
  );
}

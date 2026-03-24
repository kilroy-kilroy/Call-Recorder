import type { StructuredSummary } from "./summarize";

export function formatForClipboard(
  contentType: "transcript" | "summary" | "both",
  transcript: string | null,
  summary: StructuredSummary | null
): string {
  const parts: string[] = [];

  if ((contentType === "transcript" || contentType === "both") && transcript) {
    parts.push(transcript);
  }

  if ((contentType === "summary" || contentType === "both") && summary) {
    const summaryMd = [
      `# ${summary.title}`,
      "",
      "## Key Points",
      ...summary.key_points.map((p) => `- ${p}`),
      "",
      "## Decisions",
      ...(summary.decisions.length > 0
        ? summary.decisions.map((d) => `- ${d}`)
        : ["- None"]),
      "",
      "## Action Items",
      ...(summary.action_items.length > 0
        ? summary.action_items.map((a) => `- ${a}`)
        : ["- None"]),
      "",
      "## Follow-ups",
      ...(summary.follow_ups.length > 0
        ? summary.follow_ups.map((f) => `- ${f}`)
        : ["- None"]),
    ].join("\n");
    parts.push(summaryMd);
  }

  return parts.join("\n\n---\n\n");
}

export function formatForDownload(
  contentType: "transcript" | "summary" | "both",
  format: "md" | "txt" | "json",
  transcript: string | null,
  summary: StructuredSummary | null,
  dateStr: string
): { filename: string; content: string; mimeType: string } {
  const ext = format;
  const filename = `meeting-${dateStr}.${ext}`;

  if (format === "json") {
    return {
      filename,
      content: JSON.stringify({ transcript, summary }, null, 2),
      mimeType: "application/json",
    };
  }

  const content = formatForClipboard(contentType, transcript, summary);
  const mimeType = format === "md" ? "text/markdown" : "text/plain";
  return { filename, content, mimeType };
}

export async function sendWebhook(
  config: { url: string; headers?: Record<string, string> },
  payload: { meetingId: string; transcript: string | null; summary: StructuredSummary | null }
): Promise<void> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.headers ?? {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook failed (${response.status})`);
  }
}

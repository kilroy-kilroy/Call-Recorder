import { generateText } from "ai";

export interface StructuredSummary {
  title: string;
  key_points: string[];
  decisions: string[];
  action_items: string[];
  follow_ups: string[];
}

const DEFAULT_PROMPT_TEMPLATE = `You are a meeting summarizer. Given the following meeting transcript, produce a structured summary in JSON format with these fields:
- title: A short descriptive title for the meeting (5-10 words)
- key_points: Array of 3-5 key points discussed
- decisions: Array of decisions made (empty array if none)
- action_items: Array of action items with owners when identifiable
- follow_ups: Array of follow-up items or next steps

Respond ONLY with valid JSON, no markdown or explanation.

Key Points and Action Items from the transcript:

Transcript:
`;

export function buildSummaryPrompt(
  transcriptText: string,
  customPrompt?: string
): string {
  if (customPrompt) {
    return `${customPrompt}\n\nTranscript:\n${transcriptText}`;
  }
  return `${DEFAULT_PROMPT_TEMPLATE}${transcriptText}`;
}

export function parseSummaryResponse(raw: string): StructuredSummary {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);
  return {
    title: parsed.title ?? "Untitled Meeting",
    key_points: parsed.key_points ?? [],
    decisions: parsed.decisions ?? [],
    action_items: parsed.action_items ?? [],
    follow_ups: parsed.follow_ups ?? [],
  };
}

export async function generateSummary(
  transcriptText: string,
  customPrompt?: string
): Promise<{ structured: StructuredSummary; rawText: string; promptUsed: string }> {
  const prompt = buildSummaryPrompt(transcriptText, customPrompt);

  const { text } = await generateText({
    model: "anthropic/claude-haiku-4.5" as unknown as Parameters<typeof generateText>[0]["model"],
    prompt,
  });

  const structured = parseSummaryResponse(text);
  const rawText = [
    `# ${structured.title}`,
    "",
    "## Key Points",
    ...structured.key_points.map((p) => `- ${p}`),
    "",
    "## Decisions",
    ...structured.decisions.map((d) => `- ${d}`),
    "",
    "## Action Items",
    ...structured.action_items.map((a) => `- ${a}`),
    "",
    "## Follow-ups",
    ...structured.follow_ups.map((f) => `- ${f}`),
  ].join("\n");

  return { structured, rawText, promptUsed: customPrompt ?? "default" };
}

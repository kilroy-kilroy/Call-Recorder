import { describe, it, expect } from "vitest";
import { buildSummaryPrompt, parseSummaryResponse } from "@/lib/summarize";

describe("buildSummaryPrompt", () => {
  it("builds a structured prompt from transcript text", () => {
    const prompt = buildSummaryPrompt("Speaker 1: Hello\nSpeaker 2: Hi");
    expect(prompt).toContain("Speaker 1: Hello");
    expect(prompt).toContain("Key Points");
    expect(prompt).toContain("Action Items");
  });

  it("uses custom prompt when provided", () => {
    const prompt = buildSummaryPrompt(
      "Speaker 1: Hello",
      "Summarize as a sales recap"
    );
    expect(prompt).toContain("Summarize as a sales recap");
    expect(prompt).toContain("Speaker 1: Hello");
  });
});

describe("parseSummaryResponse", () => {
  it("parses structured JSON from LLM response", () => {
    const raw = JSON.stringify({
      title: "Weekly Sync",
      key_points: ["Discussed roadmap"],
      decisions: ["Ship by Friday"],
      action_items: ["Tim to review PR"],
      follow_ups: ["Schedule next sync"],
    });
    const result = parseSummaryResponse(raw);
    expect(result.title).toBe("Weekly Sync");
    expect(result.key_points).toHaveLength(1);
    expect(result.action_items[0]).toBe("Tim to review PR");
  });
});

import { describe, it, expect, vi } from "vitest";
import { formatForClipboard, formatForDownload, sendWebhook } from "@/lib/export-adapters";

describe("formatForClipboard", () => {
  it("formats transcript with speaker labels", () => {
    const result = formatForClipboard(
      "transcript",
      "Speaker 1: Hello\nSpeaker 2: Hi",
      null
    );
    expect(result).toContain("Speaker 1: Hello");
  });

  it("formats summary as markdown", () => {
    const summary = {
      title: "Test Meeting",
      key_points: ["Point 1"],
      decisions: [],
      action_items: ["Do thing"],
      follow_ups: [],
    };
    const result = formatForClipboard("summary", null, summary);
    expect(result).toContain("# Test Meeting");
    expect(result).toContain("- Point 1");
    expect(result).toContain("- Do thing");
  });
});

describe("formatForDownload", () => {
  it("returns content with correct filename for markdown", () => {
    const result = formatForDownload("transcript", "md", "Hello world", null, "2026-03-24");
    expect(result.filename).toContain("2026-03-24");
    expect(result.filename.endsWith(".md")).toBe(true);
    expect(result.content).toContain("Hello world");
  });
});

describe("sendWebhook", () => {
  const mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);

  it("POSTs meeting data to configured URL with headers", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await sendWebhook(
      { url: "https://hook.example.com/ingest", headers: { "X-Token": "abc" } },
      { meetingId: "123", transcript: "Hello", summary: null }
    );

    expect(mockFetch).toHaveBeenCalledWith("https://hook.example.com/ingest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Token": "abc",
      },
      body: expect.stringContaining('"meetingId":"123"'),
    });
  });
});

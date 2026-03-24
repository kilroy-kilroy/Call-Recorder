import { describe, it, expect, vi, beforeAll } from "vitest";

// Set env var before import
vi.stubEnv("DEEPGRAM_API_KEY", "test-key");

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { transcribeAudio } from "@/lib/deepgram";

describe("transcribeAudio", () => {
  it("sends audio URL to Deepgram with correct params and returns segments + full text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: {
          channels: [
            {
              alternatives: [
                {
                  paragraphs: {
                    paragraphs: [
                      {
                        speaker: 0,
                        sentences: [
                          { text: "Hello there.", start: 0.5, end: 1.2 },
                        ],
                      },
                      {
                        speaker: 1,
                        sentences: [
                          { text: "Hi, how are you?", start: 1.5, end: 2.8 },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      }),
    });

    const result = await transcribeAudio("https://example.com/audio.m4a");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("api.deepgram.com");
    expect(options.body).toContain("https://example.com/audio.m4a");

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toEqual({
      speaker: "Speaker 1",
      text: "Hello there.",
      start_time: 0.5,
      end_time: 1.2,
    });
    expect(result.segments[1]).toEqual({
      speaker: "Speaker 2",
      text: "Hi, how are you?",
      start_time: 1.5,
      end_time: 2.8,
    });
    expect(result.fullText).toContain("Speaker 1: Hello there.");
    expect(result.fullText).toContain("Speaker 2: Hi, how are you?");
  });
});

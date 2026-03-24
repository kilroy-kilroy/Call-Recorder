export interface TranscriptSegment {
  speaker: string;
  text: string;
  start_time: number;
  end_time: number;
}

export interface TranscriptionResult {
  segments: TranscriptSegment[];
  fullText: string;
}

export async function transcribeAudio(
  audioUrl: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("Missing DEEPGRAM_API_KEY");

  const response = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&diarize=true&paragraphs=true&punctuate=true",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: audioUrl }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Deepgram API error (${response.status}): ${text}`);
  }

  const data = await response.json();
  const paragraphs =
    data.results.channels[0].alternatives[0].paragraphs.paragraphs;

  const segments: TranscriptSegment[] = paragraphs.flatMap(
    (para: { speaker: number; sentences: { text: string; start: number; end: number }[] }) =>
      para.sentences.map((sentence) => ({
        speaker: `Speaker ${para.speaker + 1}`,
        text: sentence.text,
        start_time: sentence.start,
        end_time: sentence.end,
      }))
  );

  const fullText = segments
    .map((s) => `${s.speaker}: ${s.text}`)
    .join("\n");

  return { segments, fullText };
}

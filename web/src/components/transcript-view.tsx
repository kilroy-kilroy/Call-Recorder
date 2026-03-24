"use client";

import { useState } from "react";

interface TranscriptViewProps {
  fullText: string;
}

export function TranscriptView({ fullText }: TranscriptViewProps) {
  const [expanded, setExpanded] = useState(false);

  if (!fullText) {
    return (
      <p className="py-8 text-center text-zinc-500">
        No transcript available yet.
      </p>
    );
  }

  const lines = fullText.split("\n");
  const shouldTruncate = lines.length > 60;
  const displayText = shouldTruncate && !expanded
    ? lines.slice(0, 60).join("\n") + "\n..."
    : fullText;

  return (
    <div className="space-y-3">
      <pre className="whitespace-pre-wrap rounded-lg bg-zinc-900/50 p-4 font-mono text-sm leading-relaxed text-zinc-300">
        {displayText}
      </pre>
      {shouldTruncate && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          {expanded ? "Show less" : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

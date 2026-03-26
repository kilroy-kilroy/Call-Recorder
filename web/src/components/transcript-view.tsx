"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Segment {
  speaker: string;
  text: string;
  start_time: number;
  end_time: number;
}

interface TranscriptViewProps {
  segments: Segment[];
  fullText: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TranscriptView({ segments, fullText }: TranscriptViewProps) {
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  async function copyTranscript() {
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filtered = search
    ? segments.filter((s) =>
        s.text.toLowerCase().includes(search.toLowerCase())
      )
    : segments;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Input
          type="search"
          placeholder="Search transcript..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="outline" size="sm" onClick={copyTranscript}>
          {copied ? "Copied!" : "Copy Transcript"}
        </Button>
      </div>
      <div className="space-y-3">
        {filtered.map((segment, i) => (
          <div key={i} className="flex gap-3">
            <span className="shrink-0 font-mono text-xs text-zinc-500 pt-1 w-12">
              {formatTime(segment.start_time)}
            </span>
            <div>
              <span className="text-sm font-medium text-zinc-300">
                {segment.speaker}
              </span>
              <p className="text-sm text-zinc-400">{segment.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

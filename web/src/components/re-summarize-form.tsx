"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { StructuredSummary } from "@/lib/summarize";

interface ReSummarizeFormProps {
  meetingId: string;
  onSummaryGenerated: (summary: StructuredSummary) => void;
  onLoadingChange: (loading: boolean) => void;
}

export function ReSummarizeForm({
  meetingId,
  onSummaryGenerated,
  onLoadingChange,
}: ReSummarizeFormProps) {
  const [customPrompt, setCustomPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    onLoadingChange(true);

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId,
          customPrompt: customPrompt.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to generate summary");
      }

      const { summary } = await res.json();
      onSummaryGenerated(summary.content);
      setCustomPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      onLoadingChange(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Textarea
        placeholder="Custom prompt (optional) — leave blank for default summary"
        value={customPrompt}
        onChange={(e) => setCustomPrompt(e.target.value)}
        className="min-h-[80px]"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" variant="secondary" size="sm">
        Re-summarize
      </Button>
    </form>
  );
}

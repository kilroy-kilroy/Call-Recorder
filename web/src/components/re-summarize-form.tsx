"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ReSummarizeFormProps {
  meetingId: string;
}

export function ReSummarizeForm({ meetingId }: ReSummarizeFormProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId,
        customPrompt: prompt || undefined,
      }),
    });

    setLoading(false);
    setPrompt("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Textarea
        placeholder='e.g., "Summarize as a sales call recap" or leave blank for default summary'
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
      />
      <Button type="submit" size="sm" disabled={loading}>
        {loading ? "Generating..." : "Re-summarize"}
      </Button>
    </form>
  );
}

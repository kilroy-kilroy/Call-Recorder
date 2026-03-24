"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TranscriptView } from "@/components/transcript-view";
import { SummaryPanel } from "@/components/summary-panel";
import { ReSummarizeForm } from "@/components/re-summarize-form";
import { ExportMenu } from "@/components/export-menu";
import type { StructuredSummary } from "@/lib/summarize";

interface MeetingDetailProps {
  meetingId: string;
  transcript: string | null;
  initialSummary: StructuredSummary | null;
}

export function MeetingDetail({
  meetingId,
  transcript,
  initialSummary,
}: MeetingDetailProps) {
  const [summary, setSummary] = useState<StructuredSummary | null>(initialSummary);
  const [summaryLoading, setSummaryLoading] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <ExportMenu meetingId={meetingId} />
      </div>

      <Tabs defaultValue="transcript">
        <TabsList>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="mt-4">
          <TranscriptView fullText={transcript ?? ""} />
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <div className="space-y-6">
            <SummaryPanel summary={summary} loading={summaryLoading} />
            <div className="border-t border-zinc-800 pt-4">
              <h3 className="mb-3 text-sm font-medium text-zinc-400">
                Re-generate summary
              </h3>
              <ReSummarizeForm
                meetingId={meetingId}
                onSummaryGenerated={setSummary}
                onLoadingChange={setSummaryLoading}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

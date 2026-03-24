"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface ExportMenuProps {
  meetingId: string;
}

export function ExportMenu({ meetingId }: ExportMenuProps) {
  const [busy, setBusy] = useState(false);

  async function handleCopy(contentType: "transcript" | "summary" | "both") {
    setBusy(true);
    try {
      const res = await fetch("/api/export/clipboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, contentType }),
      });
      if (!res.ok) throw new Error("Export failed");
      const { text } = await res.json();
      await navigator.clipboard.writeText(text);
    } catch {
      // Silently fail — could add toast here
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(format: "md" | "txt" | "json") {
    setBusy(true);
    try {
      const res = await fetch("/api/export/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, contentType: "both", format }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] ?? `meeting.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy}
        render={<Button variant="outline" size="sm" />}
      >
        {busy ? "Exporting..." : "Export"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Copy to clipboard</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handleCopy("transcript")}>
          Transcript only
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleCopy("summary")}>
          Summary only
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleCopy("both")}>
          Both
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Download file</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handleDownload("md")}>
          Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload("txt")}>
          Plain text (.txt)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload("json")}>
          JSON (.json)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

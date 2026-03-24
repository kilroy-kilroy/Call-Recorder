"use client";

import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Destination {
  id: string;
  name: string;
  type: string;
  config: {
    url?: string;
    headers?: Record<string, string>;
  };
  created_at: string;
}

export default function SettingsPage() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("");

  async function loadDestinations() {
    try {
      const res = await fetch("/api/settings/destinations");
      if (!res.ok) throw new Error("Failed to load destinations");
      const data = await res.json();
      setDestinations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load destinations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDestinations();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    let parsedHeaders: Record<string, string> | undefined;
    if (headers.trim()) {
      try {
        parsedHeaders = JSON.parse(headers);
      } catch {
        setError("Headers must be valid JSON");
        setSubmitting(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/settings/destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: "webhook",
          config: { url, headers: parsedHeaders },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to add destination");
      }

      setName("");
      setUrl("");
      setHeaders("");
      await loadDestinations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add destination");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    try {
      const res = await fetch(`/api/settings/destinations?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to remove destination");
      }

      setDestinations((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove destination");
    }
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Settings</h1>

        {error && (
          <p className="mb-4 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <section className="mb-8">
          <h2 className="mb-4 text-lg font-medium">Webhook Destinations</h2>

          {loading ? (
            <p className="text-sm text-zinc-500">Loading...</p>
          ) : destinations.length === 0 ? (
            <p className="text-sm text-zinc-500">No webhook destinations configured.</p>
          ) : (
            <div className="space-y-3">
              {destinations.map((dest) => (
                <Card key={dest.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle>{dest.name}</CardTitle>
                        <CardDescription>{dest.config.url}</CardDescription>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemove(dest.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Add Webhook Destination</CardTitle>
            <CardDescription>
              Configure a URL to receive meeting transcripts and summaries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="dest-name" className="text-sm font-medium">
                  Name
                </label>
                <Input
                  id="dest-name"
                  placeholder="e.g. Slack Webhook"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="dest-url" className="text-sm font-medium">
                  URL
                </label>
                <Input
                  id="dest-url"
                  type="url"
                  placeholder="https://example.com/webhook"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="dest-headers" className="text-sm font-medium">
                  Headers{" "}
                  <span className="font-normal text-zinc-500">(optional, JSON)</span>
                </label>
                <Textarea
                  id="dest-headers"
                  placeholder={'{"Authorization": "Bearer token"}'}
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Adding..." : "Add Webhook Destination"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  );
}

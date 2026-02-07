"use client";

import { useState, FormEvent } from "react";
import { Nav, Footer } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type FeedbackType = "general" | "bug" | "feature";

const TYPE_LABELS: Record<FeedbackType, { label: string; description: string }> = {
  general: { label: "General", description: "General feedback or thoughts" },
  bug: { label: "Bug Report", description: "Something isn't working right" },
  feature: { label: "Feature Request", description: "An idea for improvement" },
};

export default function FeedbackPage() {
  const [type, setType] = useState<FeedbackType>("general");
  const [content, setContent] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!content.trim()) return;

    setSubmitting(true);
    setResult(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey.trim()) {
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      }

      const res = await fetch("/api/v1/feedback", {
        method: "POST",
        headers,
        body: JSON.stringify({ type, content: content.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ success: false, message: data.error ?? `Error ${res.status}` });
      } else {
        setResult({ success: true, message: data.message ?? "Feedback submitted!" });
        setContent("");
      }
    } catch {
      setResult({ success: false, message: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />

      <main className="flex-1 mx-auto w-full max-w-2xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Feedback</h1>
          <p className="text-muted-foreground">
            Help us improve CoolClawGames. Report bugs, suggest features, or share your thoughts.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Submit Feedback</CardTitle>
            <CardDescription>
              All feedback is welcome. Optionally provide your agent API key to associate your feedback with your agent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-5">
              {/* Type selector */}
              <div>
                <label className="text-sm font-medium mb-2 block">Type</label>
                <div className="flex gap-2">
                  {(Object.entries(TYPE_LABELS) as [FeedbackType, { label: string; description: string }][]).map(
                    ([key, { label }]) => (
                      <Button
                        key={key}
                        type="button"
                        variant={type === key ? "default" : "outline"}
                        size="sm"
                        onClick={() => setType(key)}
                      >
                        {label}
                      </Button>
                    )
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {TYPE_LABELS[type].description}
                </p>
              </div>

              {/* Content */}
              <div>
                <label htmlFor="feedback-content" className="text-sm font-medium mb-2 block">
                  Your Feedback
                </label>
                <textarea
                  id="feedback-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Tell us what you think..."
                  rows={5}
                  maxLength={2000}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                />
                <p className="text-xs text-muted-foreground mt-1 text-right">
                  {content.length}/2000
                </p>
              </div>

              {/* Optional API Key */}
              <div>
                <label htmlFor="feedback-apikey" className="text-sm font-medium mb-2 block">
                  Agent API Key <Badge variant="secondary" className="ml-1">Optional</Badge>
                </label>
                <input
                  id="feedback-apikey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Your agent API key (optional)"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  If provided, your feedback will be associated with your agent name.
                </p>
              </div>

              {/* Submit */}
              <Button type="submit" disabled={submitting || !content.trim()} className="w-full">
                {submitting ? "Submitting..." : "Submit Feedback"}
              </Button>

              {/* Result */}
              {result && (
                <div
                  className={`rounded-md px-4 py-3 text-sm ${
                    result.success
                      ? "bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20"
                      : "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20"
                  }`}
                >
                  {result.message}
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}

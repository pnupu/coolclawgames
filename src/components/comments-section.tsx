"use client";

import { useState, useEffect, useCallback } from "react";

interface Comment {
  id: string;
  agent_name: string;
  content: string;
  created_at: string;
}

interface CommentsSectionProps {
  matchId: string;
  isFinished: boolean;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function CommentsSection({ matchId, isFinished }: CommentsSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/matches/${matchId}/comments?limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      setComments(data.comments ?? []);
      setTotal(data.total ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    fetchComments();
    // Poll for new comments every 30 seconds
    const interval = setInterval(fetchComments, 30_000);
    return () => clearInterval(interval);
  }, [fetchComments]);

  if (!isFinished) return null;

  return (
    <div className="border-t border-border">
      <div className="px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Agent Comments {total > 0 && <span className="text-foreground">({total})</span>}
        </h3>

        {loading ? (
          <p className="text-xs text-muted-foreground">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No comments yet. Agents can post comments on finished matches via the API.
          </p>
        ) : (
          <div className="space-y-2.5 max-h-60 overflow-y-auto">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="flex gap-2.5 text-sm"
              >
                <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                  {comment.agent_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold truncate">
                      {comment.agent_name}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatTimeAgo(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                    {comment.content}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

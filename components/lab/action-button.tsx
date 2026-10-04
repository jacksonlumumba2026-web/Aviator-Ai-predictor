"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../ui/button";

/** POSTs to an API route, refreshes server data, and surfaces errors inline. */
export function ActionButton({
  url,
  method = "POST",
  body,
  children,
  variant = "secondary",
  confirm: confirmText,
  pendingLabel,
  onDone,
  size,
}: {
  url: string;
  method?: "POST" | "DELETE";
  body?: unknown;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  confirm?: string;
  pendingLabel?: string;
  onDone?: (data: unknown) => void;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (confirmText && !window.confirm(confirmText)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      onDone?.(data);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant={variant} size={size} loading={loading} onClick={run}>
        {loading && pendingLabel ? pendingLabel : children}
      </Button>
      {error && (
        <p role="alert" className="max-w-xs text-xs text-bad-ink">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { Button } from "../ui/button";

export function AdminAccess({ mode, signedIn }: { mode: "password" | "open-dev" | "locked"; signedIn: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mode === "open-dev")
    return (
      <p className="text-sm text-warn">
        Development mode: <code className="font-mono">ADMIN_PASSWORD</code> is not set, so write actions are open. Set it before deploying —
        production refuses writes without it.
      </p>
    );
  if (mode === "locked")
    return <p className="text-sm text-bad-ink">Writes are disabled: set ADMIN_PASSWORD (and SESSION_SECRET) in the server environment.</p>;

  if (signedIn)
    return (
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-good-ink">Signed in as admin (session expires after 12 h).</p>
        <Button
          size="sm"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.refresh();
          }}
        >
          <LogOut className="size-3.5" /> Sign out
        </Button>
      </div>
    );

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const body = await res.json().catch(() => ({}));
        setLoading(false);
        if (!res.ok) return setError(body.error || "Sign-in failed");
        setPassword("");
        router.refresh();
      }}
    >
      <label className="sr-only" htmlFor="admin-pw">
        Admin password
      </label>
      <input
        id="admin-pw"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Admin password"
        className="h-10 flex-1 rounded-xl border border-line-strong bg-white/[0.03] px-3 text-sm text-ink outline-none focus:border-brand"
      />
      <Button type="submit" variant="primary" loading={loading}>
        <KeyRound className="size-4" /> Sign in
      </Button>
      {error && (
        <p role="alert" className="text-sm text-bad-ink sm:self-center">
          {error}
        </p>
      )}
    </form>
  );
}

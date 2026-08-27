"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { AuthAudience } from "@/types/auth";

interface Props {
  audience: AuthAudience;
  /** Where a successful login lands when there is no `?next=` in the URL. */
  defaultRedirect: string;
}

/**
 * Shared between /login (admin) and /portal/login (requester) - the only
 * difference between the two audiences is which endpoint they authenticate
 * against and where they land, both passed in as props.
 *
 * Posts to THIS app's own `/api/auth/login` Route Handler, never to the API
 * directly - the Route Handler is what turns the response into an httpOnly
 * cookie (D-4). `next` is read from `window.location` inside the handler,
 * not via `useSearchParams()`, so this component needs no Suspense boundary.
 */
export function LoginForm({ audience, defaultRedirect }: Props) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience, username, password }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Invalid username or password");
      }

      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") ? next : defaultRedirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setIsBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="username" className="mb-1.5 block text-[12.5px] font-medium text-muted">
          Username
        </label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          disabled={isBusy}
          className="w-full rounded-control border border-line-admin bg-surface px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:text-faint"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-[12.5px] font-medium text-muted">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          disabled={isBusy}
          className="w-full rounded-control border border-line-admin bg-surface px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:text-faint"
        />
      </div>

      {error && (
        <div className="rounded-control border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-[12.5px] text-ink">
          {error}
        </div>
      )}

      <Button type="submit" disabled={isBusy || !username || !password} className="mt-1 w-full">
        {isBusy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

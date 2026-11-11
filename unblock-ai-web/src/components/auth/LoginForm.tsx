"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { messageForAuthError } from "@/lib/auth/auth-error-message";
import { NEXT_QUERY_PARAMETER, RoutePath, safeRedirectPath } from "@/lib/routing/route-path";

const INPUT_CLASS =
  "w-full rounded-control border border-line-admin bg-surface px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:text-faint";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsBusy(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const payload: { code?: string } | null = await response.json().catch(() => null);
        setError(messageForAuthError(payload?.code));
        setIsBusy(false);
        return;
      }

      const next = new URLSearchParams(window.location.search).get(NEXT_QUERY_PARAMETER);
      router.replace(safeRedirectPath(next, RoutePath.ACCOUNT));
      router.refresh();
    } catch {
      setError(messageForAuthError(undefined));
      setIsBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-[12.5px] font-medium text-muted">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          autoFocus
          disabled={isBusy}
          className={INPUT_CLASS}
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
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          disabled={isBusy}
          className={INPUT_CLASS}
        />
      </div>

      {error && (
        <div role="alert" className="rounded-control border border-danger/40 bg-danger/5 px-3.5 py-2.5 text-[12.5px] text-ink">
          {error}
        </div>
      )}

      <Button type="submit" disabled={isBusy || !email || !password} className="mt-1 w-full">
        {isBusy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

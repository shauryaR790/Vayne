"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { loginUser, registerUser } from "@/lib/api";
import { setAuthSession } from "@/lib/auth";
import { formatAuthError } from "@/lib/user-messages";

type AuthMode = "login" | "register";

function resolveInitialMode(searchParams: ReturnType<typeof useSearchParams>): AuthMode {
  const mode = searchParams.get("mode");
  if (mode === "register" || searchParams.get("register") === "1") return "register";
  return "login";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>(() => resolveInitialMode(searchParams));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next: AuthMode) {
    setMode(next);
    setError("");
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session =
        mode === "login"
          ? await loginUser(email, password)
          : await registerUser({ email, password, name, team_name: teamName });
      setAuthSession(session.access_token, {
        email: session.email,
        name: session.name,
        team_id: session.team_id,
        team_name: session.team_name,
        workspace_id: session.workspace_id,
      });
      router.replace("/");
    } catch (err) {
      setError(formatAuthError(err, mode));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a0a0b] px-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#111113] p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold text-white mb-1">
          {mode === "login" ? "Sign in to VANE" : "Create your account"}
        </h1>
        <p className="text-sm text-white/60 mb-6">
          {mode === "login"
            ? "Secure access to your team's investigation workspace."
            : "Create a private workspace for your security team. Investigations and API keys stay within your organization."}
        </p>

        <form className="space-y-4" onSubmit={onSubmit}>
          {mode === "register" ? (
            <>
              <label className="block text-sm text-white/70">
                Name
                <input
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Your name"
                />
              </label>
              <label className="block text-sm text-white/70">
                Team name
                <input
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Security Operations"
                />
              </label>
            </>
          ) : null}

          <label className="block text-sm text-white/70">
            Email
            <input
              className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="block text-sm text-white/70">
            Password
            <input
              className="mt-1 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          {error ? (
            <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm leading-relaxed text-red-300">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-white text-black py-2.5 font-medium disabled:opacity-60"
          >
            {busy ? (mode === "login" ? "Signing in…" : "Creating account…") : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        {mode === "login" ? (
          <div className="mt-4 space-y-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => switchMode("register")}
              className="w-full rounded-md border border-white/20 bg-transparent py-2.5 text-sm font-medium text-white transition-colors hover:border-white/40 hover:bg-white/5 disabled:opacity-60"
            >
              Create account
            </button>
            <p className="text-center text-sm text-white/60">
              New to VANE?{" "}
              <button
                type="button"
                className="font-medium text-white underline underline-offset-2 hover:text-white/90"
                onClick={() => switchMode("register")}
              >
                Register
              </button>
            </p>
          </div>
        ) : (
          <p className="mt-4 text-center text-sm text-white/60">
            Already have an account?{" "}
            <button
              type="button"
              className="font-medium text-white underline underline-offset-2 hover:text-white/90"
              onClick={() => switchMode("login")}
            >
              Sign in
            </button>
          </p>
        )}

        <p className="mt-6 text-center text-xs text-white/40">
          <Link href="/" className="hover:text-white/60">
            Continue as guest
          </Link>
        </p>
      </div>
    </main>
  );
}

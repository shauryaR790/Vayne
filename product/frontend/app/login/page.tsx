"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginUser, registerUser } from "@/lib/api";
import { setAuthSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a0a0b] px-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#111113] p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold text-white mb-1">
          {mode === "login" ? "Sign in to VANE" : "Create your team"}
        </h1>
        <p className="text-sm text-white/60 mb-6">
          Team accounts isolate investigations, API keys, and shared workspace data.
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

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-white text-black py-2.5 font-medium disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 text-sm text-white/60 hover:text-white"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Need a team account? Register" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}

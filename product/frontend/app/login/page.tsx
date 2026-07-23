import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#0a0a0b] px-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#111113] p-8 shadow-2xl">
            <p className="text-sm text-white/60">Loading sign in…</p>
          </div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

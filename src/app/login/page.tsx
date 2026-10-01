"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WmxWordmark } from "@/components/wmx-wordmark";
import { signIn, type LoginResult } from "./actions";
import { GoogleButton } from "./GoogleButton";

const initialState: LoginResult = { error: null };

function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm"
    >
      <WmxWordmark className="lg:hidden" />
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Client Communications</h1>
        <p className="mt-1 text-sm text-zinc-500">Sign in to continue.</p>
      </div>

      {reason === "not-on-team" && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          That account signed in, but its email isn&apos;t on the team list. Ask an admin to add
          you under Team, then sign in again.
        </p>
      )}
      {reason === "oauth-failed" && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Google sign-in didn&apos;t finish. Try again, or sign in with your email and password.
        </p>
      )}

      <GoogleButton />
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        or
        <span className="h-px flex-1 bg-zinc-200" />
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
          Email
        </label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-xs text-zinc-500 underline underline-offset-4 hover:text-zinc-900"
          >
            Forgot password?
          </Link>
        </div>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex flex-1 lg:grid lg:grid-cols-2">
      <div className="hidden h-full flex-col justify-between bg-[#1C2B47] p-10 lg:flex">
        <WmxWordmark variant="light" />
        <p className="max-w-xs text-sm text-white/70">
          Every client call, text and message — who owns it, how long it’s waited, and when it escalates.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}

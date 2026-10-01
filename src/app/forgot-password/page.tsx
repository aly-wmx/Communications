"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WmxWordmark } from "@/components/wmx-wordmark";
import { requestPasswordReset, type ForgotPasswordResult } from "./actions";

const initialState: ForgotPasswordResult = { status: "idle", error: null };

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <WmxWordmark />

        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Reset your password</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Enter your email and we&apos;ll send a link to reset it.
          </p>
        </div>

        {state.status === "sent" ? (
          <p className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">
            If that email has an account, a reset link is on its way. Check your inbox.
          </p>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
                Email
              </label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>

            {state.status === "error" && (
              <p className="text-sm text-red-600" role="alert">
                {state.error}
              </p>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}

        <p className="text-sm text-zinc-500">
          <Link href="/login" className="underline underline-offset-4 hover:text-zinc-900">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

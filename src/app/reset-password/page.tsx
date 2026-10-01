"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WmxWordmark } from "@/components/wmx-wordmark";
import { updatePassword, type ResetPasswordResult } from "./actions";

const initialState: ResetPasswordResult = { error: null };

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [state, formAction, pending] = useActionState(updatePassword, initialState);

  useEffect(() => {
    // The reset link Supabase emails carries the recovery session in the URL;
    // createClient() here (the browser client) picks it up automatically on
    // instantiation and — via @supabase/ssr's cookie-based storage — makes it
    // visible to the server action below too.
    //
    // Specifically watching for the PASSWORD_RECOVERY event, rather than
    // just calling getSession() once, matters: getSession() alone would
    // also return true for an unrelated, already-logged-in session already
    // sitting in the browser, letting this page "work" even without a
    // valid reset link actually being clicked.
    const supabase = createClient();

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setHasSession(true);
        setChecking(false);
      }
    });

    // Fallback for the case where the recovery session was already
    // established (and the event already fired) before this listener
    // was attached.
    supabase.auth.getSession().then(({ data }) => {
      setHasSession((current) => current || !!data.session);
      setChecking(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Gated on !pending, not just `submitted` — without it, this fires the
    // instant the button is clicked (state is still the pre-submit initial
    // value at that point), redirecting before the action has even
    // returned a result. That bug silently hid real update failures and
    // is very likely why an earlier password reset didn't actually save.
    if (submitted && !pending && state.error === null) {
      router.push("/dashboard");
    }
  }, [submitted, pending, state, router]);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <WmxWordmark />
        <h1 className="text-lg font-semibold text-zinc-900">Set a new password</h1>

        {checking && <p className="text-sm text-zinc-500">Checking your reset link…</p>}

        {!checking && !hasSession && (
          <div className="space-y-3">
            <p className="text-sm text-red-600">
              This link is invalid or has expired.
            </p>
            <Link
              href="/forgot-password"
              className="text-sm underline underline-offset-4 hover:text-zinc-900"
            >
              Request a new reset link
            </Link>
          </div>
        )}

        {!checking && hasSession && (
          <form action={formAction} onSubmit={() => setSubmitted(true)} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
                New password
              </label>
              <Input id="password" name="password" type="password" required autoComplete="new-password" />
            </div>
            <div className="space-y-1">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-700">
                Confirm new password
              </label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
              />
            </div>

            {state.error && (
              <p className="text-sm text-red-600" role="alert">
                {state.error}
              </p>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

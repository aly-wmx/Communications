"use server";

import { siteUrl } from "@/lib/comms/notify-store";
import { createClient } from "@/lib/supabase/server";
import { emailSchema } from "@/lib/validation/auth";

export interface ForgotPasswordResult {
  status: "idle" | "sent" | "error";
  error: string | null;
}

export async function requestPasswordReset(
  _prev: ForgotPasswordResult,
  formData: FormData,
): Promise<ForgotPasswordResult> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", error: "Enter a valid email address." };
  }

  // Fixed site address, never the request's Host header (which a caller can set).
  const origin = siteUrl();

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/reset-password`,
  });

  // Always report success, whether or not the email actually belongs to an
  // account — confirming which emails exist is an account-enumeration leak.
  return { status: "sent", error: null };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { newPasswordSchema } from "@/lib/validation/auth";
import { isPwnedPassword } from "@/lib/pwned";

export interface ResetPasswordResult {
  error: string | null;
}

export async function updatePassword(
  _prev: ResetPasswordResult,
  formData: FormData,
): Promise<ResetPasswordResult> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (await isPwnedPassword(parsed.data.password)) {
    return { error: "That password has appeared in a known data breach. Please choose a different one." };
  }

  const supabase = await createClient();

  // Relies on the recovery session that Supabase's browser client establishes
  // from the reset-link URL (see reset-password/page.tsx) — @supabase/ssr's
  // cookie-based storage means that session is already visible here by the
  // time this action runs, without us handling any tokens ourselves.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: "This reset link has expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: "Couldn't update your password. Try requesting a new reset link." };
  }

  return { error: null };
}

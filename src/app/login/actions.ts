"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export interface LoginResult {
  error: string | null;
}

export async function signIn(
  _prev: LoginResult,
  formData: FormData,
): Promise<LoginResult> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Enter both an email and a password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase's own messages here are standard and safe to show as-is
    // ("Invalid login credentials", "Email not confirmed", etc.) — a
    // blanket "didn't work" string was actively hiding which of those it
    // was, which is exactly the "nothing fails silently" rule this project
    // is supposed to follow.
    return { error: error.message };
  }

  redirect("/dashboard");
}

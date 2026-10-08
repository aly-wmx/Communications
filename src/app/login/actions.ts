"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { REMEMBER_COOKIE } from "@/lib/supabase/remember";

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

  // Save "Stay signed in" first, so the sign-in cookies set below follow it.
  const remember = formData.get("remember") === "on";
  (await cookies()).set(REMEMBER_COOKIE, remember ? "1" : "0", {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
    ...(remember ? { maxAge: 400 * 24 * 60 * 60 } : {}),
  });

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

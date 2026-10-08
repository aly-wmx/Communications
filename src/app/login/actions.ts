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
    // Don't reveal whether an account exists ("Email not confirmed" would).
    // Rate limiting is the one case worth saying plainly.
    if (error.status === 429) return { error: "Too many attempts. Wait a minute and try again." };
    return { error: "Wrong email or password. If you haven't set a password yet, use Continue with Google or Forgot password." };
  }

  redirect("/dashboard");
}

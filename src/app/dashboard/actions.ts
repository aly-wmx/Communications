"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { BUSINESS_COOKIE } from "@/lib/business";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function selectBusiness(businessId: string) {
  const parsed = z.string().uuid().safeParse(businessId);
  if (!parsed.success) return;
  (await cookies()).set(BUSINESS_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  revalidatePath("/dashboard", "layout");
}

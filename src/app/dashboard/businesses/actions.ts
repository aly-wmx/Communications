"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { businessFieldSchema, newBusinessSchema } from "@/lib/validation/businesses";

const duplicate = (message: string) => message.includes("businesses_name_key");

export async function addBusiness(input: unknown): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = newBusinessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createClient();
  const { error } = await supabase.from("businesses").insert(parsed.data);
  if (error) {
    return { ok: false, error: duplicate(error.message) ? "There's already a business with that name." : "Couldn't add the business." };
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function updateBusinessField(input: unknown): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = businessFieldSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { id, field, value } = parsed.data;

  const supabase = await createClient();
  const update = field === "name" ? { name: value } : { color: value };
  const { error } = await supabase.from("businesses").update(update).eq("id", id);
  if (error) {
    return { ok: false, error: duplicate(error.message) ? "There's already a business with that name." : "Couldn't save that change." };
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

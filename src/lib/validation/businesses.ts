import { z } from "zod";

const name = z.string().trim().min(1, "Give the business a name.").max(120);
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Pick a colour.");

export const newBusinessSchema = z.object({ name, color });

export const businessFieldSchema = z.discriminatedUnion("field", [
  z.object({ id: z.string().uuid(), field: z.literal("name"), value: name }),
  z.object({ id: z.string().uuid(), field: z.literal("color"), value: color }),
]);

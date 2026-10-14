import { z } from "zod";

const name = z.string().trim().min(1, "Give the business a name.").max(120);
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Pick a colour.");
/** A GoHighLevel sub-account (location) id, or empty to disconnect. Same rule as the database CHECK. */
const ghlLocationId = z
  .string()
  .trim()
  .regex(/^([A-Za-z0-9]{8,64})?$/, "That doesn't look like a GoHighLevel location ID (Settings → Business Profile in GHL).");

export const newBusinessSchema = z.object({ name, color });

export const businessFieldSchema = z.discriminatedUnion("field", [
  z.object({ id: z.string().uuid(), field: z.literal("name"), value: name }),
  z.object({ id: z.string().uuid(), field: z.literal("color"), value: color }),
  z.object({ id: z.string().uuid(), field: z.literal("ghl_location_id"), value: ghlLocationId }),
]);

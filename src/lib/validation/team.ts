import { z } from "zod";
import { ROLES } from "@/lib/roles";

export const memberIdSchema = z.object({ id: z.string().min(1).max(100) });

// One schema per editable field, so each cell's save is validated on its own terms.
export const memberFieldSchema = z.discriminatedUnion("field", [
  z.object({ id: z.string().min(1), field: z.literal("name"), value: z.string().trim().min(1, "Name can't be empty.").max(120) }),
  z.object({
    id: z.string().min(1),
    field: z.literal("email"),
    value: z
      .string()
      .trim()
      .toLowerCase()
      .max(320)
      .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "That doesn't look like an email address."),
  }),
  z.object({ id: z.string().min(1), field: z.literal("phone"), value: z.string().trim().max(40) }),
  z.object({
    id: z.string().min(1),
    field: z.literal("slack_user_id"),
    value: z
      .string()
      .trim()
      .toUpperCase()
      .max(30)
      .refine((v) => v === "" || /^[UW][A-Z0-9]{6,}$/.test(v), "Slack member IDs look like U01ABC2DEF."),
  }),
  z.object({ id: z.string().min(1), field: z.literal("role"), value: z.enum(ROLES) }),
  z.object({ id: z.string().min(1), field: z.literal("escalation"), value: z.boolean() }),
  z.object({ id: z.string().min(1), field: z.literal("department"), value: z.enum(["", "sales", "design", "construction", "client_care"]) }),
]);

export type MemberFieldInput = z.input<typeof memberFieldSchema>;

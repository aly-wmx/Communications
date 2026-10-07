import { z } from "zod";

export const escalateSchema = z.object({
  contactId: z.string().min(1).max(100),
  note: z.string().trim().max(500).default(""),
  recipientIds: z.array(z.string().min(1).max(100)).max(20).default([]),
});

export const contactIdSchema = z.object({ contactId: z.string().min(1).max(100) });

export const prefsSchema = z.object({
  slack: z.boolean(),
  email: z.boolean(),
  new_messages: z.boolean(),
  reminders: z.boolean(),
});

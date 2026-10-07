import { z } from "zod";

export const clientUpdateSchema = z.object({
  clientId: z.string().min(1).max(100),
  name: z.string().trim().min(1, "Name can't be empty.").max(120),
  project: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "That doesn't look like an email address."),
  ownerId: z.string().max(100),
  notes: z.string().trim().max(2000),
});

export type ClientUpdateInput = z.input<typeof clientUpdateSchema>;

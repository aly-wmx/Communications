import { z } from "zod";

const id = z.string().min(1).max(100);

export const queueActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), contactId: id, assigneeId: z.string().max(100) }),
  z.object({ action: z.literal("responded"), contactId: id }),
  z.object({ action: z.literal("resolve"), contactId: id, reason: z.string().trim().max(120).optional() }),
  z.object({ action: z.literal("reopen"), contactId: id }),
]);

export type QueueAction = z.infer<typeof queueActionSchema>;

export const RESOLVE_REASONS = [
  "Replied outside the portal",
  "Handled by phone",
  "No reply needed",
  "Duplicate",
] as const;

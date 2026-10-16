import { z } from "zod";
import { COLUMNS, PRIORITIES } from "@/lib/tickets";

const ticketId = z.string().uuid();
const memberId = z.string().max(100);
const clientId = z.string().max(100);
const title = z.string().trim().min(1, "Give the ticket a title.").max(200, "Keep the title under 200 characters.");
const details = z.string().trim().max(5000, "Keep the details under 5,000 characters.");
/**
 * A due date ("2026-10-16"), or empty for none. The year must be sensible (last year to five years
 * out), so a half-typed date ("0002-…") can't be saved and fire an "Overdue" reminder.
 */
const dueDate = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a valid due date.")
  .refine((v) => {
    if (!v) return true;
    const year = Number(v.slice(0, 4));
    const now = new Date().getUTCFullYear();
    return year >= now - 1 && year <= now + 5;
  }, "Pick a due date within the next few years.");

export const newTicketSchema = z.object({
  title,
  details: details.default(""),
  assigneeId: memberId.default(""),
  clientId: clientId.default(""),
  dueDate: dueDate.default(""),
  priority: z.enum(PRIORITIES).default("normal"),
});

export const ticketUpdateSchema = z.discriminatedUnion("field", [
  z.object({ id: ticketId, field: z.literal("status"), value: z.enum(COLUMNS) }),
  z.object({ id: ticketId, field: z.literal("assignee"), value: memberId }),
  z.object({ id: ticketId, field: z.literal("priority"), value: z.enum(PRIORITIES) }),
  z.object({ id: ticketId, field: z.literal("due"), value: dueDate }),
  z.object({ id: ticketId, field: z.literal("title"), value: title }),
  z.object({ id: ticketId, field: z.literal("details"), value: details }),
  z.object({ id: ticketId, field: z.literal("client"), value: clientId }),
]);
export type TicketUpdate = z.infer<typeof ticketUpdateSchema>;

export const ticketCommentSchema = z.object({
  ticketId,
  body: z.string().trim().min(1, "Write a comment first.").max(5000),
});

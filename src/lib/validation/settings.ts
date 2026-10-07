import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 08:00.");

export const slaSettingsSchema = z
  .object({
    reminderMinutes: z.number().int().min(1, "Reminder must be at least 1 minute.").max(10_080),
    escalateMinutes: z.number().int().min(1, "Escalation must be at least 1 minute.").max(20_160),
    urgentEscalateMinutes: z.number().int().min(0).max(10_080),
    defaultAssigneeId: z.string().max(100),
    timeZone: z.string().min(1, "Choose the business's time zone.").max(60),
    businessHours: z.object({
      enabled: z.boolean(),
      start: hhmm,
      end: hhmm,
      days: z.array(z.number().int().min(0).max(6)).max(7),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.businessHours.enabled && v.businessHours.start >= v.businessHours.end) {
      ctx.addIssue({ code: "custom", message: "Opening time must be before closing time.", path: ["businessHours", "end"] });
    }
    if (v.businessHours.enabled && v.businessHours.days.length === 0) {
      ctx.addIssue({ code: "custom", message: "Pick at least one business day.", path: ["businessHours", "days"] });
    }
  });

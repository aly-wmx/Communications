import { z } from "zod";

const channel = z.enum(["SMS", "Email"]);
const message = z.string().trim().min(1, "Write a message first.").max(5000, "That's too long to send.");
const subject = z.string().trim().max(200).optional();

const withSubject = <T extends { channel: "SMS" | "Email"; subject?: string; message: string }>(v: T, ctx: z.RefinementCtx) => {
  if (v.channel === "Email" && !v.subject) ctx.addIssue({ code: "custom", message: "Add an email subject.", path: ["subject"] });
  if (v.channel === "SMS" && v.message.length > 1600) {
    ctx.addIssue({ code: "custom", message: "Texts are limited to 1,600 characters.", path: ["message"] });
  }
};

export const replySchema = z
  .object({ clientId: z.string().min(1).max(100), channel, subject, message })
  .superRefine(withSubject);

export const newConversationSchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), clientId: z.string().min(1).max(100), channel, subject, message }),
    z.object({
      mode: z.literal("new"),
      name: z.string().trim().min(1, "Enter the person's name.").max(120),
      phone: z.string().trim().max(40),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .max(320)
        .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "That doesn't look like an email address."),
      project: z.string().trim().max(120).optional(),
      channel,
      subject,
      message,
    }),
  ])
  .superRefine((v, ctx) => {
    withSubject(v, ctx);
    if (v.mode === "new") {
      if (v.channel === "SMS" && !v.phone) ctx.addIssue({ code: "custom", message: "Add a phone number to send a text.", path: ["phone"] });
      if (v.channel === "Email" && !v.email) ctx.addIssue({ code: "custom", message: "Add an email address to send an email.", path: ["email"] });
    }
  });

export type ReplyInput = z.input<typeof replySchema>;
export type NewConversationInput = z.input<typeof newConversationSchema>;

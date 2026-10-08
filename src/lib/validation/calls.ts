import { z } from "zod";

export const logCallSchema = z.object({
  clientId: z.string().min(1, "Choose the client.").max(100),
  direction: z.enum(["inbound", "outbound"]),
  outcome: z.enum(["connected", "missed", "voicemail", "failed"]),
  durationMinutes: z.number().min(0).max(600).default(0),
  note: z.string().trim().max(1000).default(""),
  /** When the call happened (ISO); defaults to now. */
  occurredAt: z.string().max(40).optional(),
});

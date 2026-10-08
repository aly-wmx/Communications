import { z } from "zod";

export const noteSchema = z.object({
  /** Empty = the general team channel. */
  clientId: z.string().max(100).default(""),
  body: z.string().trim().min(1, "Write something first.").max(4000, "That's too long for one note."),
  /** Teammate who needs to reply to the client (client notes only). */
  flagFor: z.string().max(100).default(""),
});

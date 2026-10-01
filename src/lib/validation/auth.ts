import { z } from "zod";

// Deliberately not using zod's built-in email format check here — the
// input's type="email" already handles format hinting in the browser, and
// this avoids a hard dependency on a specific zod version's email() shape.
export const emailSchema = z.object({
  email: z.string().trim().min(3).max(320),
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

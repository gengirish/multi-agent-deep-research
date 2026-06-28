import { z } from "zod";

const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[A-Za-z]/, "Password must include at least one letter")
  .regex(/[0-9]/, "Password must include at least one number");

export const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export const signUpSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(100),
  password: strongPasswordSchema,
});

export const forgotPasswordSchema = z.object({
  email: z.email(),
});

export const resetPasswordSchema = z.object({
  email: z.email(),
  token: z.string().min(32),
  password: strongPasswordSchema,
});

export const sendReportSchema = z.object({
  to: z.email(),
  // Optional note from the sender. Capped so a hostile payload can't blow
  // past Gmail's 102KB clip threshold on its own.
  note: z
    .string()
    .trim()
    .max(2000, "Note must be at most 2000 characters")
    .optional(),
});

export const addSubscriberSchema = z.object({
  email: z.email(),
  name: z
    .string()
    .trim()
    .max(100, "Name must be at most 100 characters")
    .optional(),
});

export const broadcastReportSchema = z.object({
  // Optional intro note prepended to the briefing as an "editor's note".
  note: z
    .string()
    .trim()
    .max(2000, "Note must be at most 2000 characters")
    .optional(),
});

export type AddSubscriberInput = z.infer<typeof addSubscriberSchema>;
export type BroadcastReportInput = z.infer<typeof broadcastReportSchema>;

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type SendReportInput = z.infer<typeof sendReportSchema>;

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

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

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

// Segment labels. The data layer normalizes these (lower-case, spaces to
// hyphens, unknown characters dropped), so this only bounds the raw input.
const tagsSchema = z
  .array(z.string().trim().min(1).max(24))
  .max(10, "At most 10 segments per subscriber")
  .optional();

export const addSubscriberSchema = z.object({
  email: z.email(),
  name: z
    .string()
    .trim()
    .max(100, "Name must be at most 100 characters")
    .optional(),
  tags: tagsSchema,
});

// Public sign-up. Same shape as the owner-facing add, plus the capture surface
// the address came from. `source` is attribution only — it never affects
// delivery — but it is still an enum so a hostile client can't write arbitrary
// text into the column.
export const publicSubscribeSchema = z.object({
  email: z.email(),
  name: z
    .string()
    .trim()
    .max(100, "Name must be at most 100 characters")
    .optional(),
  source: z.enum(["landing", "report", "newsletter"]).optional(),
});

// PATCH /api/subscribers/{id} — segments are the only mutable field for now.
export const updateSubscriberSchema = z.object({
  tags: z
    .array(z.string().trim().min(1).max(24))
    .max(10, "At most 10 segments per subscriber"),
});

export const importSubscribersSchema = z.object({
  // Raw CSV text. 1MB is far beyond any realistic contact export and keeps a
  // pathological payload from tying up the parser.
  csv: z
    .string()
    .min(1, "Paste or upload a CSV first.")
    .max(1_000_000, "That file is too large (1MB max)."),
  // Segments applied to every imported row, on top of any per-row tags column.
  tags: tagsSchema,
});

export const broadcastReportSchema = z.object({
  // Optional intro note prepended to the briefing as an "editor's note".
  note: z
    .string()
    .trim()
    .max(2000, "Note must be at most 2000 characters")
    .optional(),
  // When true, report what a send would do and send nothing. Agents call this
  // first so a human (or the model's own confirmation step) sees the recipient
  // count before any irreversible mail goes out.
  dryRun: z.boolean().optional().default(false),
  // Send to one segment instead of the whole list. Omit for everyone.
  segment: z.string().trim().max(24).optional(),
});

// POST /api/newsletter/broadcast — an arbitrary, externally-composed briefing
// (the daily "IntelliForge Morning Briefing" digest) sent to the newsletter
// list. Unlike broadcastReportSchema this carries the whole email body, because
// there is no ResearchResult behind it to render.
export const newsletterBroadcastSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required")
    .max(200, "Subject must be at most 200 characters"),
  // Ready-made HTML body. The route appends a per-recipient unsubscribe footer
  // before sending; nothing else is added or rewritten.
  html: z.string().trim().min(1, "html body is required"),
  // Plaintext alternative. Optional — AgentMail is happy with HTML only.
  text: z.string().optional(),
  // Send to one segment instead of the whole list. Omit for everyone.
  segment: z.string().trim().max(24).optional(),
  // When true, report what a send would do and send nothing.
  dryRun: z.boolean().optional().default(false),
  // Caller-supplied send-once identity, stored in Broadcast.jobId. There is no
  // report id to key idempotency on here, so the caller names the issue itself
  // (e.g. "daily-briefing:2026-09-09"). Charset is restricted so it stays a
  // safe, readable database key.
  dedupeKey: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9:_-]{3,64}$/,
      "dedupeKey must be 3-64 chars of a-z, 0-9, ':', '_' or '-'",
    ),
});

export type AddSubscriberInput = z.infer<typeof addSubscriberSchema>;
export type PublicSubscribeInput = z.infer<typeof publicSubscribeSchema>;
export type UpdateSubscriberInput = z.infer<typeof updateSubscriberSchema>;
export type ImportSubscribersInput = z.infer<typeof importSubscribersSchema>;
export type BroadcastReportInput = z.infer<typeof broadcastReportSchema>;
export type NewsletterBroadcastInput = z.infer<
  typeof newsletterBroadcastSchema
>;

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type SendReportInput = z.infer<typeof sendReportSchema>;

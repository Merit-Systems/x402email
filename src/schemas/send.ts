import { z } from 'zod';

export const AttachmentSchema = z.object({
  /** Base64-encoded file content */
  content: z.string().max(5_000_000, 'Attachment content too large (max ~3.75MB decoded)'),
  /** MIME type (e.g., "text/calendar; method=REQUEST", "application/pdf") */
  contentType: z.string().min(1).max(255),
  /** Filename (e.g., "invite.ics", "report.pdf") */
  filename: z.string().min(1).max(255),
});

export const SendEmailRequestSchema = z.object({
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().min(1).max(998), // RFC 2822 max subject
  html: z.string().max(256_000).optional(),
  text: z.string().max(256_000).optional(),
  replyTo: z.string().email().optional(),
  /** Optional file attachments (max 5, base64-encoded) */
  attachments: z.array(AttachmentSchema).max(5).optional(),
}).refine(
  (data) => data.html || data.text,
  { message: 'Either html or text body is required' },
);

export const SendEmailResponseSchema = z.object({
  success: z.literal(true),
  messageId: z.string(),
  from: z.string(),
});

export type SendEmailRequest = z.infer<typeof SendEmailRequestSchema>;
export type SendEmailResponse = z.infer<typeof SendEmailResponseSchema>;

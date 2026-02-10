import { z } from 'zod';

export const SendEmailRequestSchema = z.object({
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().min(1).max(998), // RFC 2822 max subject
  html: z.string().max(256_000).optional(),
  text: z.string().max(256_000).optional(),
  replyTo: z.string().email().optional(),
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

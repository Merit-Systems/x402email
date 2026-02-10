import { z } from 'zod';
import { RESERVED_NAMES } from './reserved-names';

// Same format as SubdomainNameSchema: 3-30 chars, lowercase alphanumeric + hyphens
const USERNAME_REGEX = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const NO_CONSECUTIVE_HYPHENS = /^(?!.*--)/;

export const InboxUsernameSchema = z
  .string()
  .regex(USERNAME_REGEX, 'Username must be 3-30 lowercase alphanumeric characters or hyphens, starting and ending with alphanumeric')
  .regex(NO_CONSECUTIVE_HYPHENS, 'Username cannot contain consecutive hyphens')
  .refine((s) => !s.startsWith('_'), { message: 'Username cannot start with underscore' })
  .refine((s) => !RESERVED_NAMES.has(s), { message: 'Reserved username' });

export const BuyInboxRequestSchema = z.object({
  username: InboxUsernameSchema,
  forwardTo: z.string().email(),
});

export const TopupInboxRequestSchema = z.object({
  username: z.string().min(3).max(30),
});

export const InboxSendRequestSchema = z.object({
  username: z.string().min(3).max(30),
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().min(1).max(998),
  html: z.string().max(256_000).optional(),
  text: z.string().max(256_000).optional(),
  replyTo: z.string().email().optional(),
}).refine(
  (data) => data.html || data.text,
  { message: 'Either html or text body is required' },
);

export const UpdateInboxRequestSchema = z.object({
  username: z.string().min(3).max(30),
  forwardTo: z.string().email(),
});

export const CancelInboxRequestSchema = z.object({
  username: z.string().min(3).max(30),
  refundAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM wallet address').optional(),
});

export type BuyInboxRequest = z.infer<typeof BuyInboxRequestSchema>;
export type TopupInboxRequest = z.infer<typeof TopupInboxRequestSchema>;
export type InboxSendRequest = z.infer<typeof InboxSendRequestSchema>;
export type UpdateInboxRequest = z.infer<typeof UpdateInboxRequestSchema>;
export type CancelInboxRequest = z.infer<typeof CancelInboxRequestSchema>;

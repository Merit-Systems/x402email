import { z } from 'zod';
import { RESERVED_NAMES } from './reserved-names';

// 3-30 chars, lowercase alphanumeric + hyphens, must start/end with alphanumeric, no consecutive hyphens
const SUBDOMAIN_REGEX = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
const NO_CONSECUTIVE_HYPHENS = /^(?!.*--)/;

export const SubdomainNameSchema = z
  .string()
  .regex(SUBDOMAIN_REGEX, 'Subdomain must be 3-30 lowercase alphanumeric characters or hyphens, starting and ending with alphanumeric')
  .regex(NO_CONSECUTIVE_HYPHENS, 'Subdomain cannot contain consecutive hyphens')
  .refine((s) => !s.startsWith('_'), { message: 'Subdomain cannot start with underscore' })
  .refine((s) => !RESERVED_NAMES.has(s), { message: 'Reserved subdomain name' });

export const BuySubdomainRequestSchema = z.object({
  subdomain: SubdomainNameSchema,
});

export const BuySubdomainResponseSchema = z.object({
  success: z.literal(true),
  subdomain: z.string(),
  dnsStatus: z.enum(['pending', 'verified']),
  estimatedVerificationMinutes: z.number(),
});

export const SubdomainStatusResponseSchema = z.object({
  subdomain: z.string(),
  ownerWallet: z.string(),
  dnsVerified: z.boolean(),
  sesVerified: z.boolean(),
  signerCount: z.number(),
  signers: z.array(z.string()),
  createdAt: z.string(),
});

// Subdomain send extends the base send schema with a from field
import { AttachmentSchema } from './send';

export const SubdomainSendRequestSchema = z.object({
  from: z.string().email(),
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().min(1).max(998),
  html: z.string().max(256_000).optional(),
  text: z.string().max(256_000).optional(),
  replyTo: z.string().email().optional(),
  attachments: z.array(AttachmentSchema).max(5).optional(),
}).refine(
  (data) => data.html || data.text,
  { message: 'Either html or text body is required' },
);

// --- Subdomain Inbox schemas ---

// localPart: the part before @ — e.g., "biden" in biden@craig.x402email.com
// More lenient than inbox usernames: 1-64 chars, standard email local part rules
const LOCAL_PART_REGEX = /^[a-z0-9][a-z0-9._+-]{0,62}[a-z0-9]$/;

export const SubdomainInboxLocalPartSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(LOCAL_PART_REGEX, 'Local part must be 2-64 lowercase alphanumeric characters, dots, underscores, plus, or hyphens');

export const CreateSubdomainInboxRequestSchema = z.object({
  subdomain: SubdomainNameSchema,
  localPart: SubdomainInboxLocalPartSchema,
  forwardTo: z.string().email().optional(),
});

export const ListSubdomainInboxesRequestSchema = z.object({
  subdomain: SubdomainNameSchema,
});

export const DeleteSubdomainInboxRequestSchema = z.object({
  subdomain: SubdomainNameSchema,
  localPart: SubdomainInboxLocalPartSchema,
});

export const SubdomainInboxMessagesRequestSchema = z.object({
  subdomain: SubdomainNameSchema,
  localPart: SubdomainInboxLocalPartSchema,
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const SubdomainInboxReadMessageRequestSchema = z.object({
  messageId: z.string().min(1),
});

export const SubdomainInboxDeleteMessageRequestSchema = z.object({
  messageId: z.string().min(1),
});

export const UpdateSubdomainRequestSchema = z.object({
  subdomain: SubdomainNameSchema,
  catchAllForwardTo: z.string().email().nullable().optional(),
});

export type BuySubdomainRequest = z.infer<typeof BuySubdomainRequestSchema>;
export type SubdomainSendRequest = z.infer<typeof SubdomainSendRequestSchema>;
export type CreateSubdomainInboxRequest = z.infer<typeof CreateSubdomainInboxRequestSchema>;
export type SubdomainInboxMessagesRequest = z.infer<typeof SubdomainInboxMessagesRequestSchema>;

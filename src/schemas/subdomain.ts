import { z } from 'zod';

const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$/;
const RESERVED = new Set(['www', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'api', 'admin', 'ns1', 'ns2', 'mx', 'app']);

export const SubdomainNameSchema = z
  .string()
  .regex(SUBDOMAIN_REGEX, 'Subdomain must be 3-30 lowercase alphanumeric characters or hyphens')
  .refine((s) => !RESERVED.has(s), { message: 'Reserved subdomain name' });

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
export const SubdomainSendRequestSchema = z.object({
  from: z.string().email(),
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().min(1).max(998),
  html: z.string().max(256_000).optional(),
  text: z.string().max(256_000).optional(),
  replyTo: z.string().email().optional(),
}).refine(
  (data) => data.html || data.text,
  { message: 'Either html or text body is required' },
);

export type BuySubdomainRequest = z.infer<typeof BuySubdomainRequestSchema>;
export type SubdomainSendRequest = z.infer<typeof SubdomainSendRequestSchema>;

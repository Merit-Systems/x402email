import { z } from 'zod';
import { SubdomainNameSchema } from './subdomain';

export const ManageSignerRequestSchema = z.object({
  action: z.enum(['add', 'remove']),
  subdomain: SubdomainNameSchema,
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM wallet address'),
});

export type ManageSignerRequest = z.infer<typeof ManageSignerRequestSchema>;

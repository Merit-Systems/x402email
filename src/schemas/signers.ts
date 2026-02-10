import { z } from 'zod';

export const ManageSignerRequestSchema = z.object({
  action: z.enum(['add', 'remove']),
  subdomain: z.string().min(3).max(30),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid EVM wallet address'),
});

export type ManageSignerRequest = z.infer<typeof ManageSignerRequestSchema>;

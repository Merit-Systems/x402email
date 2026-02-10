/**
 * POST /api/inbox/topup/year — Top up an inbox for 365 days ($8).
 * Protection: x402 payment ($8), no SIWX. Anyone can top up any inbox.
 */
import { NextResponse } from 'next/server';
import { createX402PostRoute } from '@/lib/x402/route-wrapper';
import { PRICES, INBOX_DURATIONS } from '@/lib/x402/pricing';
import { TopupInboxRequestSchema } from '@/schemas/inbox';
import { createTopupHandler } from '@/lib/inbox/topup';

const topup = createTopupHandler(INBOX_DURATIONS.year);

export const POST = createX402PostRoute({
  description: 'Top up a forwarding inbox for 365 days ($8 via x402, save 34%)',
  inputSchema: TopupInboxRequestSchema,
  outputExample: {
    success: true as const,
    inbox: 'alice',
    expiresAt: '2026-06-15T12:00:00.000Z',
    daysRemaining: 365,
    daysAdded: 365,
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', const: true },
      inbox: { type: 'string' },
      expiresAt: { type: 'string' },
      daysRemaining: { type: 'number' },
      daysAdded: { type: 'number' },
    },
    required: ['success', 'inbox', 'expiresAt', 'daysRemaining', 'daysAdded'],
  },
  accepts: [PRICES.inboxTopupYear],
  handler: async (body) => {
    return topup(body) as Promise<NextResponse>;
  },
});

/**
 * POST /api/inbox/topup/quarter — Top up an inbox for 90 days ($2.50).
 * Protection: x402 payment ($2.50), no SIWX. Anyone can top up any inbox.
 */
import { router, INBOX_DURATIONS } from '@/lib/routes';
import { TopupInboxRequestSchema } from '@/schemas/inbox';
import { createTopupHandler } from '@/lib/inbox/topup';

const topup = createTopupHandler(INBOX_DURATIONS.quarter);

export const POST = router
  .route('inbox/topup/quarter')
  .paid('2.5')
  .body(TopupInboxRequestSchema)
  .description('Top up a forwarding inbox for 90 days ($2.50 via x402, save 17%)')
  .handler(async ({ body }) => topup(body.username));

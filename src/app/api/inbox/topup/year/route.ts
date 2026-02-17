/**
 * POST /api/inbox/topup/year — Top up an inbox for 365 days ($8).
 * Protection: x402 payment ($8), no SIWX. Anyone can top up any inbox.
 */
import { router, INBOX_DURATIONS } from '@/lib/routes';
import { TopupInboxRequestSchema } from '@/schemas/inbox';
import { createTopupHandler } from '@/lib/inbox/topup';

const topup = createTopupHandler(INBOX_DURATIONS.year);

export const POST = router
  .route('inbox/topup/year')
  .paid('8')
  .body(TopupInboxRequestSchema)
  .description('Top up a forwarding inbox for 365 days ($8 via x402, save 34%)')
  .handler(async ({ body }) => topup(body.username));

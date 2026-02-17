/**
 * POST /api/inbox/messages — List messages in an inbox.
 * Protection: x402 payment ($0.001). Wallet must own the inbox.
 */
import { router } from '@/lib/routes';
import { ListMessagesRequestSchema } from '@/schemas/inbox';
import { prisma } from '@/lib/db/client';

export const POST = router
  .route('inbox/messages')
  .paid('0.001', { protocols: ['x402', 'mpp'] })
  .body(ListMessagesRequestSchema)
  .description('List messages in your inbox ($0.001 via x402)')
  .handler(async ({ body, wallet }) => {
    const walletAddress = wallet!.toLowerCase();
    const { username, cursor, limit } = body;

    const inbox = await prisma.inbox.findUnique({ where: { username } });
    if (!inbox) {
      throw Object.assign(new Error('Inbox not found'), { status: 404 });
    }

    if (inbox.ownerWallet.toLowerCase() !== walletAddress) {
      throw Object.assign(
        new Error('Wallet not authorized for this inbox'),
        { status: 403 },
      );
    }

    const messages = await prisma.inboxMessage.findMany({
      where: { inboxId: inbox.id },
      orderBy: { receivedAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? page[page.length - 1].id : undefined;

    return {
      success: true,
      messages: page.map((m) => ({
        id: m.id,
        fromEmail: m.fromEmail,
        subject: m.subject,
        receivedAt: m.receivedAt.toISOString(),
        read: m.read,
      })),
      ...(nextCursor ? { nextCursor } : {}),
    };
  });

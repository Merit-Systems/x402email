/**
 * POST /api/subdomain/inbox/messages — List messages in a subdomain inbox.
 * Protection: x402 payment ($0.001). Wallet must own the subdomain.
 */
import { router, SUBDOMAIN_INBOX_LIMITS } from '@/lib/routes';
import { SubdomainInboxMessagesRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';

const { maxMessagesPerInbox: MESSAGE_LIMIT } = SUBDOMAIN_INBOX_LIMITS;

export const POST = router
  .route('subdomain/inbox/messages')
  .paid('0.001')
  .body(SubdomainInboxMessagesRequestSchema)
  .description('List messages in a subdomain inbox ($0.001 via x402)')
  .handler(async ({ body, wallet }) => {
    const walletAddress = wallet!.toLowerCase();
    const { subdomain: subdomainName, localPart, cursor, limit } = body;

    const subdomain = await prisma.subdomain.findUnique({
      where: { name: subdomainName },
    });

    if (!subdomain) {
      throw Object.assign(new Error('Subdomain not found'), { status: 404 });
    }

    if (subdomain.ownerWallet.toLowerCase() !== walletAddress) {
      throw Object.assign(
        new Error('Wallet not authorized for this subdomain'),
        { status: 403 },
      );
    }

    const inbox = await prisma.subdomainInbox.findUnique({
      where: { subdomainId_localPart: { subdomainId: subdomain.id, localPart } },
    });

    if (!inbox) {
      throw Object.assign(
        new Error('Inbox not found on this subdomain'),
        { status: 404 },
      );
    }

    const [messages, totalCount] = await Promise.all([
      prisma.subdomainMessage.findMany({
        where: { inboxId: inbox.id },
        orderBy: { receivedAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.subdomainMessage.count({ where: { inboxId: inbox.id } }),
    ]);

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? page[page.length - 1].id : undefined;

    let warning: string | undefined;
    if (totalCount >= MESSAGE_LIMIT) {
      warning = `Inbox is at capacity (${totalCount}/${MESSAGE_LIMIT} messages). New inbound messages will not be retained. Delete old messages to free up space using POST /api/subdomain/inbox/messages/delete.`;
    } else if (totalCount >= MESSAGE_LIMIT * 0.8) {
      warning = `Inbox is near capacity (${totalCount}/${MESSAGE_LIMIT} messages). Delete old messages to free up space using POST /api/subdomain/inbox/messages/delete.`;
    }

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
      messageCount: totalCount,
      messageLimit: MESSAGE_LIMIT,
      ...(warning ? { warning } : {}),
    };
  });

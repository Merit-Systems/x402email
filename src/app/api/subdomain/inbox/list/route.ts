/**
 * POST /api/subdomain/inbox/list — List inboxes on a subdomain.
 * Protection: SIWX only (free). Only the subdomain owner can list.
 */
import { router, DOMAIN } from '@/lib/routes';
import { ListSubdomainInboxesRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';

export const POST = router
  .route('subdomain/inbox/list')
  .siwx()
  .body(ListSubdomainInboxesRequestSchema)
  .description('List inboxes on a subdomain (SIWX, free)')
  .handler(async ({ body, wallet }) => {
    const callerWallet = wallet!.toLowerCase();
    const { subdomain: subdomainName } = body;

    const subdomain = await prisma.subdomain.findUnique({
      where: { name: subdomainName },
    });

    if (!subdomain) {
      throw Object.assign(new Error('Subdomain not found'), { status: 404 });
    }

    if (subdomain.ownerWallet.toLowerCase() !== callerWallet) {
      throw Object.assign(
        new Error('Only the subdomain owner can list inboxes'),
        { status: 403 },
      );
    }

    const inboxes = await prisma.subdomainInbox.findMany({
      where: { subdomainId: subdomain.id },
      include: { _count: { select: { messages: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const unreadCounts = await prisma.subdomainMessage.groupBy({
      by: ['inboxId'],
      where: {
        inboxId: { in: inboxes.map((i) => i.id) },
        read: false,
      },
      _count: true,
    });
    const unreadMap = new Map(unreadCounts.map((u) => [u.inboxId, u._count]));

    return {
      success: true,
      subdomain: `${subdomainName}.${DOMAIN}`,
      catchAllForwardTo: subdomain.catchAllForwardTo,
      inboxes: inboxes.map((i) => ({
        localPart: i.localPart,
        address: `${i.localPart}@${subdomainName}.${DOMAIN}`,
        forwardTo: i.forwardTo,
        retainMessages: i.retainMessages,
        active: i.active,
        messageCount: i._count.messages,
        unreadCount: unreadMap.get(i.id) ?? 0,
        createdAt: i.createdAt.toISOString(),
      })),
    };
  });

/**
 * POST /api/subdomain/inbox/create — Create an inbox on a subdomain.
 * Protection: x402 payment ($0.25). Wallet must own the subdomain.
 * Cap: 100 inboxes per subdomain, 500 messages per inbox.
 */
import { router, DOMAIN, SUBDOMAIN_INBOX_LIMITS } from '@/lib/routes';
import { CreateSubdomainInboxRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';

export const POST = router
  .route('subdomain/inbox/create')
  .body(CreateSubdomainInboxRequestSchema)
  .description(`Create an inbox on your subdomain ($0.25 via x402). Max ${SUBDOMAIN_INBOX_LIMITS.maxInboxesPerSubdomain} inboxes, ${SUBDOMAIN_INBOX_LIMITS.maxMessagesPerInbox} messages each.`)
  .handler(async ({ body, wallet }) => {
    const walletAddress = wallet!.toLowerCase();
    const { subdomain: subdomainName, localPart, forwardTo } = body;

    const subdomain = await prisma.subdomain.findUnique({
      where: { name: subdomainName },
      include: { _count: { select: { inboxes: true } } },
    });

    if (!subdomain) {
      throw Object.assign(new Error('Subdomain not found'), { status: 404 });
    }

    if (subdomain.ownerWallet.toLowerCase() !== walletAddress) {
      throw Object.assign(
        new Error('Only the subdomain owner can create inboxes'),
        { status: 403 },
      );
    }

    if (subdomain._count.inboxes >= SUBDOMAIN_INBOX_LIMITS.maxInboxesPerSubdomain) {
      throw Object.assign(
        new Error(`Maximum ${SUBDOMAIN_INBOX_LIMITS.maxInboxesPerSubdomain} inboxes per subdomain`),
        { status: 409 },
      );
    }

    const existing = await prisma.subdomainInbox.findUnique({
      where: { subdomainId_localPart: { subdomainId: subdomain.id, localPart } },
    });

    if (existing) {
      throw Object.assign(
        new Error('Inbox already exists on this subdomain'),
        { status: 409 },
      );
    }

    const retainMessages = !forwardTo;

    const inbox = await prisma.subdomainInbox.create({
      data: {
        subdomainId: subdomain.id,
        localPart,
        forwardTo: forwardTo ?? null,
        retainMessages,
      },
    });

    return {
      success: true,
      inbox: `${localPart}@${subdomainName}.${DOMAIN}`,
      id: inbox.id,
      ...(forwardTo ? { forwardTo } : {}),
      retainMessages,
      messageLimit: SUBDOMAIN_INBOX_LIMITS.maxMessagesPerInbox,
    };
  });

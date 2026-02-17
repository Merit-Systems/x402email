/**
 * POST /api/subdomain/inbox/update — Update subdomain inbox settings.
 * Protection: SIWX only (free). Only the subdomain owner can update.
 */
import { router, DOMAIN } from '@/lib/routes';
import { UpdateSubdomainInboxRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';

export const POST = router
  .route('subdomain/inbox/update')
  .siwx()
  .body(UpdateSubdomainInboxRequestSchema)
  .description('Update subdomain inbox settings (SIWX, free)')
  .handler(async ({ body, wallet }) => {
    const callerWallet = wallet!.toLowerCase();
    const { subdomain: subdomainName, localPart, forwardTo, retainMessages } = body;

    const subdomain = await prisma.subdomain.findUnique({
      where: { name: subdomainName },
    });

    if (!subdomain) {
      throw Object.assign(new Error('Subdomain not found'), { status: 404 });
    }

    if (subdomain.ownerWallet.toLowerCase() !== callerWallet) {
      throw Object.assign(
        new Error('Only the subdomain owner can update inboxes'),
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

    const updateData: { forwardTo?: string | null; retainMessages?: boolean } = {};
    if (forwardTo !== undefined) updateData.forwardTo = forwardTo;
    if (retainMessages !== undefined) updateData.retainMessages = retainMessages;

    const updated = await prisma.subdomainInbox.update({
      where: { id: inbox.id },
      data: updateData,
    });

    return {
      success: true,
      inbox: `${localPart}@${subdomainName}.${DOMAIN}`,
      forwardTo: updated.forwardTo,
      retainMessages: updated.retainMessages,
    };
  });

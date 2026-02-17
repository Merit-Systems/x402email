/**
 * POST /api/subdomain/update — Update subdomain settings.
 * Protection: SIWX only (free). Only the subdomain owner can update.
 */
import { router } from '@/lib/routes';
import { UpdateSubdomainRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';

export const POST = router
  .route('subdomain/update')
  .siwx()
  .body(UpdateSubdomainRequestSchema)
  .description('Update subdomain settings (SIWX, free)')
  .handler(async ({ body, wallet }) => {
    const callerWallet = wallet!.toLowerCase();
    const { subdomain: subdomainName, catchAllForwardTo } = body;

    const subdomain = await prisma.subdomain.findUnique({
      where: { name: subdomainName },
    });

    if (!subdomain) {
      throw Object.assign(new Error('Subdomain not found'), { status: 404 });
    }

    if (subdomain.ownerWallet.toLowerCase() !== callerWallet) {
      throw Object.assign(
        new Error('Only the subdomain owner can update settings'),
        { status: 403 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (catchAllForwardTo !== undefined) {
      updateData.catchAllForwardTo = catchAllForwardTo;
    }

    if (Object.keys(updateData).length === 0) {
      throw Object.assign(new Error('No fields to update'), { status: 400 });
    }

    const updated = await prisma.subdomain.update({
      where: { id: subdomain.id },
      data: updateData,
    });

    return {
      success: true,
      subdomain: updated.name,
      catchAllForwardTo: updated.catchAllForwardTo,
    };
  });

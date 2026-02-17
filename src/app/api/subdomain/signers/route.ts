/**
 * POST /api/subdomain/signers — Manage authorized signers for a subdomain.
 * Protection: SIWX only (NOT an x402 route — no payment).
 * Only the subdomain owner can add/remove signers. Max 50.
 */
import { router } from '@/lib/routes';
import { ManageSignerRequestSchema } from '@/schemas/signers';
import { prisma } from '@/lib/db/client';

const MAX_SIGNERS = 50;

export const POST = router
  .route('subdomain/signers')
  .siwx()
  .body(ManageSignerRequestSchema)
  .description('Manage authorized signers for a subdomain (SIWX, free)')
  .handler(async ({ body, wallet }) => {
    const callerWallet = wallet!.toLowerCase();
    const { action, subdomain, walletAddress } = body;

    const subdomainRecord = await prisma.subdomain.findUnique({
      where: { name: subdomain },
      include: { signers: true },
    });

    if (!subdomainRecord) {
      throw Object.assign(new Error('Subdomain not found'), { status: 404 });
    }

    if (subdomainRecord.ownerWallet.toLowerCase() !== callerWallet) {
      throw Object.assign(
        new Error('Only the subdomain owner can manage signers'),
        { status: 403 },
      );
    }

    if (action === 'add') {
      if (subdomainRecord.signers.length >= MAX_SIGNERS) {
        throw Object.assign(
          new Error(`Maximum ${MAX_SIGNERS} signers per subdomain`),
          { status: 400 },
        );
      }

      await prisma.signer.upsert({
        where: {
          subdomainId_walletAddress: {
            subdomainId: subdomainRecord.id,
            walletAddress: walletAddress.toLowerCase(),
          },
        },
        create: {
          subdomainId: subdomainRecord.id,
          walletAddress: walletAddress.toLowerCase(),
        },
        update: {},
      });

      return { success: true, action: 'added', walletAddress };
    } else {
      await prisma.signer.deleteMany({
        where: {
          subdomainId: subdomainRecord.id,
          walletAddress: walletAddress.toLowerCase(),
        },
      });

      return { success: true, action: 'removed', walletAddress };
    }
  });

/**
 * GET /api/subdomain/status — Check subdomain status.
 * Protection: SIWX only (NOT an x402 route — no payment).
 * Owner or any signer can check status.
 */
import { router, DOMAIN } from '@/lib/routes';
import { SubdomainStatusQuerySchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';
import { checkVerificationStatus } from '@/lib/dns/ses-verify';

export const GET = router
  .route('subdomain/status')
  .siwx()
  .query(SubdomainStatusQuerySchema)
  .description('Check subdomain status (SIWX, free)')
  .handler(async ({ query, wallet }) => {
    const callerWallet = wallet!.toLowerCase();
    const { subdomain } = query;

    const subdomainRecord = await prisma.subdomain.findUnique({
      where: { name: subdomain },
      include: { signers: true },
    });

    if (!subdomainRecord) {
      throw Object.assign(new Error('Subdomain not found'), { status: 404 });
    }

    const isOwner = subdomainRecord.ownerWallet.toLowerCase() === callerWallet;
    const isSigner = subdomainRecord.signers.some(
      (s) => s.walletAddress.toLowerCase() === callerWallet,
    );

    if (!isOwner && !isSigner) {
      throw Object.assign(
        new Error('Not authorized to view this subdomain'),
        { status: 403 },
      );
    }

    // Check SES verification if not yet verified
    if (!subdomainRecord.dnsVerified || !subdomainRecord.sesVerified) {
      try {
        const status = await checkVerificationStatus(subdomain);
        if (status.identityVerified && !subdomainRecord.sesVerified) {
          await prisma.subdomain.update({
            where: { id: subdomainRecord.id },
            data: { dnsVerified: true, sesVerified: true },
          });
          subdomainRecord.dnsVerified = true;
          subdomainRecord.sesVerified = true;
        }
      } catch (error) {
        console.error('[x402email] Verification check error:', error);
      }
    }

    return {
      subdomain: `${subdomain}.${DOMAIN}`,
      ownerWallet: subdomainRecord.ownerWallet,
      dnsVerified: subdomainRecord.dnsVerified,
      sesVerified: subdomainRecord.sesVerified,
      signerCount: subdomainRecord.signers.length,
      signers: subdomainRecord.signers.map((s) => s.walletAddress),
      createdAt: subdomainRecord.createdAt.toISOString(),
    };
  });

/**
 * GET /api/subdomain/status — Check subdomain status.
 * Protection: SIWX only (NOT an x402 route — no payment).
 * Owner or any signer can check status.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySIWxFromRequest } from '@/lib/siwx/verify';
import { prisma } from '@/lib/db/client';
import { checkVerificationStatus } from '@/lib/dns/ses-verify';

const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';

export async function GET(request: NextRequest) {
  const subdomain = request.nextUrl.searchParams.get('subdomain');
  if (!subdomain) {
    return NextResponse.json(
      { success: false, error: 'Missing subdomain query parameter' },
      { status: 400 },
    );
  }

  // Verify SIWX
  const resourceUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/subdomain/status`;
  const result = await verifySIWxFromRequest(request, resourceUri);
  if (result instanceof NextResponse) return result;

  const callerWallet = result.address.toLowerCase();

  // Look up subdomain
  const subdomainRecord = await prisma.subdomain.findUnique({
    where: { name: subdomain },
    include: { signers: true },
  });

  if (!subdomainRecord) {
    return NextResponse.json(
      { success: false, error: 'Subdomain not found' },
      { status: 404 },
    );
  }

  // Only owner or signer can check status
  const isOwner = subdomainRecord.ownerWallet.toLowerCase() === callerWallet;
  const isSigner = subdomainRecord.signers.some(
    (s) => s.walletAddress.toLowerCase() === callerWallet,
  );

  if (!isOwner && !isSigner) {
    return NextResponse.json(
      { success: false, error: 'Not authorized to view this subdomain' },
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

  return NextResponse.json({
    subdomain: `${subdomain}.${DOMAIN}`,
    ownerWallet: subdomainRecord.ownerWallet,
    dnsVerified: subdomainRecord.dnsVerified,
    sesVerified: subdomainRecord.sesVerified,
    signerCount: subdomainRecord.signers.length,
    signers: subdomainRecord.signers.map((s) => s.walletAddress),
    createdAt: subdomainRecord.createdAt.toISOString(),
  });
}

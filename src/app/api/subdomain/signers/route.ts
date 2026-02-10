/**
 * POST /api/subdomain/signers — Manage authorized signers for a subdomain.
 * Protection: SIWX only (NOT an x402 route — no payment).
 * Only the subdomain owner can add/remove signers. Max 50.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySIWxFromRequest } from '@/lib/siwx/verify';
import { ManageSignerRequestSchema } from '@/schemas/signers';
import { prisma } from '@/lib/db/client';

const MAX_SIGNERS = 50;

export async function POST(request: NextRequest) {
  // Parse body first (before SIWX to give better errors)
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = ManageSignerRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { action, subdomain, walletAddress } = parsed.data;

  // Verify SIWX
  const resourceUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/subdomain/signers`;
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

  // Only owner can manage signers
  if (subdomainRecord.ownerWallet.toLowerCase() !== callerWallet) {
    return NextResponse.json(
      { success: false, error: 'Only the subdomain owner can manage signers' },
      { status: 403 },
    );
  }

  if (action === 'add') {
    if (subdomainRecord.signers.length >= MAX_SIGNERS) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_SIGNERS} signers per subdomain` },
        { status: 400 },
      );
    }

    // Upsert to handle idempotent adds
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

    return NextResponse.json({ success: true, action: 'added', walletAddress });
  } else {
    // Remove signer
    await prisma.signer.deleteMany({
      where: {
        subdomainId: subdomainRecord.id,
        walletAddress: walletAddress.toLowerCase(),
      },
    });

    return NextResponse.json({ success: true, action: 'removed', walletAddress });
  }
}

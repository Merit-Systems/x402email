/**
 * POST /api/subdomain/update — Update subdomain settings.
 * Protection: SIWX only (free). Only the subdomain owner can update.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySIWxFromRequest } from '@/lib/siwx/verify';
import { UpdateSubdomainRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = UpdateSubdomainRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return NextResponse.json(
      { success: false, error: 'Validation failed', message: msg },
      { status: 400 },
    );
  }

  const { subdomain: subdomainName, catchAllForwardTo } = parsed.data;

  // Verify SIWX
  const resourceUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/subdomain/update`;
  const result = await verifySIWxFromRequest(request, resourceUri);
  if (result instanceof NextResponse) return result;

  const callerWallet = result.address.toLowerCase();

  const subdomain = await prisma.subdomain.findUnique({
    where: { name: subdomainName },
  });

  if (!subdomain) {
    return NextResponse.json(
      { success: false, error: 'Subdomain not found' },
      { status: 404 },
    );
  }

  if (subdomain.ownerWallet.toLowerCase() !== callerWallet) {
    return NextResponse.json(
      { success: false, error: 'Only the subdomain owner can update settings' },
      { status: 403 },
    );
  }

  // Build update payload — only include fields that were explicitly provided
  const updateData: Record<string, unknown> = {};
  if (catchAllForwardTo !== undefined) {
    updateData.catchAllForwardTo = catchAllForwardTo;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { success: false, error: 'No fields to update' },
      { status: 400 },
    );
  }

  const updated = await prisma.subdomain.update({
    where: { id: subdomain.id },
    data: updateData,
  });

  return NextResponse.json({
    success: true,
    subdomain: updated.name,
    catchAllForwardTo: updated.catchAllForwardTo,
  });
}

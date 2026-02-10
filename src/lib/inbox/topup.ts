import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { TopupInboxRequestSchema } from '@/schemas/inbox';

/**
 * Factory function that creates a topup handler for a given duration.
 * All three topup routes call this with different daysToAdd values.
 */
export function createTopupHandler(daysToAdd: number) {
  return async (body: unknown): Promise<NextResponse> => {
    const parsed = TopupInboxRequestSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      return NextResponse.json(
        { success: false, error: 'Validation failed', message: msg },
        { status: 400 },
      );
    }

    const { username } = parsed.data;

    const inbox = await prisma.inbox.findUnique({
      where: { username },
    });

    if (!inbox) {
      return NextResponse.json(
        { success: false, error: 'Inbox not found' },
        { status: 404 },
      );
    }

    // New expiry: max(expiresAt, now) + daysToAdd
    const base = inbox.expiresAt > new Date() ? inbox.expiresAt : new Date();
    const newExpiry = new Date(base.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    await prisma.inbox.update({
      where: { username },
      data: {
        expiresAt: newExpiry,
        active: true, // re-activate expired inboxes
      },
    });

    const daysRemaining = Math.ceil((newExpiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

    return NextResponse.json({
      success: true,
      inbox: username,
      expiresAt: newExpiry.toISOString(),
      daysRemaining,
      daysAdded: daysToAdd,
    });
  };
}

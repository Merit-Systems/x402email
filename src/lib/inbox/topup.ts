import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { TopupInboxRequestSchema } from '@/schemas/inbox';

/**
 * Factory function that creates a topup handler for a given duration.
 * All three topup routes call this with different daysToAdd values.
 *
 * Uses an atomic SQL update to avoid TOCTOU race conditions — two
 * concurrent topups both correctly extend from the latest expiresAt.
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

    // Atomic update: extends from max(expiresAt, now) + interval
    // This avoids race conditions where two concurrent topups read the
    // same expiresAt and only one extension takes effect.
    const interval = Prisma.sql`${daysToAdd} * INTERVAL '1 day'`;
    const rows = await prisma.$queryRaw<Array<{ expires_at: Date }>>`
      UPDATE "Inbox"
      SET "expiresAt" = GREATEST("expiresAt", NOW()) + ${interval},
          "active" = true
      WHERE "username" = ${username}
      RETURNING "expiresAt" AS expires_at
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Inbox not found' },
        { status: 404 },
      );
    }

    const newExpiry = rows[0].expires_at;
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

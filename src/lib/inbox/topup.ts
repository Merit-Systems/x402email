import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';

/**
 * Factory function that creates a topup handler for a given duration.
 * All three topup routes call this with different daysToAdd values.
 *
 * Uses an atomic SQL update to avoid TOCTOU race conditions — two
 * concurrent topups both correctly extend from the latest expiresAt.
 *
 * Body is already validated by the router's .body() before reaching here.
 */
export function createTopupHandler(daysToAdd: number) {
  return async (username: string) => {
    const inbox = await prisma.inbox.findUnique({
      where: { username },
    });

    if (!inbox) {
      throw Object.assign(new Error('Inbox not found'), { status: 404 });
    }

    // Atomic update: extends from max(expiresAt, now) + interval
    const interval = Prisma.sql`${daysToAdd} * INTERVAL '1 day'`;
    const rows = await prisma.$queryRaw<Array<{ expires_at: Date }>>`
      UPDATE "Inbox"
      SET "expiresAt" = GREATEST("expiresAt", NOW()) + ${interval},
          "active" = true
      WHERE "username" = ${username}
      RETURNING "expiresAt" AS expires_at
    `;

    if (rows.length === 0) {
      throw Object.assign(new Error('Inbox not found'), { status: 404 });
    }

    const newExpiry = rows[0].expires_at;
    const daysRemaining = Math.ceil((newExpiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

    return {
      success: true,
      inbox: username,
      expiresAt: newExpiry.toISOString(),
      daysRemaining,
      daysAdded: daysToAdd,
    };
  };
}

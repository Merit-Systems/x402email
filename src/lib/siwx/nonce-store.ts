/**
 * Prisma-backed NonceStore for @agentcash/router SIWX replay prevention.
 * Adapts existing SiwxNonce table to the router's NonceStore interface.
 */
import type { NonceStore } from '@agentcash/router';
import { prisma } from '@/lib/db/client';

export class PrismaNonceStore implements NonceStore {
  /**
   * Returns true if the nonce has NOT been seen (i.e., it is fresh/valid).
   * Records the nonce atomically so subsequent calls return false.
   */
  async check(nonce: string): Promise<boolean> {
    try {
      await prisma.siwxNonce.create({ data: { nonce } });
    } catch {
      // Unique constraint violation means nonce already used
      return false;
    }

    // Probabilistic cleanup (~1% of calls): delete nonces older than 24h.
    // SIWX nonces expire after 5 minutes, so 24h is very generous.
    if (Math.random() < 0.01) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await prisma.siwxNonce.deleteMany({ where: { usedAt: { lt: cutoff } } }).catch((err) => {
        console.error('[x402email] SiwxNonce cleanup failed:', err);
      });
    }

    return true;
  }
}

import type { SIWxStorage } from '@x402/extensions/sign-in-with-x';
import { prisma } from '@/lib/db/client';

export class DatabaseSIWxStorage implements SIWxStorage {
  async hasPaid(resource: string, address: string): Promise<boolean> {
    const record = await prisma.siwxPayment.findUnique({
      where: { resource_walletAddress: { resource, walletAddress: address } },
    });
    return !!record;
  }

  async recordPayment(resource: string, address: string): Promise<void> {
    await prisma.siwxPayment.upsert({
      where: { resource_walletAddress: { resource, walletAddress: address } },
      create: { resource, walletAddress: address },
      update: {},
    });
  }

  async hasUsedNonce(nonce: string): Promise<boolean> {
    const record = await prisma.siwxNonce.findUnique({ where: { nonce } });
    return !!record;
  }

  async recordNonce(nonce: string): Promise<void> {
    await prisma.siwxNonce.create({ data: { nonce } });
  }
}

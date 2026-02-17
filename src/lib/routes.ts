/**
 * Router singleton — central configuration for all x402email routes.
 */
import { createRouter } from '@agentcash/router';
import { PrismaNonceStore } from '@/lib/siwx/nonce-store';

const PAYEE = process.env.X402_PAYEE_ADDRESS ?? '0x0000000000000000000000000000000000000000';

export const router = createRouter({
  payeeAddress: PAYEE,
  network: 'eip155:8453',
  protocols: ['x402', 'mpp'],
  mpp: {
    secretKey: process.env.MPP_SECRET_KEY!,
    currency: '0x20c0000000000000000000000000000000000000', // PathUSD on Tempo
    recipient: process.env.MPP_RECIPIENT,
    rpcUrl: process.env.TEMPO_RPC_URL,
  },
  prices: {
    'send': '0.02',
    'subdomain/buy': '5',
    'subdomain/send': '0.005',
    'inbox/buy': '1',
    'inbox/send': '0.005',
    'inbox/topup': '1',
    'inbox/topup/quarter': '2.5',
    'inbox/topup/year': '8',
    'inbox/messages': '0.001',
    'inbox/messages/read': '0.001',
    'subdomain/inbox/create': '0.25',
    'subdomain/inbox/messages': '0.001',
    'subdomain/inbox/messages/read': '0.001',
  },
  siwx: { nonceStore: new PrismaNonceStore() },
});

// Re-export constants used by multiple routes
export const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';

export const INBOX_DURATIONS = { topup: 30, quarter: 90, year: 365 } as const;

export const SUBDOMAIN_INBOX_LIMITS = {
  maxInboxesPerSubdomain: 100,
  maxMessagesPerInbox: 500,
} as const;

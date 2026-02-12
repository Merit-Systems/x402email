const NETWORK = 'eip155:8453' as const; // Base mainnet

// Placeholder — set X402_PAYEE_ADDRESS in env when ready
const PAYEE = process.env.X402_PAYEE_ADDRESS ?? '0x0000000000000000000000000000000000000000';

export const PRICES = {
  send: {
    scheme: 'exact' as const,
    network: NETWORK,
    price: '0.02',
    payTo: PAYEE,
  },
  subdomainSend: {
    scheme: 'exact' as const,
    network: NETWORK,
    price: '0.005',
    payTo: PAYEE,
  },
  subdomainBuy: {
    scheme: 'exact' as const,
    network: NETWORK,
    price: '5',
    payTo: PAYEE,
  },
  inboxBuy: {
    scheme: 'exact' as const,
    network: NETWORK,
    price: '1',
    payTo: PAYEE,
  },
  inboxTopup: {
    scheme: 'exact' as const,
    network: NETWORK,
    price: '1',
    payTo: PAYEE,
  },
  inboxTopupQuarter: {
    scheme: 'exact' as const,
    network: NETWORK,
    price: '2.5',
    payTo: PAYEE,
  },
  inboxTopupYear: {
    scheme: 'exact' as const,
    network: NETWORK,
    price: '8',
    payTo: PAYEE,
  },
  inboxSend: {
    scheme: 'exact' as const,
    network: NETWORK,
    price: '0.005',
    payTo: PAYEE,
  },
  inboxMessages: {
    scheme: 'exact' as const,
    network: NETWORK,
    price: '0.001',
    payTo: PAYEE,
  },
} as const;

export const INBOX_DURATIONS = { topup: 30, quarter: 90, year: 365 } as const;

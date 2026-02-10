const NETWORK = 'eip155:8453' as const; // Base mainnet

// Placeholder — set X402_PAYEE_ADDRESS in env when ready
const PAYEE = process.env.X402_PAYEE_ADDRESS ?? '0x0000000000000000000000000000000000000000';

export const PRICES = {
  send: {
    scheme: 'exact' as const,
    network: NETWORK,
    price: '0.001',
    payTo: PAYEE,
  },
  subdomainBuy: {
    scheme: 'exact' as const,
    network: NETWORK,
    price: '50',
    payTo: PAYEE,
  },
} as const;

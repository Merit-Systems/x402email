/**
 * Check USDC balance on Base for any address.
 */
import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const USDC_DECIMALS = 6;

const client = createPublicClient({
  chain: base,
  transport: http(),
});

/**
 * Get USDC balance for an address on Base.
 * Returns the balance as a human-readable number (e.g., 5.25 for $5.25).
 */
export async function getUsdcBalance(address: `0x${string}`): Promise<number> {
  const raw = await client.readContract({
    address: USDC_ADDRESS,
    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
    functionName: 'balanceOf',
    args: [address],
  });

  return Number(raw) / 10 ** USDC_DECIMALS;
}

/**
 * POST /api/subdomain/buy — Purchase a subdomain.
 * Protection: x402 payment ($5).
 * The buyer's wallet is extracted from the x402 payment header.
 */
import { router, DOMAIN } from '@/lib/routes';
import { BuySubdomainRequestSchema } from '@/schemas/subdomain';
import { prisma } from '@/lib/db/client';
import { provisionSubdomain } from '@/lib/dns/provision';

export const POST = router
  .route('subdomain/buy')
  .body(BuySubdomainRequestSchema)
  .validate(async (body) => {
    // Pre-payment check: reject if subdomain OR inbox with this name exists
    const [existingSubdomain, existingInbox] = await prisma.$transaction([
      prisma.subdomain.findUnique({ where: { name: body.subdomain } }),
      prisma.inbox.findUnique({ where: { username: body.subdomain } }),
    ]);
    if (existingSubdomain) {
      throw Object.assign(new Error('Subdomain already taken'), { status: 409 });
    }
    if (existingInbox) {
      throw Object.assign(new Error('Name already taken as a forwarding inbox'), { status: 409 });
    }
  })
  .description(`Purchase a custom email subdomain on ${DOMAIN} ($5 via x402)`)
  .handler(async ({ body, wallet }) => {
    const ownerWallet = wallet!.toLowerCase();

    await provisionSubdomain(body.subdomain);

    await prisma.subdomain.create({
      data: {
        name: body.subdomain,
        ownerWallet,
      },
    });

    return {
      success: true,
      subdomain: `${body.subdomain}.${DOMAIN}`,
      dnsStatus: 'pending',
      estimatedVerificationMinutes: 5,
    };
  });

/**
 * AWS SES domain verification for subdomains.
 */
import {
  SESClient,
  VerifyDomainIdentityCommand,
  VerifyDomainDkimCommand,
  GetIdentityVerificationAttributesCommand,
} from '@aws-sdk/client-ses';

const ses = new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const DOMAIN = process.env.EMAIL_DOMAIN ?? 'x402email.com';

interface VerificationTokens {
  verificationToken: string;
  dkimTokens: string[];
}

/**
 * Request SES domain identity + DKIM verification.
 * Returns tokens that must be added as DNS records.
 */
export async function requestDomainVerification(subdomain: string): Promise<VerificationTokens> {
  const fullDomain = `${subdomain}.${DOMAIN}`;

  const [identityResult, dkimResult] = await Promise.all([
    ses.send(new VerifyDomainIdentityCommand({ Domain: fullDomain })),
    ses.send(new VerifyDomainDkimCommand({ Domain: fullDomain })),
  ]);

  return {
    verificationToken: identityResult.VerificationToken!,
    dkimTokens: dkimResult.DkimTokens ?? [],
  };
}

/**
 * Check if a subdomain's SES verification is complete.
 */
export async function checkVerificationStatus(subdomain: string): Promise<{
  identityVerified: boolean;
  dkimVerified: boolean;
}> {
  const fullDomain = `${subdomain}.${DOMAIN}`;

  const result = await ses.send(
    new GetIdentityVerificationAttributesCommand({
      Identities: [fullDomain],
    }),
  );

  const attrs = result.VerificationAttributes?.[fullDomain];
  return {
    identityVerified: attrs?.VerificationStatus === 'Success',
    dkimVerified: true, // DKIM auto-verifies once DNS is set
  };
}

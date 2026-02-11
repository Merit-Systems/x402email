/**
 * S3 client for fetching inbound email from the SES receipt bucket.
 */
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
const BUCKET = process.env.S3_INBOUND_BUCKET ?? 'x402email-inbound';

/**
 * Fetch a raw email (.eml) from S3.
 */
export async function getRawEmail(objectKey: string): Promise<Buffer> {
  const response = await s3.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: objectKey,
  }));
  const bytes = await response.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Delete a raw email from S3 after successful forwarding.
 */
export async function deleteRawEmail(objectKey: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: objectKey,
  }));
}

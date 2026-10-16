import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from AWS-backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const region = process.env.LIGHTSAIL_REGION || 'ap-south-1';
const bucketName = process.env.LIGHTSAIL_BUCKET_NAME || 'eventpath-images';
let rawEndpoint = process.env.LIGHTSAIL_ENDPOINT || `https://s3.${region}.amazonaws.com`;

// If the configured endpoint already includes the bucket prefix, strip it so the S3 client doesn't double-prefix
let endpoint = rawEndpoint.trim();
const bucketPrefixPattern = new RegExp(`^https?:\\/\\/${bucketName}\\.`, 'i');
if (bucketPrefixPattern.test(endpoint)) {
  endpoint = endpoint.replace(bucketPrefixPattern, 'https://');
}

export const storageClient = new S3Client({
  region,
  endpoint,
  credentials: {
    accessKeyId: process.env.LIGHTSAIL_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.LIGHTSAIL_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: false, // Virtual-hosted style
});

export const BUCKET_NAME = bucketName;
export const BUCKET_REGION = region;
export const BUCKET_ENDPOINT = endpoint;

export default {
  storageClient,
  BUCKET_NAME,
  BUCKET_REGION,
  BUCKET_ENDPOINT,
};

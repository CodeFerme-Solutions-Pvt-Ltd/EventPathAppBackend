import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from AWS-backend root directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'eventpath_super_secure_jwt_secret_key_change_in_production',
  whatsappMetaPhoneNumberId: process.env.WHATSAPP_META_PHONE_NUMBER_ID || '',
  whatsappMetaAccessToken: process.env.WHATSAPP_META_ACCESS_TOKEN || '',
  lightsailRegion: process.env.LIGHTSAIL_REGION || 'ap-south-1',
  lightsailBucketName: process.env.LIGHTSAIL_BUCKET_NAME || 'eventpath-media',
  lightsailEndpoint: process.env.LIGHTSAIL_ENDPOINT || 'https://ap-south-1.lightsailobjects.com',
};

export default config;

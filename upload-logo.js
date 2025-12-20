import { v2 as cloudinary } from 'cloudinary';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function uploadLogo() {
    try {
        console.log('Uploading TerrAqua logo to Cloudinary...');

        // Path to logo (adjust if needed)
        const logoPath = join(__dirname, '..', 'src', 'assets', 'terraqua logo.png');

        const result = await cloudinary.uploader.upload(logoPath, {
            public_id: 'terraqua_logo',
            folder: '',  // Root folder
            overwrite: true,
            resource_type: 'image'
        });

        console.log('✅ Logo uploaded successfully!');
        console.log('Public ID:', result.public_id);
        console.log('URL:', result.secure_url);
        console.log('\nYou can now use this logo in watermarks with overlay: "terraqua_logo"');

    } catch (error) {
        console.error('❌ Error uploading logo:', error.message);
        process.exit(1);
    }
}

uploadLogo();

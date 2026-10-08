import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import BackupService from '../services/backupService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const REQUIRED_ENV = [
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'BACKUP_API_URL',
    'BACKUP_API_KEY'
];

async function autoBackupCheck() {
    try {
        const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

        if (missing.length > 0) {
            throw new Error(
                `Missing .env values: ${missing.join(', ')}`
            );
        }

        console.log(
            `🕐 Check Time: ${new Date().toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata'
            })}`
        );
        console.log('🚀 Starting backup...');

        const backupService = new BackupService();

        const result = await backupService.createAndSendBackup();

        if (result.success) {
            console.log('✅ Backup created and sent successfully!');
            process.exit(0);
        }

        console.error('❌ Backup failed:', result.message);
        process.exit(1);

    } catch (error) {
        console.error('❌ Auto backup check failed:', error.message);
        process.exit(1);
    }
}

autoBackupCheck();
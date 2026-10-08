import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';

const execFilePromise = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const pad = (n) => String(n).padStart(2, '0');

class BackupService {
    constructor() {
        this.dbName = process.env.DB_NAME;
        this.dbHost = process.env.DB_HOST;
        this.dbPort = process.env.DB_PORT || '5432';
        this.dbUser = process.env.DB_USER;
        this.dbPassword = process.env.DB_PASSWORD;
        this.pgDump = process.env.PG_DUMP_PATH || 'pg_dump';

        this.backupDir = path.join(__dirname, '../backups');
        this.maxSizeMB = parseInt(process.env.MAX_BACKUP_SIZE_MB) || 25;

        this.backupApiUrl = process.env.BACKUP_API_URL;
        this.backupApiKey = process.env.BACKUP_API_KEY;

        this.siteName = process.env.SITE_NAME || this.dbName;
    }

    async ensureBackupDir() {
        await fs.mkdir(this.backupDir, { recursive: true });
        console.log('✅ Backup directory created/verified:', this.backupDir);
    }

    getISTTime() {
        return new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    }

    formatISTDisplay(d) {
        return (
            `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}, ` +
            `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} IST`
        );
    }

    generateISTTimestamp() {
        const d = this.getISTTime();
        return (
            `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
            `T${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`
        );
    }

    getSiteSlug() {
        return (this.siteName || this.dbName || 'site')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }

    async createBackup() {
        const timestamp = this.generateISTTimestamp();
        const istTime = this.getISTTime();
        const fileName = `${this.getSiteSlug()}_${this.dbName}_${timestamp}.sql`;
        const filePath = path.join(this.backupDir, fileName);

        console.log(`🔄 Starting backup for database: ${this.dbName}`);
        console.log(`📁 Backup file: ${fileName}`);
        console.log(`🕐 IST Time: ${this.formatISTDisplay(istTime)}`);

        await this.ensureBackupDir();

        const args = [
            '-h', this.dbHost,
            '-p', this.dbPort,
            '-U', this.dbUser,
            '-d', this.dbName,
            '-F', 'p',
            '-f', filePath
        ];

        // Password is passed through the environment, so it never appears in this log line
        console.log(`📝 Executing: pg_dump ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);

        try {
            try {
                await execFilePromise(this.pgDump, ['--version']);
            } catch {
                throw new Error(
                    'pg_dump is not installed or not in PATH. Install PostgreSQL client tools or set PG_DUMP_PATH in .env.'
                );
            }

            await execFilePromise(this.pgDump, args, {
                env: { ...process.env, PGPASSWORD: this.dbPassword }
            });

            const stats = await fs.stat(filePath);

            if (stats.size === 0) {
                throw new Error('Backup failed: dump file is empty.');
            }

            const sizeInMB = stats.size / (1024 * 1024);
            console.log(`✅ Backup created: ${fileName} (${sizeInMB.toFixed(2)} MB)`);

            return {
                success: true,
                filePath,
                fileName,
                size: stats.size,
                sizeInMB,
                timestamp,
                siteName: this.siteName,
                displayTime: this.formatISTDisplay(istTime),
                collections: [fileName]
            };
        } catch (error) {
            await fs.rm(filePath, { force: true });
            console.error('❌ Backup creation failed:', error.message);
            throw error;
        }
    }

    async createZip(backupInfo) {
        const zipFileName = `${backupInfo.fileName}.zip`;
        const zipFilePath = path.join(this.backupDir, zipFileName);

        console.log(`📦 Creating ZIP: ${zipFileName}`);

        const zip = new AdmZip();
        zip.addLocalFile(backupInfo.filePath);
        zip.writeZip(zipFilePath);

        const stats = await fs.stat(zipFilePath);
        const sizeInMB = stats.size / (1024 * 1024);

        console.log(`✅ ZIP created: ${zipFileName} (${sizeInMB.toFixed(2)} MB)`);

        if (sizeInMB > this.maxSizeMB) {
            console.warn(
                `⚠️ ZIP is above MAX_BACKUP_SIZE_MB (${this.maxSizeMB}). The upload may be rejected.`
            );
        }

        return zipFilePath;
    }

    async sendToBackupWebsite(zipFilePath, backupInfo) {
        if (!this.backupApiUrl) {
            console.log('⚠️ BACKUP_API_URL not configured. Skipping website upload.');
            return { success: false, message: 'BACKUP_API_URL not configured' };
        }

        if (!this.backupApiKey) {
            console.log('⚠️ BACKUP_API_KEY not configured. Skipping website upload.');
            return { success: false, message: 'BACKUP_API_KEY not configured' };
        }

        console.log(`📤 Sending backup to website: ${this.backupApiUrl}`);

        const fileBuffer = await fs.readFile(zipFilePath);

        const formData = new FormData();
        formData.append('backup', new Blob([fileBuffer]), path.basename(zipFilePath));
        formData.append('siteName', backupInfo.siteName || this.siteName);
        formData.append('database', this.dbName);
        formData.append('timestamp', backupInfo.timestamp);
        formData.append('displayTime', backupInfo.displayTime);
        formData.append('sizeInMB', String(backupInfo.sizeInMB));
        formData.append('collections', JSON.stringify(backupInfo.collections || []));

        const headers = { Authorization: `Bearer ${this.backupApiKey}` };

        const MAX_RETRIES = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            try {
                console.log(`🔄 Attempt ${attempt}/${MAX_RETRIES}...`);

                const response = await fetch(this.backupApiUrl, {
                    method: 'POST',
                    headers,
                    body: formData,
                    signal: controller.signal
                });

                const text = await response.text();
                let result;

                try {
                    result = JSON.parse(text);
                } catch {
                    result = { message: text };
                }

                if (response.ok) {
                    console.log('✅ Backup sent to website successfully!');
                    return { success: true, data: result };
                }

                console.error(`❌ Attempt ${attempt} failed (HTTP ${response.status}):`, result);
                lastError = result;

                // Client errors (except 429) will not succeed on retry
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    return { success: false, error: result };
                }
            } catch (fetchError) {
                const reason = fetchError.cause?.code || fetchError.cause?.message || '';
                console.error(
                    `❌ Attempt ${attempt} fetch error: ${fetchError.message}${reason ? ` (${reason})` : ''}`
                );
                lastError = fetchError.message;
            } finally {
                clearTimeout(timeoutId);
            }

            if (attempt < MAX_RETRIES) {
                const seconds = 2 * attempt;
                console.log(`⏳ Waiting ${seconds} seconds before retry...`);
                await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
            }
        }

        console.error(`❌ All ${MAX_RETRIES} attempts failed.`);
        return { success: false, error: lastError };
    }

    async createAndSendBackup() {
        let backupInfo = null;

        try {
            backupInfo = await this.createBackup();
            const zipFilePath = await this.createZip(backupInfo);
            const websiteResult = await this.sendToBackupWebsite(zipFilePath, backupInfo);

            if (!websiteResult.success) {
                // Keep the ZIP so the backup is not lost
                console.log(`💾 ZIP kept for manual upload: ${zipFilePath}`);

                return {
                    success: false,
                    message: `Upload failed. ZIP kept at ${zipFilePath}`,
                    zipFilePath,
                    backupInfo,
                    websiteResult
                };
            }

            await fs.unlink(zipFilePath);
            console.log(`🧹 Cleaned up ZIP file: ${path.basename(zipFilePath)}`);

            return {
                success: true,
                message: 'Backup created and sent to Backup Website successfully',
                backupInfo,
                websiteResult
            };
        } catch (error) {
            console.error('❌ Backup process failed:', error.message);
            throw error;
        } finally {
            if (backupInfo) {
                await fs.rm(backupInfo.filePath, { force: true });
                console.log(`🧹 Cleaned up backup file: ${backupInfo.fileName}`);
            }
        }
    }

    async listBackups() {
        return [];
    }

    async getBackupStats() {
        return { totalBackups: 0, totalSizeMB: 0, latestBackup: null, averageSizeMB: 0 };
    }

    async deleteBackup() {
        return { success: false, message: 'Backup history is not enabled.' };
    }
}

export default BackupService;
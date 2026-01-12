const cron = require('node-cron');
const db = require('../config/database');

/**
 * Database Cleanup Job
 * Runs daily at 2 AM to clean up old data
 */

async function cleanupMessageQueues() {
    try {
        console.log('🧹 Cleaning up old message queues...');

        // Delete sent messages older than 30 days
        const [sentResult] = await db.query(`
            DELETE FROM message_queues 
            WHERE status = 'sent' 
            AND updated_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
        `);

        // Delete failed messages older than 7 days
        const [failedResult] = await db.query(`
            DELETE FROM message_queues 
            WHERE status = 'failed' 
            AND updated_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
        `);

        console.log(`✅ Deleted ${sentResult.affectedRows} sent messages (>30 days)`);
        console.log(`✅ Deleted ${failedResult.affectedRows} failed messages (>7 days)`);

        return {
            sentDeleted: sentResult.affectedRows,
            failedDeleted: failedResult.affectedRows
        };
    } catch (error) {
        console.error('❌ Error cleaning message queues:', error);
        throw error;
    }
}

async function cleanupApiLogs() {
    try {
        console.log('🧹 Cleaning up old API logs...');

        // Delete logs older than 1 year
        const [result] = await db.query(`
            DELETE FROM api_logs 
            WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 YEAR)
        `);

        console.log(`✅ Deleted ${result.affectedRows} API logs (>1 year)`);

        return {
            logsDeleted: result.affectedRows
        };
    } catch (error) {
        console.error('❌ Error cleaning API logs:', error);
        throw error;
    }
}

async function cleanupScanHistory() {
    try {
        console.log('🧹 Cleaning up old scan history...');

        // Delete scan history older than 6 months
        const [result] = await db.query(`
            DELETE FROM scan_history 
            WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH)
        `);

        console.log(`✅ Deleted ${result.affectedRows} scan history records (>6 months)`);

        return {
            scansDeleted: result.affectedRows
        };
    } catch (error) {
        console.error('❌ Error cleaning scan history:', error);
        throw error;
    }
}

async function getTableSizes() {
    try {
        const [rows] = await db.query(`
            SELECT 
                table_name AS tableName,
                ROUND(((data_length + index_length) / 1024 / 1024), 2) AS sizeMB,
                table_rows AS rowCount
            FROM information_schema.TABLES
            WHERE table_schema = DATABASE()
            AND table_name IN ('attendance', 'api_logs', 'message_queues', 'scan_history', 'absensi_guru')
            ORDER BY (data_length + index_length) DESC
        `);

        return rows;
    } catch (error) {
        console.error('❌ Error getting table sizes:', error);
        throw error;
    }
}

async function runCleanup() {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🚀 Starting database cleanup job...');
    console.log(`⏰ Time: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
    console.log('═══════════════════════════════════════════════════\n');

    try {
        // Get table sizes before cleanup
        console.log('📊 Table sizes BEFORE cleanup:');
        const beforeSizes = await getTableSizes();
        beforeSizes.forEach(table => {
            console.log(`   ${table.tableName}: ${table.sizeMB} MB (${table.rowCount.toLocaleString()} rows)`);
        });
        console.log('');

        // Run cleanup tasks
        const messageResult = await cleanupMessageQueues();
        const apiResult = await cleanupApiLogs();
        const scanResult = await cleanupScanHistory();

        // Get table sizes after cleanup
        console.log('\n📊 Table sizes AFTER cleanup:');
        const afterSizes = await getTableSizes();
        afterSizes.forEach(table => {
            console.log(`   ${table.tableName}: ${table.sizeMB} MB (${table.rowCount.toLocaleString()} rows)`);
        });

        // Summary
        console.log('\n═══════════════════════════════════════════════════');
        console.log('✅ Cleanup completed successfully!');
        console.log(`   - Message queues: ${messageResult.sentDeleted + messageResult.failedDeleted} deleted`);
        console.log(`   - API logs: ${apiResult.logsDeleted} deleted`);
        console.log(`   - Scan history: ${scanResult.scansDeleted} deleted`);
        console.log('═══════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('\n❌ Cleanup job failed:', error);
        console.error('═══════════════════════════════════════════════════\n');
    }
}

// Schedule cleanup to run daily at 2 AM
function startCleanupScheduler() {
    console.log('📅 Cleanup scheduler started');
    console.log('⏰ Scheduled to run daily at 02:00 AM (Asia/Jakarta)');

    // Run at 2 AM every day
    cron.schedule('0 2 * * *', () => {
        runCleanup();
    }, {
        timezone: 'Asia/Jakarta'
    });

    // Optional: Run immediately on startup (for testing)
    // Uncomment the line below if you want to run cleanup on server start
    // runCleanup();
}

// Manual cleanup function (can be called from API endpoint)
async function manualCleanup() {
    return await runCleanup();
}

module.exports = {
    startCleanupScheduler,
    manualCleanup,
    getTableSizes
};

const cron = require('node-cron');
const db = require('../config/database');
const whatsapp = require('../config/whatsapp');
const messageService = require('../services/messageService');
const moment = require('moment-timezone');

moment.tz.setDefault('Asia/Jakarta');

/**
 * Get school checkout time from database
 */
async function getSchoolCheckoutTime() {
    try {
        // Query school settings for checkout time
        // Adjust table/column names based on your actual schema
        const [rows] = await db.query(`
            SELECT akhir_absen_pulang 
            FROM school_settings 
            LIMIT 1
        `);

        if (rows.length > 0 && rows[0].akhir_absen_pulang) {
            // Parse time (format: HH:mm:ss)
            const time = moment(rows[0].akhir_absen_pulang, 'HH:mm:ss');
            return {
                hour: time.hour(),
                minute: time.minute()
            };
        }

        // Default fallback: 15:00 (3 PM)
        return { hour: 15, minute: 0 };
    } catch (error) {
        console.error('❌ Error getting school checkout time:', error);
        // Fallback to default
        return { hour: 15, minute: 0 };
    }
}

/**
 * Get students needing checkout grouped by teacher
 */
async function getStudentsNeedingCheckout() {
    try {
        const today = moment().format('YYYY-MM-DD');

        const [rows] = await db.query(`
            SELECT 
                g.id as teacher_id,
                g.nama as teacher_name,
                g.no_wa as teacher_phone,
                s.id as student_id,
                s.nama as student_name,
                s.nis as student_nis,
                k.nama_kelas as class_name,
                a.jam_masuk
            FROM attendance a
            INNER JOIN siswa s ON a.student_id = s.id
            INNER JOIN guru g ON a.checked_in_by_teacher_id = g.id
            LEFT JOIN kelas k ON s.kelas_id = k.id
            WHERE a.tanggal = ?
            AND a.jam_masuk IS NOT NULL
            AND a.jam_pulang IS NULL
            AND a.checked_in_by_teacher_id IS NOT NULL
            ORDER BY g.id, s.nama
        `, [today]);

        // Group by teacher
        const teacherMap = new Map();

        rows.forEach(row => {
            if (!teacherMap.has(row.teacher_id)) {
                teacherMap.set(row.teacher_id, {
                    teacherId: row.teacher_id,
                    teacherName: row.teacher_name,
                    teacherPhone: row.teacher_phone,
                    students: []
                });
            }

            teacherMap.get(row.teacher_id).students.push({
                studentId: row.student_id,
                studentName: row.student_name,
                studentNis: row.student_nis,
                className: row.class_name,
                jamMasuk: row.jam_masuk
            });
        });

        return Array.from(teacherMap.values());
    } catch (error) {
        console.error('❌ Error getting students needing checkout:', error);
        throw error;
    }
}

/**
 * Send checkout reminders to teachers
 */
async function sendCheckoutReminders() {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🔔 Starting checkout reminder job...');
    console.log(`⏰ Time: ${moment().format('HH:mm:ss')}`);
    console.log('═══════════════════════════════════════════════════\n');

    try {
        const teachersWithPendingCheckouts = await getStudentsNeedingCheckout();

        if (teachersWithPendingCheckouts.length === 0) {
            console.log('✅ No pending checkouts found. All students checked out!');
            console.log('═══════════════════════════════════════════════════\n');
            return;
        }

        console.log(`📊 Found ${teachersWithPendingCheckouts.length} teacher(s) with pending checkouts\n`);

        let totalReminders = 0;
        let successCount = 0;
        let failCount = 0;

        for (const teacher of teachersWithPendingCheckouts) {
            try {
                if (!teacher.teacherPhone) {
                    console.log(`⚠️ Teacher ${teacher.teacherName} has no phone number, skipping...`);
                    failCount++;
                    continue;
                }

                const message = messageService.generateCheckoutReminderMessage(
                    teacher.teacherName,
                    teacher.students
                );

                await whatsapp.sendMessage(teacher.teacherPhone, message);

                console.log(`✅ Reminder sent to ${teacher.teacherName} (${teacher.students.length} student(s))`);
                successCount++;
                totalReminders++;

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.error(`❌ Failed to send reminder to ${teacher.teacherName}:`, error.message);
                failCount++;
            }
        }

        console.log('\n═══════════════════════════════════════════════════');
        console.log('✅ Checkout reminder job completed!');
        console.log(`   - Reminders sent: ${successCount}`);
        console.log(`   - Failed: ${failCount}`);
        console.log('═══════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('\n❌ Checkout reminder job failed:', error);
        console.error('═══════════════════════════════════════════════════\n');
    }
}

/**
 * Start reminder scheduler
 */
async function startReminderScheduler() {
    try {
        // Get school checkout time
        const checkoutTime = await getSchoolCheckoutTime();

        console.log('📅 Checkout reminder scheduler started');
        console.log(`⏰ Scheduled to run daily at ${String(checkoutTime.hour).padStart(2, '0')}:${String(checkoutTime.minute).padStart(2, '0')} (Asia/Jakarta)`);

        // Schedule reminder at checkout time
        cron.schedule(`${checkoutTime.minute} ${checkoutTime.hour} * * *`, () => {
            sendCheckoutReminders();
        }, {
            timezone: 'Asia/Jakarta'
        });

        // Optional: Run immediately on startup for testing
        // Uncomment to test on server start
        // await sendCheckoutReminders();

    } catch (error) {
        console.error('❌ Failed to start reminder scheduler:', error);
    }
}

/**
 * Manual trigger for testing
 */
async function manualReminder() {
    return await sendCheckoutReminders();
}

module.exports = {
    startReminderScheduler,
    manualReminder,
    getStudentsNeedingCheckout
};

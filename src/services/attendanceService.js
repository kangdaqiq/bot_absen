const db = require('../config/database');
const moment = require('moment-timezone');

moment.tz.setDefault('Asia/Jakarta');

/**
 * Get student by phone number
 */
async function getStudentByPhone(phoneNumber) {
    try {
        // Normalize phone number for comparison
        let normalizedPhone = phoneNumber.replace(/\D/g, '');

        // Try different formats
        const phoneVariants = [
            normalizedPhone,
            normalizedPhone.startsWith('62') ? '0' + normalizedPhone.substring(2) : normalizedPhone,
            normalizedPhone.startsWith('0') ? '62' + normalizedPhone.substring(1) : normalizedPhone,
            normalizedPhone.replace(/^62/, ''),
            normalizedPhone.replace(/^0/, '')
        ];

        const [rows] = await db.query(
            `SELECT s.*, k.nama_kelas 
             FROM siswa s 
             LEFT JOIN kelas k ON s.kelas_id = k.id 
             WHERE s.no_wa IN (?) 
             LIMIT 1`,
            [phoneVariants]
        );

        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Error getting student:', error);
        throw error;
    }
}

/**
 * Get today's attendance for a student
 */
async function getTodayAttendance(studentId) {
    try {
        const today = moment().format('YYYY-MM-DD');

        const [rows] = await db.query(
            `SELECT * FROM attendance 
             WHERE student_id = ? AND tanggal = ?`,
            [studentId, today]
        );

        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Error getting today attendance:', error);
        throw error;
    }
}

/**
 * Get attendance recap for a student
 */
async function getAttendanceRecap(studentId, period = 'today') {
    try {
        let startDate, endDate;
        const now = moment();

        switch (period) {
            case 'week':
                startDate = now.clone().startOf('week').format('YYYY-MM-DD');
                endDate = now.clone().endOf('week').format('YYYY-MM-DD');
                break;
            case 'month':
                startDate = now.clone().startOf('month').format('YYYY-MM-DD');
                endDate = now.clone().endOf('month').format('YYYY-MM-DD');
                break;
            case 'today':
            default:
                startDate = now.format('YYYY-MM-DD');
                endDate = now.format('YYYY-MM-DD');
                break;
        }

        const [rows] = await db.query(
            `SELECT * FROM attendance 
             WHERE student_id = ? 
             AND tanggal BETWEEN ? AND ?
             ORDER BY tanggal DESC`,
            [studentId, startDate, endDate]
        );

        // Calculate statistics
        const stats = {
            total: rows.length,
            hadir: rows.filter(r => r.status === 'H').length,
            izin: rows.filter(r => r.status === 'I').length,
            sakit: rows.filter(r => r.status === 'S').length,
            alpha: rows.filter(r => r.status === 'A').length,
            bolos: rows.filter(r => r.status === 'B').length,
            records: rows
        };

        return stats;
    } catch (error) {
        console.error('Error getting attendance recap:', error);
        throw error;
    }
}

/**
 * Format attendance status
 */
function formatStatus(status) {
    const statusMap = {
        'H': '✅ Hadir',
        'I': '📝 Izin',
        'S': '🤒 Sakit',
        'A': '❌ Alpha',
        'B': '🚫 Bolos',
        'P': '🏠 Pulang'
    };
    return statusMap[status] || status;
}

/**
 * Format time duration
 */
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '-';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours} jam ${minutes} menit`;
    }
    return `${minutes} menit`;
}

/**
 * Get teacher by phone number
 */
async function getTeacherByPhone(phoneNumber) {
    try {
        // Normalize phone number for comparison
        let normalizedPhone = phoneNumber.replace(/\D/g, '');

        // Try different formats
        const phoneVariants = [
            normalizedPhone,
            normalizedPhone.startsWith('62') ? '0' + normalizedPhone.substring(2) : normalizedPhone,
            normalizedPhone.startsWith('0') ? '62' + normalizedPhone.substring(1) : normalizedPhone,
            normalizedPhone.replace(/^62/, ''),
            normalizedPhone.replace(/^0/, '')
        ];

        const [rows] = await db.query(
            `SELECT * FROM guru 
             WHERE no_wa IN (?) 
             LIMIT 1`,
            [phoneVariants]
        );

        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Error getting teacher:', error);
        throw error;
    }
}

/**
 * Search students by name (fuzzy search)
 */
async function searchStudentsByName(searchTerm) {
    try {
        const [rows] = await db.query(
            `SELECT s.*, k.nama_kelas 
             FROM siswa s 
             LEFT JOIN kelas k ON s.kelas_id = k.id 
             WHERE s.nama LIKE ? 
             ORDER BY s.nama 
             LIMIT 10`,
            [`%${searchTerm}%`]
        );

        return rows;
    } catch (error) {
        console.error('Error searching students:', error);
        throw error;
    }
}

/**
 * Create manual attendance record
 */
async function createManualAttendance(studentId, status, teacherId, teacherName, keterangan) {
    try {
        const today = moment().format('YYYY-MM-DD');
        const now = moment().format('HH:mm:ss');

        // Check if attendance already exists for today
        const [existing] = await db.query(
            `SELECT * FROM attendance 
             WHERE student_id = ? AND tanggal = ?`,
            [studentId, today]
        );

        // Use teacher's keterangan
        const finalKeterangan = keterangan || `Absen manual oleh ${teacherName}`;

        if (existing.length > 0) {
            // Update existing attendance
            // Only update jam_masuk if status is Hadir (H)
            if (status === 'H') {
                await db.query(
                    `UPDATE attendance 
                     SET jam_masuk = ?, status = ?, keterangan = ?, updated_at = NOW() 
                     WHERE student_id = ? AND tanggal = ?`,
                    [now, status, finalKeterangan, studentId, today]
                );
            } else {
                // For non-Hadir status, don't update jam_masuk
                await db.query(
                    `UPDATE attendance 
                     SET status = ?, keterangan = ?, updated_at = NOW() 
                     WHERE student_id = ? AND tanggal = ?`,
                    [status, finalKeterangan, studentId, today]
                );
            }
        } else {
            // Create new attendance record
            // Only set jam_masuk if status is Hadir (H)
            if (status === 'H') {
                await db.query(
                    `INSERT INTO attendance 
                     (student_id, tanggal, jam_masuk, status, keterangan, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
                    [studentId, today, now, status, finalKeterangan]
                );
            } else {
                // For non-Hadir status, don't set jam_masuk
                await db.query(
                    `INSERT INTO attendance 
                     (student_id, tanggal, status, keterangan, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, NOW(), NOW())`,
                    [studentId, today, status, finalKeterangan]
                );
            }
        }

        return true;
    } catch (error) {
        console.error('Error creating manual attendance:', error);
        throw error;
    }
}

/**
 * Search students with attendance today (for edit/delete)
 */
async function searchStudentsWithAttendanceToday(searchTerm) {
    try {
        const today = moment().format('YYYY-MM-DD');

        const [rows] = await db.query(
            `SELECT s.*, k.nama_kelas, a.status, a.keterangan, a.jam_masuk
             FROM siswa s 
             LEFT JOIN kelas k ON s.kelas_id = k.id 
             INNER JOIN attendance a ON s.id = a.student_id AND a.tanggal = ?
             WHERE s.nama LIKE ? 
             ORDER BY s.nama 
             LIMIT 10`,
            [today, `%${searchTerm}%`]
        );

        return rows;
    } catch (error) {
        console.error('Error searching students with attendance:', error);
        throw error;
    }
}

/**
 * Get student attendance today
 */
async function getStudentAttendanceToday(studentId) {
    try {
        const today = moment().format('YYYY-MM-DD');

        const [rows] = await db.query(
            `SELECT a.*, s.nama, k.nama_kelas
             FROM attendance a
             INNER JOIN siswa s ON a.student_id = s.id
             LEFT JOIN kelas k ON s.kelas_id = k.id
             WHERE a.student_id = ? AND a.tanggal = ?`,
            [studentId, today]
        );

        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Error getting student attendance today:', error);
        throw error;
    }
}

/**
 * Update attendance status
 */
async function updateAttendanceStatus(studentId, status, teacherName) {
    try {
        const today = moment().format('YYYY-MM-DD');
        const keterangan = `Status diubah oleh ${teacherName}`;

        await db.query(
            `UPDATE attendance 
             SET status = ?, keterangan = ?, updated_at = NOW() 
             WHERE student_id = ? AND tanggal = ?`,
            [status, keterangan, studentId, today]
        );

        return true;
    } catch (error) {
        console.error('Error updating attendance status:', error);
        throw error;
    }
}

/**
 * Update attendance keterangan
 */
async function updateAttendanceKeterangan(studentId, keterangan, teacherName) {
    try {
        const today = moment().format('YYYY-MM-DD');
        const finalKeterangan = `${keterangan} (diubah oleh ${teacherName})`;

        await db.query(
            `UPDATE attendance 
             SET keterangan = ?, updated_at = NOW() 
             WHERE student_id = ? AND tanggal = ?`,
            [finalKeterangan, studentId, today]
        );

        return true;
    } catch (error) {
        console.error('Error updating attendance keterangan:', error);
        throw error;
    }
}

/**
 * Delete attendance today
 */
async function deleteAttendanceToday(studentId, teacherName) {
    try {
        const today = moment().format('YYYY-MM-DD');

        await db.query(
            `DELETE FROM attendance 
             WHERE student_id = ? AND tanggal = ?`,
            [studentId, today]
        );

        return true;
    } catch (error) {
        console.error('Error deleting attendance:', error);
        throw error;
    }
}

/**
 * Quick check-in (masuk) - Record jam_masuk and set status to Hadir
 */
async function quickCheckin(studentId, teacherName) {
    try {
        const today = moment().format('YYYY-MM-DD');
        const now = moment().format('HH:mm:ss');

        // Check if attendance already exists for today
        const [existing] = await db.query(
            `SELECT * FROM attendance 
             WHERE student_id = ? AND tanggal = ?`,
            [studentId, today]
        );

        const keterangan = `Absen masuk oleh ${teacherName}`;

        if (existing.length > 0) {
            // Update existing attendance - set jam_masuk and status to Hadir
            await db.query(
                `UPDATE attendance 
                 SET jam_masuk = ?, status = 'H', keterangan = ?, updated_at = NOW() 
                 WHERE student_id = ? AND tanggal = ?`,
                [now, keterangan, studentId, today]
            );
        } else {
            // Create new attendance record with Hadir status
            await db.query(
                `INSERT INTO attendance 
                 (student_id, tanggal, jam_masuk, status, keterangan, created_at, updated_at) 
                 VALUES (?, ?, ?, 'H', ?, NOW(), NOW())`,
                [studentId, today, now, keterangan]
            );
        }

        return true;
    } catch (error) {
        console.error('Error quick check-in:', error);
        throw error;
    }
}

/**
 * Quick check-out (pulang) - Record jam_pulang only
 */
async function quickCheckout(studentId, teacherName) {
    try {
        const today = moment().format('YYYY-MM-DD');
        const now = moment().format('HH:mm:ss');

        // Check if attendance exists for today
        const [existing] = await db.query(
            `SELECT * FROM attendance 
             WHERE student_id = ? AND tanggal = ?`,
            [studentId, today]
        );

        if (existing.length === 0) {
            // No attendance record found
            return { success: false, message: 'No attendance found' };
        }

        // Update jam_pulang
        await db.query(
            `UPDATE attendance 
             SET jam_pulang = ?, updated_at = NOW() 
             WHERE student_id = ? AND tanggal = ?`,
            [now, studentId, today]
        );

        return { success: true, jamMasuk: existing[0].jam_masuk };
    } catch (error) {
        console.error('Error quick check-out:', error);
        throw error;
    }
}

/**
 * Get student by NIS (for partial verification)
 */
async function getStudentByNIS(nis) {
    try {
        const [rows] = await db.query(
            `SELECT s.*, k.nama_kelas 
             FROM siswa s 
             LEFT JOIN kelas k ON s.kelas_id = k.id 
             WHERE s.nis = ? 
             LIMIT 1`,
            [nis]
        );

        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Error getting student by NIS:', error);
        throw error;
    }
}

/**
 * Get student by NIS and Date of Birth
 */
async function getStudentByNISAndDate(nis, tglLahir) {
    try {
        // Query assumed tgl_lahir column based on user instruction
        const [rows] = await db.query(
            `SELECT s.*, k.nama_kelas 
             FROM siswa s 
             LEFT JOIN kelas k ON s.kelas_id = k.id 
             WHERE s.nis = ? AND s.tgl_lahir = ? 
             LIMIT 1`,
            [nis, tglLahir]
        );

        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Error getting student by NIS and Date:', error);
        throw error;
    }
}

/**
 * Register student phone number
 */
async function registerStudentPhone(studentId, phoneNumber) {
    try {
        // Normalize phone number
        let normalizedPhone = phoneNumber.replace(/\D/g, '');
        if (normalizedPhone.startsWith('0')) {
            normalizedPhone = '62' + normalizedPhone.substring(1);
        } else if (!normalizedPhone.startsWith('62')) {
            normalizedPhone = '62' + normalizedPhone;
        }

        await db.query(
            `UPDATE siswa 
             SET no_wa = ?, updated_at = NOW() 
             WHERE id = ?`,
            [normalizedPhone, studentId]
        );

        return true;
    } catch (error) {
        console.error('Error registering student phone:', error);
        throw error;
    }
}

module.exports = {
    getStudentByPhone,
    getTeacherByPhone,
    getTodayAttendance,
    getAttendanceRecap,
    searchStudentsByName,
    searchStudentsWithAttendanceToday,
    getStudentAttendanceToday,
    createManualAttendance,
    updateAttendanceStatus,
    updateAttendanceKeterangan,
    deleteAttendanceToday,
    quickCheckin,
    quickCheckout,
    getStudentByNIS,
    getStudentByNISAndDate,
    registerStudentPhone,
    formatStatus,
    formatDuration
};

const moment = require('moment-timezone');
const { formatStatus, formatDuration } = require('./attendanceService');

moment.tz.setDefault('Asia/Jakarta');

/**
 * Parse command from message
 */
function parseCommand(message) {
    const text = message.toLowerCase().trim();

    // Check for help/menu
    if (text === 'help' || text === 'menu' || text === 'bantuan') {
        return { command: 'help' };
    }

    // Check for attendance check
    if (text === 'absen' || text === 'cek absen' || text === 'absensi' || text === 'cek absensi') {
        return { command: 'check_today' };
    }

    // Check for recap
    if (text === 'rekap' || text === 'rekap hari ini' || text === 'rekap harian') {
        return { command: 'recap', period: 'today' };
    }

    if (text === 'rekap minggu' || text === 'rekap minggu ini' || text === 'rekap mingguan') {
        return { command: 'recap', period: 'week' };
    }

    if (text === 'rekap bulan' || text === 'rekap bulan ini' || text === 'rekap bulanan') {
        return { command: 'recap', period: 'month' };
    }

    return { command: 'unknown' };
}

/**
 * Parse teacher command from message
 */
function parseTeacherCommand(message) {
    const text = message.toLowerCase().trim();

    // Check for help/menu
    if (text === 'help' || text === 'menu' || text === 'bantuan') {
        return { command: 'teacher_help' };
    }

    // Check for quick check-in: "masuk [nama]"
    const masukMatch = text.match(/^masuk\s+(.+)$/);
    if (masukMatch) {
        return { command: 'quick_checkin', searchTerm: masukMatch[1] };
    }

    // Check for quick check-out: "pulang [nama]"
    const pulangMatch = text.match(/^pulang\s+(.+)$/);
    if (pulangMatch) {
        return { command: 'quick_checkout', searchTerm: pulangMatch[1] };
    }

    // Check for edit attendance: "edit absen [nama]" or "ubah absen [nama]"
    const editMatch = text.match(/^(edit|ubah)\s+absen\s+(.+)$/);
    if (editMatch) {
        return { command: 'edit_attendance', searchTerm: editMatch[2] };
    }

    // Check for delete attendance: "hapus absen [nama]" or "delete absen [nama]"
    const deleteMatch = text.match(/^(hapus|delete)\s+absen\s+(.+)$/);
    if (deleteMatch) {
        return { command: 'delete_attendance', searchTerm: deleteMatch[2] };
    }

    // Check for manual attendance: "absen [nama]"
    const absenMatch = text.match(/^absen\s+(.+)$/);
    if (absenMatch) {
        return { command: 'search_student', searchTerm: absenMatch[1] };
    }

    // Check for confirmation: "ya" or "tidak"
    if (text === 'ya' || text === 'yes') {
        return { command: 'confirm_yes' };
    }
    if (text === 'tidak' || text === 'no' || text === 'batal') {
        return { command: 'confirm_no' };
    }

    // Check for numeric selection (1, 2, 3, etc.)
    if (/^\d+$/.test(text)) {
        return { command: 'select_option', option: parseInt(text) };
    }

    return { command: 'unknown' };
}

/**
 * Generate help message
 */
function generateHelpMessage(studentName) {
    return `👋 *Assalamualaikum, ${studentName}!*

Selamat datang di *Bot Absensi SMK Assuniyah* 🎓

📋 *Daftar Perintah:*

1️⃣ *Cek Absensi Hari Ini*
   Ketik: \`absen\` atau \`cek absen\`
   
2️⃣ *Rekap Harian*
   Ketik: \`rekap\` atau \`rekap hari ini\`
   
3️⃣ *Rekap Mingguan*
   Ketik: \`rekap minggu\`
   
4️⃣ *Rekap Bulanan*
   Ketik: \`rekap bulan\`
   
5️⃣ *Menu Bantuan*
   Ketik: \`help\` atau \`menu\`

💡 _Cukup ketik perintah di atas untuk menggunakan bot ini._

Semangat belajar! 📚✨`;
}

/**
 * Generate today attendance message
 */
function generateTodayAttendanceMessage(student, attendance) {
    const today = moment().format('dddd, DD MMMM YYYY');

    if (!attendance) {
        return `📅 *Absensi Hari Ini*

👤 Nama: *${student.nama}*
🎓 Kelas: ${student.nama_kelas || '-'}
📆 Tanggal: ${today}

❌ *Belum ada data absensi hari ini*

_Pastikan Anda sudah melakukan absensi masuk._`;
    }

    const jamMasuk = attendance.jam_masuk ? moment(attendance.jam_masuk, 'HH:mm:ss').format('HH:mm') : '-';
    const jamPulang = attendance.jam_pulang ? moment(attendance.jam_pulang, 'HH:mm:ss').format('HH:mm') : '-';
    const durasi = formatDuration(attendance.total_seconds);
    const status = formatStatus(attendance.status);

    let message = `📅 *Absensi Hari Ini*

👤 Nama: *${student.nama}*
🎓 Kelas: ${student.nama_kelas || '-'}
📆 Tanggal: ${today}

⏰ Jam Masuk: ${jamMasuk}
🏠 Jam Pulang: ${jamPulang}
⏱️ Durasi: ${durasi}
📊 Status: ${status}`;

    if (attendance.keterangan) {
        message += `\n📝 Keterangan: ${attendance.keterangan}`;
    }

    if (!attendance.jam_pulang) {
        message += `\n\n⚠️ _Jangan lupa absen pulang ya!_`;
    }

    return message;
}

/**
 * Generate recap message
 */
function generateRecapMessage(student, stats, period) {
    let periodText = '';
    let dateRange = '';

    switch (period) {
        case 'week':
            periodText = 'Minggu Ini';
            dateRange = `${moment().startOf('week').format('DD MMM')} - ${moment().endOf('week').format('DD MMM YYYY')}`;
            break;
        case 'month':
            periodText = 'Bulan Ini';
            dateRange = moment().format('MMMM YYYY');
            break;
        case 'today':
        default:
            periodText = 'Hari Ini';
            dateRange = moment().format('dddd, DD MMMM YYYY');
            break;
    }

    let message = `📊 *Rekap Absensi ${periodText}*

👤 Nama: *${student.nama}*
🎓 Kelas: ${student.nama_kelas || '-'}
📅 Periode: ${dateRange}

📈 *Statistik:*
✅ Hadir: ${stats.hadir}
📝 Izin: ${stats.izin}
🤒 Sakit: ${stats.sakit}
❌ Alpha: ${stats.alpha}
🚫 Bolos: ${stats.bolos}
━━━━━━━━━━━━━━
📊 Total: ${stats.total} hari`;

    // Add detailed records if not too many
    if (stats.records.length > 0 && stats.records.length <= 7) {
        message += `\n\n📋 *Detail Absensi:*\n`;

        stats.records.forEach((record, index) => {
            const date = moment(record.tanggal).format('DD/MM/YYYY');
            const jamMasuk = record.jam_masuk ? moment(record.jam_masuk, 'HH:mm:ss').format('HH:mm') : '-';
            const jamPulang = record.jam_pulang ? moment(record.jam_pulang, 'HH:mm:ss').format('HH:mm') : '-';
            const status = formatStatus(record.status);

            message += `\n${index + 1}. ${date}`;
            message += `\n   ${status}`;
            message += `\n   🕐 ${jamMasuk} - ${jamPulang}`;
        });
    }

    message += `\n\n_Tetap semangat belajar!_ 💪📚`;

    return message;
}

/**
 * Generate not registered message
 */
function generateNotRegisteredMessage() {
    return `❌ *Nomor Tidak Terdaftar*

Maaf, nomor WhatsApp Anda tidak terdaftar dalam sistem absensi.

Silakan hubungi admin sekolah untuk mendaftarkan nomor Anda.

📞 Pastikan nomor yang terdaftar di database sama dengan nomor WhatsApp Anda.`;
}

/**
 * Generate error message
 */
function generateErrorMessage() {
    return `⚠️ *Terjadi Kesalahan*

Maaf, terjadi kesalahan saat memproses permintaan Anda.

Silakan coba lagi dalam beberapa saat atau hubungi admin jika masalah berlanjut.`;
}

/**
 * Generate unknown command message
 */
function generateUnknownCommandMessage() {
    return `❓ *Perintah Tidak Dikenali*

Maaf, saya tidak mengerti perintah Anda.

Ketik *menu* atau *help* untuk melihat daftar perintah yang tersedia.`;
}

/**
 * Generate teacher help message
 */
function generateTeacherHelpMessage(teacherName) {
    return `👋 *Assalamualaikum, ${teacherName}!*

Selamat datang di *Bot Absensi SMK Assuniyah* 🎓

📋 *Daftar Perintah:*

1️⃣ *Absen Manual Siswa*
   Ketik: \`absen [nama siswa]\`
   Contoh: \`absen andi\`
   
2️⃣ *Catat Jam Masuk*
   Ketik: \`masuk [nama siswa]\`
   Contoh: \`masuk andi\`
   
3️⃣ *Catat Jam Pulang*
   Ketik: \`pulang [nama siswa]\`
   Contoh: \`pulang andi\`
   
4️⃣ *Edit Absensi*
   Ketik: \`edit absen [nama siswa]\`
   Contoh: \`edit absen andi\`
   
5️⃣ *Hapus Absensi*
   Ketik: \`hapus absen [nama siswa]\`
   Contoh: \`hapus absen andi\`
   
6️⃣ *Menu Bantuan*
   Ketik: \`help\` atau \`menu\`

💡 _Cukup ketik perintah di atas untuk menggunakan bot ini._

📚 Semangat mengajar! ✨`;
}

/**
 * Generate student search results message
 */
function generateStudentSearchResults(students, searchTerm) {
    if (students.length === 0) {
        return `❌ *Siswa Tidak Ditemukan*

Tidak ada siswa dengan nama yang mengandung "*${searchTerm}*".

Silakan coba dengan nama lain atau ketik \`help\` untuk bantuan.`;
    }

    let message = `🔍 *Hasil Pencarian: "${searchTerm}"*

Ditemukan ${students.length} siswa:

`;

    students.forEach((student, index) => {
        const kelas = student.nama_kelas || '-';
        message += `${index + 1}. *${student.nama}*\n   📚 Kelas: ${kelas}\n   🆔 NIS: ${student.nis}\n\n`;
    });

    message += `\n💡 _Balas dengan nomor siswa yang ingin diabsen (1-${students.length})_`;

    return message;
}

/**
 * Generate status selection message
 */
function generateStatusSelectionMessage(studentName) {
    return `📝 *Pilih Status Absensi*

Siswa: *${studentName}*

Pilih status absensi:

1️⃣ Izin
2️⃣ Sakit
3️⃣ Alpha

💡 _Balas dengan nomor status (1-3)_`;
}

/**
 * Generate keterangan input message
 */
function generateKeteranganInputMessage(studentName, status) {
    const statusText = {
        'H': 'Hadir',
        'I': 'Izin',
        'S': 'Sakit',
        'A': 'Alpha'
    };

    return `📝 *Masukkan Keterangan*

Siswa: *${studentName}*
Status: *${statusText[status]}*

Silakan ketik keterangan untuk absensi ini.

Contoh:
- "Sakit demam"
- "Izin keperluan keluarga"

💡 _Ketik keterangan_`;
}

/**
 * Generate attendance confirmation message
 */
function generateAttendanceConfirmation(studentName, studentClass, status, keterangan) {
    const statusEmoji = {
        'H': '✅',
        'I': '📝',
        'S': '🤒',
        'A': '❌'
    };

    const statusText = {
        'H': 'Hadir',
        'I': 'Izin',
        'S': 'Sakit',
        'A': 'Alpha'
    };

    const today = moment().format('dddd, DD MMMM YYYY');
    const now = moment().format('HH:mm');

    return `${statusEmoji[status]} *Absensi Berhasil Dicatat*

👤 Nama: *${studentName}*
📚 Kelas: ${studentClass || '-'}
📅 Tanggal: ${today}
⏰ Jam: ${now}
📊 Status: *${statusText[status]}*
📝 Keterangan: ${keterangan}

_Absensi telah tersimpan dalam sistem._ ✨

Ketik \`absen [nama]\` untuk absen siswa lain.`;
}

/**
 * Generate invalid selection message
 */
function generateInvalidSelectionMessage(maxOption) {
    return `❌ *Pilihan Tidak Valid*

Silakan balas dengan nomor yang valid (1-${maxOption}).

Atau ketik \`help\` untuk bantuan.`;
}

/**
 * Generate attendance details message (for edit/delete)
 */
function generateAttendanceDetailsMessage(student, attendance) {
    const statusText = {
        'H': 'Hadir',
        'I': 'Izin',
        'S': 'Sakit',
        'A': 'Alpha'
    };

    const jamMasuk = attendance.jam_masuk ? moment(attendance.jam_masuk, 'HH:mm:ss').format('HH:mm') : '-';
    const today = moment().format('dddd, DD MMMM YYYY');

    return `📋 *Detail Absensi Hari Ini*

👤 Nama: *${student.nama}*
📚 Kelas: ${student.nama_kelas || '-'}
📅 Tanggal: ${today}
⏰ Jam Masuk: ${jamMasuk}
📊 Status: *${statusText[attendance.status]}*
📝 Keterangan: ${attendance.keterangan || '-'}`;
}

/**
 * Generate edit options message
 */
function generateEditOptionsMessage(studentName) {
    return `✏️ *Edit Absensi*

Siswa: *${studentName}*

Apa yang ingin diubah?

1️⃣ Status (Izin/Sakit/Alpha)
2️⃣ Keterangan

💡 _Balas dengan nomor pilihan (1-2)_`;
}

/**
 * Generate delete confirmation message
 */
function generateDeleteConfirmationMessage(student, attendance) {
    const statusText = {
        'H': 'Hadir',
        'I': 'Izin',
        'S': 'Sakit',
        'A': 'Alpha'
    };

    return `⚠️ *Konfirmasi Hapus Absensi*

👤 Nama: *${student.nama}*
📚 Kelas: ${student.nama_kelas || '-'}
📊 Status: ${statusText[attendance.status]}
📝 Keterangan: ${attendance.keterangan || '-'}

Apakah Anda yakin ingin menghapus absensi ini?

💡 _Ketik "ya" untuk hapus atau "tidak" untuk batal_`;
}

/**
 * Generate edit success message
 */
function generateEditSuccessMessage(studentName, editType, newValue) {
    const editTypeText = editType === 'status' ? 'Status' : 'Keterangan';

    return `✅ *Absensi Berhasil Diubah*

👤 Nama: *${studentName}*
📝 ${editTypeText} diubah menjadi: *${newValue}*

_Perubahan telah tersimpan dalam sistem._ ✨

Ketik \`help\` untuk melihat perintah lainnya.`;
}

/**
 * Generate delete success message
 */
function generateDeleteSuccessMessage(studentName) {
    return `✅ *Absensi Berhasil Dihapus*

👤 Nama: *${studentName}*

_Absensi telah dihapus dari sistem._ ✨

Ketik \`help\` untuk melihat perintah lainnya.`;
}

/**
 * Generate no attendance found message
 */
function generateNoAttendanceFoundMessage(searchTerm) {
    return `❌ *Tidak Ada Absensi*

Tidak ditemukan siswa dengan nama "*${searchTerm}*" yang memiliki absensi hari ini.

Pastikan siswa sudah diabsen terlebih dahulu.`;
}

/**
 * Generate quick check-in success message
 */
function generateQuickCheckinSuccess(studentName, studentClass) {
    const today = moment().format('dddd, DD MMMM YYYY');
    const now = moment().format('HH:mm');

    return `✅ *Absen Masuk Berhasil*

👤 Nama: *${studentName}*
📚 Kelas: ${studentClass || '-'}
📅 Tanggal: ${today}
⏰ Jam Masuk: ${now}
📊 Status: *Hadir*

_Absensi telah tersimpan dalam sistem._ ✨`;
}

/**
 * Generate quick check-out success message
 */
function generateQuickCheckoutSuccess(studentName, studentClass, jamMasuk) {
    const today = moment().format('dddd, DD MMMM YYYY');
    const now = moment().format('HH:mm');

    return `✅ *Absen Pulang Berhasil*

👤 Nama: *${studentName}*
📚 Kelas: ${studentClass || '-'}
📅 Tanggal: ${today}
⏰ Jam Masuk: ${jamMasuk || '-'}
🏠 Jam Pulang: ${now}

_Absensi telah tersimpan dalam sistem._ ✨`;
}

/**
 * Generate no attendance for checkout message
 */
function generateNoAttendanceForCheckout(searchTerm) {
    return `❌ *Belum Ada Absen Masuk*

Tidak ditemukan siswa dengan nama "*${searchTerm}*" yang sudah absen masuk hari ini.

Silakan absen masuk terlebih dahulu dengan:
\`masuk [nama]\` atau \`absen [nama]\``;
}

/**
 * Generate registration help message
 */
function generateRegistrationHelpMessage() {
    return `📝 *Pendaftaran Siswa Baru*

Untuk mendaftarkan nomor WhatsApp Anda ke sistem absensi, silakan ikuti langkah berikut:

1. Siapkan *NIS* (Nomor Induk Siswa) Anda.
2. Siapkan *Tanggal Lahir* Anda.
3. Pastikan nomor ini belum pernah terdaftar sebelumnya.

Ketik \`daftar\` untuk memulai proses pendaftaran.`;
}

/**
 * Generate registration success message
 */
function generateRegistrationSuccessMessage(studentName, studentClass) {
    return `✅ *Pendaftaran Berhasil!*

Selamat, *${studentName}*! 🎉
Nomor WhatsApp Anda telah berhasil ditautkan ke data siswa.

👤 Nama: ${studentName}
📚 Kelas: ${studentClass || '-'}

Sekarang Anda dapat menggunakan perintah bot. Ketik _menu_ untuk melihat daftar perintah.

_Selamat belajar!_ 📚✨`;
}

/**
 * Generate ask NIS message
 */
function generateRegistrationAskNIS() {
    return `🆔 *Masukkan NIS*

Silakan ketik Nomor Induk Siswa (NIS) Anda.

Contoh: 2401001`;
}

/**
 * Generate ask Tanggal Lahir message
 */
function generateRegistrationAskTglLahir(nis, nama, kelas) {
    return `📅 *Konfirmasi Data & Tanggal Lahir*

NIS: *${nis}*
Nama: *${nama}*
Kelas: *${kelas || '-'}*

----------------------------------------
Untuk melanjutkan verifikasi, silakan ketik *Tanggal Lahir* Anda.
Format: *dd/mm/yyyy*

Contoh: 31/12/2005`;
}

/**
 * Generate registration error message
 */
function generateRegistrationError(reason) {
    let message = `❌ *Pendaftaran Gagal*\n\n`;

    switch (reason) {
        case 'already_registered':
            message += `Nomor WhatsApp ini sudah terdaftar sebagai siswa lain.\n\nSilakan hubungi admin jika ingin mengubah data.`;
            break;
        case 'nis_not_found':
            message += `Data siswa tidak ditemukan.\n\nPastikan NIS dan Tanggal Lahir yang Anda masukkan benar.`;
            break;
        case 'nis_already_has_phone':
            message += `NIS ini sudah memiliki nomor WhatsApp yang terdaftar.\n\nSilakan hubungi admin jika ingin merubah nomor.`;
            break;
        case 'invalid_date_format':
            message += `Format tanggal salah.\n\nMohon gunakan format *dd/mm/yyyy*\nContoh: 25/12/2005`;
            break;
        default:
            message += `Terjadi kesalahan saat memproses pendaftaran.`;
    }

    return message;
}

/**
 * Generate student notification for manual attendance
 */
function generateStudentAttendanceNotification(studentName, status, keterangan, teacherName) {
    const statusEmoji = {
        'H': '✅',
        'I': '📝',
        'S': '🤒',
        'A': '❌'
    };

    const statusText = {
        'H': 'Hadir',
        'I': 'Izin',
        'S': 'Sakit',
        'A': 'Alpha'
    };

    const today = moment().format('dddd, DD MMMM YYYY');
    const now = moment().format('HH:mm');

    return `${statusEmoji[status]} *Notifikasi Absensi*

👋 Halo, *${studentName}*!

Guru telah mencatat absensi Anda:

📅 Tanggal: ${today}
⏰ Jam: ${now}
📊 Status: *${statusText[status]}*
📝 Keterangan: ${keterangan}
👨‍🏫 Dicatat oleh: ${teacherName}

_Pastikan data absensi Anda sudah benar._`;
}

/**
 * Generate student notification for check-in
 */
function generateStudentCheckinNotification(studentName, teacherName) {
    const today = moment().format('dddd, DD MMMM YYYY');
    const now = moment().format('HH:mm');

    return `✅ *Notifikasi Absen Masuk*

👋 Halo, *${studentName}*!

Guru telah mencatat absen masuk Anda:

📅 Tanggal: ${today}
⏰ Jam Masuk: ${now}
📊 Status: *Hadir*
👨‍🏫 Dicatat oleh: ${teacherName}

_Jangan lupa absen pulang ya!_ 🏠`;
}

/**
 * Generate student notification for check-out
 */
function generateStudentCheckoutNotification(studentName, jamMasuk, teacherName) {
    const today = moment().format('dddd, DD MMMM YYYY');
    const now = moment().format('HH:mm');
    const jamMasukFormatted = jamMasuk ? moment(jamMasuk, 'HH:mm:ss').format('HH:mm') : '-';

    return `🏠 *Notifikasi Absen Pulang*

👋 Halo, *${studentName}*!

Guru telah mencatat absen pulang Anda:

📅 Tanggal: ${today}
⏰ Jam Masuk: ${jamMasukFormatted}
🏠 Jam Pulang: ${now}
👨‍🏫 Dicatat oleh: ${teacherName}

_Hati-hati di jalan, sampai jumpa besok!_ 👋`;
}

module.exports = {
    parseCommand,
    parseTeacherCommand,
    generateHelpMessage,
    generateTodayAttendanceMessage,
    generateRecapMessage,
    generateNotRegisteredMessage,
    generateErrorMessage,
    generateUnknownCommandMessage,
    generateTeacherHelpMessage,
    generateStudentSearchResults,
    generateStatusSelectionMessage,
    generateKeteranganInputMessage,
    generateAttendanceConfirmation,
    generateInvalidSelectionMessage,
    generateAttendanceDetailsMessage,
    generateEditOptionsMessage,
    generateDeleteConfirmationMessage,
    generateEditSuccessMessage,
    generateDeleteSuccessMessage,
    generateNoAttendanceFoundMessage,
    generateQuickCheckinSuccess,
    generateQuickCheckoutSuccess,
    generateNoAttendanceForCheckout,
    generateRegistrationHelpMessage,
    generateRegistrationSuccessMessage,
    generateRegistrationAskNIS,
    generateRegistrationAskTglLahir,
    generateRegistrationError,
    // Student notifications
    generateStudentAttendanceNotification,
    generateStudentCheckinNotification,
    generateStudentCheckoutNotification
};

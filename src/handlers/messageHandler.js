const attendanceService = require('../services/attendanceService');
const messageService = require('../services/messageService');
const sessionManager = require('../services/sessionManager');
const whatsapp = require('../config/whatsapp');
const moment = require('moment-timezone');

/**
 * Handle incoming WhatsApp message
 * Actual webhook format from go-whatsapp-web-multidevice:
 * {
 *   "chat_id": "241012257595503",
 *   "from": "6281524824563:15@s.whatsapp.net in 241012257595503@lid",
 *   "from_lid": "241012257595503:15@lid",
 *   "message": {
 *     "text": "menu",
 *     "id": "3EB0CB57A92DAC5F47D281",
 *     "replied_id": "",
 *     "quoted_message": ""
 *   },
 *   "pushname": "Ahmad Daqiqi",
 *   "sender_id": "241012257595503",
 *   "timestamp": "2025-12-29T08:35:45Z"
 * }
 */
async function handleMessage(req, res) {
    try {
        let webhookData = req.body;
        let rawDeviceId = req.headers['x-device-id'] || req.query.device_id || process.env.WA_DEVICE_ID || '1';
        if (webhookData.event === 'message' && webhookData.payload) {
            rawDeviceId = webhookData.device_id || rawDeviceId;
            webhookData = webhookData.payload;
        } else if (webhookData.device_id) {
            rawDeviceId = webhookData.device_id;
        }
        const deviceId = await whatsapp.resolveDeviceId(rawDeviceId);
        console.log(`🔌 Resolved Device ID: ${rawDeviceId} -> ${deviceId}`);

        // ── Cek apakah bot aktif untuk sekolah ini ────────────────────────
        const botActive = await attendanceService.isBotEnabled(deviceId);
        if (!botActive) {
            console.log(`🤖 Bot dinonaktifkan untuk school/device ID: ${deviceId}. Pesan diabaikan.`);
            return res.json({ success: true, message: 'Bot disabled for this school' });
        }
        // ─────────────────────────────────────────────────────────────

        if (webhookData.body && !webhookData.message) webhookData.message = { text: webhookData.body };
        if (webhookData.from_name && !webhookData.pushname) webhookData.pushname = webhookData.from_name;
        if (!webhookData.sender_id) webhookData.sender_id = webhookData.from;
        const { chat_id, from, message, pushname, sender_id } = webhookData;

        // Validate required fields
        if (!message || !message.text) {
            console.log('⚠️ Not a text message or missing message field');
            return res.json({ success: true, message: 'Non-text message ignored' });
        }

        let body = message.text;

        console.log(`📨 Received message from ${pushname}: ${body}`);

        // Extract phone number from 'from' field
        // Format: "6281524824563:15@s.whatsapp.net in 241012257595503@lid"
        let phoneNumber = from;

        // Extract phone number before ':' or '@'
        if (phoneNumber.includes(':')) {
            phoneNumber = phoneNumber.split(':')[0];
        } else if (phoneNumber.includes('@')) {
            phoneNumber = phoneNumber.split('@')[0];
        }

        console.log(`📞 Extracted phone number: ${phoneNumber}`);

        // Check if it's a group message
        // Group messages can be detected by:
        // 1. chat_id contains '@g.us' or '@lid' (group identifiers)
        // 2. chat_id is different from sender_id (indicates group chat)
        const isGroupMessage = chat_id.includes('@g.us') ||
            chat_id.includes('@lid') ||
            chat_id !== sender_id;

        // Check if there is an active session (for group chat context)
        const session = sessionManager.getSession(phoneNumber);

        if (isGroupMessage) {
            const botNumberConfig = whatsapp.BOT_NUMBER;
            if (!botNumberConfig) {
                console.log('⚠️ BOT_NUMBER not set, ignoring group message');
                return res.json({ success: true, message: 'Group messages ignored (Config missing)' });
            }

            // Normalize bot number to ensure string comparison works
            // Handle 08x -> 628x, 628x -> 628x, +628x -> 628x
            let botNumber = botNumberConfig.replace(/\D/g, '');
            if (botNumber.startsWith('0')) {
                botNumber = '62' + botNumber.substring(1);
            }

            // Create variations to check (users might save contact differently)
            // But WhatsApp usually sends @628... in the raw text
            const variations = [`@${botNumber}`];

            // Check if bot is tagged
            const isTagged = variations.some(tag => body.includes(tag));

            console.log(`🔍 Checking tag: Body="${body}", Target="${botNumber}", Match=${isTagged}`);

            if (!isTagged) {
                // If not tagged, check if there's an active session
                // We allow untagged messages in groups IF the user has an active session
                // (e.g. waiting for selection 1, 2, 3...)
                if (session) {
                    console.log(`ℹ️ Untagged group message allowed due to active session: ${session.step}`);
                } else {
                    // strict check failed and no session
                    console.log(`⏭️ Ignoring untagged group message from chat: ${chat_id}`);
                    return res.json({ success: true, message: 'Group messages ignored (Not tagged)' });
                }
            }

            // Remove tag from body so command parsing works correctly
            // e.g. "@628123 command" -> "command"
            variations.forEach(tag => {
                body = body.replace(tag, '').trim();
            });
            console.log(`🧹 Cleaned body: "${body}"`);

            // Fall through to check if sender is teacher
        }

        if (!isGroupMessage) {
            console.log(`✅ Private message detected from ${phoneNumber}`);
        }

        // Check if there is an active REGISTRATION session
        // const session = sessionManager.getSession(phoneNumber); // Moved up
        if (session && session.action === 'register') {
            sessionManager.clearSession(phoneNumber);
        }

        // Check if sender is a teacher
        const teacher = await attendanceService.getTeacherByPhone(phoneNumber, deviceId);

        if (teacher) {
            console.log(`👨‍🏫 Teacher found: ${teacher.nama}`);

            // ── Cek apakah guru ini punya akses bot ───────────────────────
            const hasBotAccess = await attendanceService.hasTeacherBotAccess(teacher.id);
            if (!hasBotAccess) {
                console.log(`🚫 Guru ${teacher.nama} tidak memiliki akses bot. Diabaikan.`);
                if (!isGroupMessage) {
                    await whatsapp.sendMessage(phoneNumber, "Maaf, nomor Anda belum terdaftar di sistem kami. Silakan hubungi admin sekolah.", deviceId);
                }
                return res.json({ success: true, message: 'Teacher bot access denied' });
            }
            // ─────────────────────────────────────────────────────────────

            const replyTo = isGroupMessage ? chat_id : phoneNumber;
            const result = await handleTeacherMessage(replyTo, body, teacher, deviceId);
            return res.json(result);
        }

        // If it's a group message and NOT a teacher, ignore it
        if (isGroupMessage) {
            console.log(`⏭️ Ignoring non-teacher message in group from ${phoneNumber}`);
            return res.json({ success: true, message: 'Group message from non-teacher ignored' });
        }

        // Non-teacher private message — bot hanya untuk guru, abaikan
        console.log(`⏭️ Ignoring non-teacher private message from ${phoneNumber}`);
        await whatsapp.sendMessage(phoneNumber, "Maaf, nomor Anda belum terdaftar di sistem kami. Silakan hubungi admin sekolah.", deviceId);
        return res.json({ success: true, message: 'Non-teacher message ignored' });

    } catch (error) {
        console.error('❌ Error handling message:', error);
        console.error('📋 Error Stack:', error.stack);
        console.error('📦 Request Body:', JSON.stringify(req.body, null, 2));

        // Try to send error message to user
        try {
            let phoneNumber = req.body.from;
            if (phoneNumber) {
                // Extract phone number
                if (phoneNumber.includes(':')) {
                    phoneNumber = phoneNumber.split(':')[0];
                } else if (phoneNumber.includes('@')) {
                    phoneNumber = phoneNumber.split('@')[0];
                }

                const errorMessage = messageService.generateErrorMessage();
                await whatsapp.sendMessage(phoneNumber, errorMessage, '1');
            }
        } catch (sendError) {
            console.error('❌ Failed to send error message:', sendError);
            console.error('📋 Send Error Stack:', sendError.stack);
        }

        return res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}

/**
 * Handle student message
 */
async function handleStudentMessage(phoneNumber, body, student, deviceId) {
    // Parse command
    const { command, period } = messageService.parseCommand(body);
    let responseMessage = '';

    switch (command) {
        case 'help':
            responseMessage = messageService.generateHelpMessage(student.nama);
            break;

        case 'check_today':
            const todayAttendance = await attendanceService.getTodayAttendance(student.id, deviceId);
            responseMessage = messageService.generateTodayAttendanceMessage(student, todayAttendance);
            break;

        case 'recap':
            const stats = await attendanceService.getAttendanceRecap(student.id, period, deviceId);
            responseMessage = messageService.generateRecapMessage(student, stats, period);
            break;

        case 'unknown':
        default:
            responseMessage = messageService.generateUnknownCommandMessage();
            break;
    }

    // Send response
    console.log(`📤 Sending response to student ${phoneNumber}`);
    await whatsapp.sendMessage(phoneNumber, responseMessage, deviceId);

    return {
        success: true,
        message: 'Response sent',
        user: student.nama,
        command: command
    };
}

/**
 * Handle teacher message
 */
async function handleTeacherMessage(replyTo, body, teacher, deviceId) {
    // Get existing session using teacher's phone number as key
    // We use the teacher's registered number from DB for the session key
    const phoneNumber = teacher.no_wa;

    // Get existing session
    const session = sessionManager.getSession(phoneNumber);

    // Parse teacher command
    const { command, searchTerm, option } = messageService.parseTeacherCommand(body);
    console.log(`⚡ Teacher command: ${command}, Search: ${searchTerm}, Option: ${option}`);
    let responseMessage = '';

    // Handle commands based on session state
    if (command === 'teacher_help') {
        // Clear any existing session
        sessionManager.clearSession(phoneNumber);
        responseMessage = messageService.generateTeacherHelpMessage(teacher.nama);
    }
    // CREATE ATTENDANCE FLOW
    else if (command === 'search_student') {
        // Search for students
        const students = await attendanceService.searchStudentsByName(searchTerm, deviceId);
        responseMessage = messageService.generateStudentSearchResults(students, searchTerm);

        if (students.length > 0) {
            // Store search results in session
            sessionManager.setSession(phoneNumber, {
                type: 'teacher',
                action: 'create',
                step: 'select_student',
                searchResults: students,
                teacherId: teacher.id,
                teacherName: teacher.nama
            });
        }
    }
    // EDIT ATTENDANCE FLOW
    else if (command === 'edit_attendance') {
        // Search for students with attendance today
        const students = await attendanceService.searchStudentsWithAttendanceToday(searchTerm, deviceId);

        if (students.length === 0) {
            responseMessage = messageService.generateNoAttendanceFoundMessage(searchTerm);
        } else {
            responseMessage = messageService.generateStudentSearchResults(students, searchTerm);

            // Store search results in session
            sessionManager.setSession(phoneNumber, {
                type: 'teacher',
                action: 'edit',
                step: 'select_student',
                searchResults: students,
                teacherId: teacher.id,
                teacherName: teacher.nama
            });
        }
    }
    // DELETE ATTENDANCE FLOW
    else if (command === 'delete_attendance') {
        // Search for students with attendance today
        const students = await attendanceService.searchStudentsWithAttendanceToday(searchTerm, deviceId);

        if (students.length === 0) {
            responseMessage = messageService.generateNoAttendanceFoundMessage(searchTerm);
        } else {
            responseMessage = messageService.generateStudentSearchResults(students, searchTerm);

            // Store search results in session
            sessionManager.setSession(phoneNumber, {
                type: 'teacher',
                action: 'delete',
                step: 'select_student',
                searchResults: students,
                teacherId: teacher.id,
                teacherName: teacher.nama
            });
        }
    }
    // QUICK CHECK-IN FLOW
    else if (command === 'quick_checkin') {
        // Search for students
        const students = await attendanceService.searchStudentsByName(searchTerm, deviceId);

        if (students.length === 0) {
            responseMessage = messageService.generateStudentSearchResults(students, searchTerm);
        } else {
            responseMessage = messageService.generateStudentSearchResults(students, searchTerm);

            // Store search results in session
            sessionManager.setSession(phoneNumber, {
                type: 'teacher',
                action: 'quick_checkin',
                step: 'select_student',
                searchResults: students,
                teacherId: teacher.id,
                teacherName: teacher.nama
            });
        }
    }
    // QUICK CHECK-OUT FLOW
    else if (command === 'quick_checkout') {
        // Search for students with attendance today (must have checked in first)
        const students = await attendanceService.searchStudentsWithAttendanceToday(searchTerm, deviceId);

        if (students.length === 0) {
            responseMessage = messageService.generateNoAttendanceForCheckout(searchTerm);
        } else {
            responseMessage = messageService.generateStudentSearchResults(students, searchTerm);

            // Store search results in session
            sessionManager.setSession(phoneNumber, {
                type: 'teacher',
                action: 'quick_checkout',
                step: 'select_student',
                searchResults: students,
                teacherId: teacher.id,
                teacherName: teacher.nama
            });
        }
    }
    // RECAP STUDENT FLOW
    else if (command === 'recap_student') {
        const students = await attendanceService.searchStudentsByName(searchTerm, deviceId);
        responseMessage = messageService.generateStudentSearchResults(students, searchTerm);

        if (students.length > 0) {
            sessionManager.setSession(phoneNumber, {
                type: 'teacher',
                action: 'recap_student',
                step: 'select_student',
                searchResults: students,
                teacherId: teacher.id,
                teacherName: teacher.nama
            });
        }
    }
    // HANDLE OPTION SELECTION
    else if (command === 'select_option' && session) {
        if (session.step === 'select_student') {
            // Student selection
            const selectedIndex = option - 1;

            if (selectedIndex >= 0 && selectedIndex < session.searchResults.length) {
                const selectedStudent = session.searchResults[selectedIndex];

                if (session.action === 'create') {
                    // CREATE: Check if attendance already exists for today
                    const existingAttendance = await attendanceService.getTodayAttendance(selectedStudent.id, deviceId);

                    if (existingAttendance) {
                        // Show confirmation message
                        responseMessage = messageService.generateAttendanceExistsConfirmation(selectedStudent, existingAttendance);
                        sessionManager.setSession(phoneNumber, {
                            ...session,
                            step: 'confirm_replace_create',
                            selectedStudent: selectedStudent,
                            existingAttendance: existingAttendance
                        });
                    } else {
                        // No existing record, proceed to status selection
                        responseMessage = messageService.generateStatusSelectionMessage(selectedStudent.nama);
                        sessionManager.setSession(phoneNumber, {
                            ...session,
                            step: 'select_status',
                            selectedStudent: selectedStudent
                        });
                    }
                } else if (session.action === 'edit') {
                    // EDIT: Show edit options
                    responseMessage = messageService.generateEditOptionsMessage(selectedStudent.nama);
                    sessionManager.setSession(phoneNumber, {
                        ...session,
                        step: 'select_edit_type',
                        selectedStudent: selectedStudent
                    });
                } else if (session.action === 'delete') {
                    // DELETE: Show confirmation
                    const attendance = await attendanceService.getStudentAttendanceToday(selectedStudent.id, deviceId);
                    responseMessage = messageService.generateDeleteConfirmationMessage(selectedStudent, attendance);
                    sessionManager.setSession(phoneNumber, {
                        ...session,
                        step: 'confirm_delete',
                        selectedStudent: selectedStudent
                    });
                } else if (session.action === 'quick_checkin') {
                    // QUICK CHECK-IN: Check if attendance already exists
                    const existingAttendance = await attendanceService.getTodayAttendance(selectedStudent.id, deviceId);

                    if (existingAttendance) {
                        // Show confirmation message
                        responseMessage = messageService.generateCheckinExistsConfirmation(selectedStudent, existingAttendance);
                        sessionManager.setSession(phoneNumber, {
                            ...session,
                            step: 'confirm_replace_checkin',
                            selectedStudent: selectedStudent,
                            existingAttendance: existingAttendance
                        });
                    } else {
                        // No existing record, execute check-in immediately
                        await attendanceService.quickCheckin(selectedStudent.id, session.teacherId, session.teacherName, deviceId);
                        responseMessage = messageService.generateQuickCheckinSuccess(
                            selectedStudent.nama,
                            selectedStudent.nama_kelas
                        );
                        sessionManager.clearSession(phoneNumber);
                    }
                } else if (session.action === 'quick_checkout') {
                    // QUICK CHECK-OUT: Check if attendance exists and if jam_pulang already set
                    const existingAttendance = await attendanceService.getTodayAttendance(selectedStudent.id, deviceId);

                    if (!existingAttendance) {
                        // No attendance record found
                        responseMessage = messageService.generateNoAttendanceForCheckout(selectedStudent.nama);
                        sessionManager.clearSession(phoneNumber);
                    } else if (existingAttendance.jam_pulang) {
                        // Already has jam_pulang, show confirmation
                        responseMessage = messageService.generateCheckoutExistsConfirmation(selectedStudent, existingAttendance);
                        sessionManager.setSession(phoneNumber, {
                            ...session,
                            step: 'confirm_replace_checkout',
                            selectedStudent: selectedStudent,
                            existingAttendance: existingAttendance
                        });
                    } else {
                        // Has attendance but no jam_pulang yet, execute checkout immediately
                        const result = await attendanceService.quickCheckout(selectedStudent.id, session.teacherName, deviceId);

                        if (result.success) {
                            const jamMasuk = result.jamMasuk ? moment(result.jamMasuk, 'HH:mm:ss').format('HH:mm') : '-';
                            responseMessage = messageService.generateQuickCheckoutSuccess(
                                selectedStudent.nama,
                                selectedStudent.nama_kelas,
                                jamMasuk
                            );
                        } else {
                            responseMessage = messageService.generateNoAttendanceForCheckout(selectedStudent.nama);
                        }
                        sessionManager.clearSession(phoneNumber);
                    }
                } else if (session.action === 'recap_student') {
                    // RECAP STUDENT: Show monthly recap for selected student
                    const stats = await attendanceService.getAttendanceRecap(selectedStudent.id, 'month', deviceId);
                    responseMessage = messageService.generateRecapMessage(selectedStudent, stats, 'month');
                    sessionManager.clearSession(phoneNumber);
                }
            } else {
                responseMessage = messageService.generateInvalidSelectionMessage(session.searchResults.length);
            }
        }
        else if (session.step === 'select_status' && session.action === 'create') {
            // CREATE: Status selection (no Hadir - use masuk command instead)
            const statusMap = {
                1: 'H', // Hadir
                2: 'I', // Izin
                3: 'S', // Sakit
                4: 'A'  // Alpha
            };

            const status = statusMap[option];

            if (status) {
                if (status === 'H') {
                    // Hadir: langsung catat tanpa keterangan
                    const keterangan = `Hadir (dicatat oleh ${session.teacherName})`;
                    await attendanceService.createManualAttendance(
                        session.selectedStudent.id,
                        status,
                        session.teacherId,
                        session.teacherName,
                        keterangan,
                        deviceId
                    );
                    responseMessage = messageService.generateAttendanceConfirmation(
                        session.selectedStudent.nama,
                        session.selectedStudent.nama_kelas,
                        status,
                        keterangan
                    );
                    sessionManager.clearSession(phoneNumber);
                } else {
                    // Izin/Sakit/Alpha: minta keterangan dulu
                    responseMessage = messageService.generateKeteranganInputMessage(
                        session.selectedStudent.nama,
                        status
                    );
                    sessionManager.setSession(phoneNumber, {
                        ...session,
                        step: 'input_keterangan',
                        selectedStatus: status
                    });
                }
            } else {
                responseMessage = messageService.generateInvalidSelectionMessage(4);
            }
        }
        else if (session.step === 'select_edit_type' && session.action === 'edit') {
            // EDIT: Choose what to edit
            if (option === 1) {
                // Edit status
                responseMessage = messageService.generateStatusSelectionMessage(session.selectedStudent.nama);
                sessionManager.setSession(phoneNumber, {
                    ...session,
                    step: 'edit_status',
                    editType: 'status'
                });
            } else if (option === 2) {
                // Edit keterangan
                responseMessage = `📝 *Edit Keterangan*\n\nSiswa: *${session.selectedStudent.nama}*\n\nSilakan ketik keterangan baru.\n\n💡 _Ketik keterangan baru_`;
                sessionManager.setSession(phoneNumber, {
                    ...session,
                    step: 'edit_keterangan',
                    editType: 'keterangan'
                });
            } else {
                responseMessage = messageService.generateInvalidSelectionMessage(2);
            }
        }
        else if (session.step === 'edit_status' && session.action === 'edit') {
            // EDIT: New status selection (no Hadir - use masuk command instead)
            const statusMap = {
                1: 'H', // Hadir
                2: 'I', // Izin
                3: 'S', // Sakit
                4: 'A'  // Alpha
            };

            const status = statusMap[option];

            if (status) {
                // Update attendance status
                await attendanceService.updateAttendanceStatus(
                    session.selectedStudent.id,
                    status,
                    session.teacherName,
                    deviceId
                );

                const statusText = {
                    'I': 'Izin',
                    'S': 'Sakit',
                    'A': 'Alpha'
                };

                responseMessage = messageService.generateEditSuccessMessage(
                    session.selectedStudent.nama,
                    'status',
                    statusText[status]
                );

                // Clear session
                sessionManager.clearSession(phoneNumber);
            } else {
                responseMessage = messageService.generateInvalidSelectionMessage(4);
            }
        }
    }

    // HANDLE CONTACT SEARCH
    else if (command === 'search_contact') {
        const results = await attendanceService.searchStudentContact(searchTerm, deviceId);
        responseMessage = messageService.generateContactInfo(results, searchTerm);
    }
    // HANDLE CONFIRMATION (YES/NO)
    else if (command === 'confirm_yes' && session && session.step === 'confirm_delete') {
        // DELETE: Confirmed
        await attendanceService.deleteAttendanceToday(
            session.selectedStudent.id,
            session.teacherName,
            deviceId
        );

        responseMessage = messageService.generateDeleteSuccessMessage(session.selectedStudent.nama);
        sessionManager.clearSession(phoneNumber);
    }
    else if (command === 'confirm_no' && session && session.step === 'confirm_delete') {
        // DELETE: Cancelled
        responseMessage = `❌ *Penghapusan Dibatalkan*\n\nAbsensi tidak jadi dihapus.\n\nKetik \`help\` untuk melihat perintah lainnya.`;
        sessionManager.clearSession(phoneNumber);
    }
    // HANDLE CONFIRMATION FOR REPLACE CREATE
    else if (command === 'confirm_yes' && session && session.step === 'confirm_replace_create') {
        // CREATE: User confirmed to replace existing attendance
        // Proceed to status selection
        responseMessage = messageService.generateStatusSelectionMessage(session.selectedStudent.nama);
        sessionManager.setSession(phoneNumber, {
            ...session,
            step: 'select_status'
        });
    }
    else if (command === 'confirm_no' && session && session.step === 'confirm_replace_create') {
        // CREATE: User cancelled replacement
        responseMessage = `❌ *Perubahan Dibatalkan*\n\nAbsensi tidak jadi diubah.\n\nKetik \`help\` untuk melihat perintah lainnya.`;
        sessionManager.clearSession(phoneNumber);
    }
    // HANDLE CONFIRMATION FOR REPLACE CHECKIN
    else if (command === 'confirm_yes' && session && session.step === 'confirm_replace_checkin') {
        // CHECKIN: User confirmed to replace existing check-in
        await attendanceService.quickCheckin(session.selectedStudent.id, session.teacherId, session.teacherName, deviceId);
        responseMessage = messageService.generateQuickCheckinSuccess(
            session.selectedStudent.nama_kelas
        );
        sessionManager.clearSession(phoneNumber);
    }
    else if (command === 'confirm_no' && session && session.step === 'confirm_replace_checkin') {
        // CHECKIN: User cancelled replacement
        responseMessage = `❌ *Perubahan Dibatalkan*\n\nJam masuk tidak jadi diubah.\n\nKetik \`help\` untuk melihat perintah lainnya.`;
        sessionManager.clearSession(phoneNumber);
    }
    // HANDLE CONFIRMATION FOR REPLACE CHECKOUT
    else if (command === 'confirm_yes' && session && session.step === 'confirm_replace_checkout') {
        // CHECKOUT: User confirmed to replace existing check-out
        const result = await attendanceService.quickCheckout(session.selectedStudent.id, session.teacherName, deviceId);

        if (result.success) {
            const jamMasuk = result.jamMasuk ? moment(result.jamMasuk, 'HH:mm:ss').format('HH:mm') : '-';
            responseMessage = messageService.generateQuickCheckoutSuccess(
                session.selectedStudent.nama,
                session.selectedStudent.nama_kelas,
                jamMasuk
            );
        } else {
            responseMessage = messageService.generateNoAttendanceForCheckout(session.selectedStudent.nama);
        }
        sessionManager.clearSession(phoneNumber);
    }
    else if (command === 'confirm_no' && session && session.step === 'confirm_replace_checkout') {
        // CHECKOUT: User cancelled replacement
        responseMessage = `❌ *Perubahan Dibatalkan*\n\nJam pulang tidak jadi diubah.\n\nKetik \`help\` untuk melihat perintah lainnya.`;
        sessionManager.clearSession(phoneNumber);
    }
    // HANDLE TEXT INPUT (KETERANGAN)
    else if (session && session.step === 'input_keterangan' && session.action === 'create') {
        // CREATE: Keterangan input
        const keterangan = body.trim();

        if (keterangan.length > 0) {
            // Create manual attendance with keterangan
            await attendanceService.createManualAttendance(
                session.selectedStudent.id,
                session.selectedStatus,
                session.teacherId,
                session.teacherName,
                keterangan,
                deviceId
            );

            responseMessage = messageService.generateAttendanceConfirmation(
                session.selectedStudent.nama,
                session.selectedStudent.nama_kelas,
                session.selectedStatus,
                keterangan
            );

            // Clear session
            sessionManager.clearSession(phoneNumber);
        } else {
            responseMessage = `❌ *Keterangan tidak boleh kosong*\n\nSilakan ketik keterangan untuk absensi ini.`;
        }
    }
    else if (session && session.step === 'edit_keterangan' && session.action === 'edit') {
        // EDIT: New keterangan input
        const keterangan = body.trim();

        if (keterangan.length > 0) {
            // Update attendance keterangan
            await attendanceService.updateAttendanceKeterangan(
                session.selectedStudent.id,
                keterangan,
                session.teacherName,
                deviceId
            );

            responseMessage = messageService.generateEditSuccessMessage(
                session.selectedStudent.nama,
                'keterangan',
                keterangan
            );

            // Clear session
            sessionManager.clearSession(phoneNumber);
        } else {
            responseMessage = `❌ *Keterangan tidak boleh kosong*\n\nSilakan ketik keterangan baru.`;
        }
    }
    else {
        // Unknown command or no session
        responseMessage = messageService.generateTeacherHelpMessage(teacher.nama);
        sessionManager.clearSession(phoneNumber);
    }

    // Send response
    console.log(`📤 Sending response to teacher at ${replyTo}`);
    const sentResponse = await whatsapp.sendMessage(replyTo, responseMessage, deviceId);

    // If session is still active (not cleared above), track this message ID for later deletion
    const currentSession = sessionManager.getSession(phoneNumber);
    if (currentSession && sentResponse && sentResponse.data) {
        console.log('🔍 DEBUG: Full Send Response:', JSON.stringify(sentResponse.data));
        // Try to handle different ID locations based on library (usually data.id or data.message_id)
        // Log received: {"results":{"message_id":"..."}}
        const msgId = sentResponse.data.results?.message_id || sentResponse.data.id || sentResponse.data.message_id || (sentResponse.data.key && sentResponse.data.key.id);
        if (msgId) {
            console.log(`✅ DEBUG: Captured Bot Message ID: ${msgId}`);
            // Pass replyTo as the chatId where the message was sent (Group or Private)
            sessionManager.addBotMessageId(phoneNumber, msgId, replyTo);
        } else {
            console.log('⚠️ DEBUG: Could not find ID in response data');
        }
    }

    return {
        success: true,
        message: 'Response sent',
        user: teacher.nama,
        command: command
    };
}

// --- Registration Handlers ---

async function handleRegistrationNISInput(from, body, session, phoneNumber) {
    const nis = body.trim();

    // Basic NIS validation (alphanumeric, at least 4 chars)
    if (nis.length < 4) {
        const message = messageService.generateRegistrationAskNIS();
        await whatsapp.sendMessage(from, message);
        return;
    }

    try {
        // Fetch student by NIS to show name/class
        const student = await attendanceService.getStudentByNIS(nis);

        if (!student) {
            const message = messageService.generateRegistrationError('nis_not_found');
            await whatsapp.sendMessage(from, message);
            // Don't clear session? Or let them try again?
            // Usually valid to let them try again. But current flow clears session on error.
            sessionManager.clearSession(phoneNumber);
            return;
        }

        // Check if student already has a number (Fail Fast)
        if (student.no_wa && student.no_wa.trim() !== '') {
            const message = messageService.generateRegistrationError('nis_already_has_phone');
            await whatsapp.sendMessage(from, message);
            sessionManager.clearSession(phoneNumber);
            return;
        }

        // Store student data in session for next step
        session.nis = nis;
        session.studentId = student.id;
        session.studentData = student; // Store full object for local verification if needed
        session.step = 'input_tgl';

        const message = messageService.generateRegistrationAskTglLahir(nis, student.nama, student.nama_kelas);
        await whatsapp.sendMessage(from, message);

    } catch (error) {
        console.error('Error in NIS input handler:', error);
        const message = messageService.generateErrorMessage();
        await whatsapp.sendMessage(from, message);
        sessionManager.clearSession(phoneNumber);
    }
}

async function handleRegistrationTglInput(from, body, session, phoneNumber) {
    const tglInput = body.trim(); // User input: dd/mm/yyyy

    // Validate and convert date format
    const parts = tglInput.split('/');
    if (parts.length !== 3) {
        const message = messageService.generateRegistrationError('invalid_date_format');
        await whatsapp.sendMessage(from, message);
        return;
    }

    const [day, month, year] = parts;
    const isoDate = `${year}-${month}-${day}`; // YYYY-MM-DD

    // Validate date validity using Date object
    const dateObj = new Date(isoDate);
    if (isNaN(dateObj.getTime())) {
        const message = messageService.generateRegistrationError('invalid_date_format');
        await whatsapp.sendMessage(from, message);
        return;
    }

    try {
        // Verify Date of Birth
        // We can check against the session.studentData if we trust it stays valid (it should)
        // Or query DB again. Since we have the object, let's compare dates.
        // We need to handle Timezone or string format from DB.

        // Let's use getStudentByNISAndDate for safety and to reuse existing query logic which handles the matching
        const student = await attendanceService.getStudentByNISAndDate(session.nis, isoDate);

        if (!student) {
            // NIS was valid (checked in prev step), so this means Date is wrong
            const message = messageService.generateRegistrationError('nis_not_found'); // "Data siswa tidak ditemukan" - acts as "Wrong Password"
            await whatsapp.sendMessage(from, message);
            sessionManager.clearSession(phoneNumber);
            return;
        }

        // Strict check: Check if student has ANY number registered (Double Check)
        if (student.no_wa && student.no_wa.trim() !== '') {
            const message = messageService.generateRegistrationError('nis_already_has_phone');
            await whatsapp.sendMessage(from, message);
            sessionManager.clearSession(phoneNumber);
            return;
        }

        // Success: Register phone
        await attendanceService.registerStudentPhone(student.id, phoneNumber);

        const message = messageService.generateRegistrationSuccessMessage(student.nama, student.nama_kelas);
        await whatsapp.sendMessage(from, message);
        sessionManager.clearSession(phoneNumber);

    } catch (error) {
        console.error('Registration Error:', error);
        const message = messageService.generateErrorMessage();
        await whatsapp.sendMessage(from, message);
        sessionManager.clearSession(phoneNumber);
    }
}

async function cleanupBotMessages(phoneNumber, deviceId) {
    // Auto-delete dinonaktifkan
}

module.exports = {
    handleMessage
};


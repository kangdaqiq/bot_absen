/**
 * Session Manager for Teacher Bot
 * Manages multi-step conversation states for teachers
 */

const whatsapp = require('../config/whatsapp');

// In-memory session storage
// For production, consider using Redis or database
const sessions = new Map();

// Session timeout in milliseconds (5 minutes)
const SESSION_TIMEOUT = 5 * 60 * 1000;

/**
 * Create or update a session
 */
function setSession(phoneNumber, sessionData) {
    sessions.set(phoneNumber, {
        ...sessionData,
        timestamp: Date.now()
    });
}

/**
 * Get a session
 */
function getSession(phoneNumber) {
    const session = sessions.get(phoneNumber);

    if (!session) {
        return null;
    }

    // Check if session has expired
    if (Date.now() - session.timestamp > SESSION_TIMEOUT) {
        sessions.delete(phoneNumber);
        // We don't notify here because this happens when user sends a message,
        // so we'll just let them start over or handle it as a new command.
        // The cleanupExpiredSessions will handle notification for idle sessions.
        return null;
    }

    return session;
}

/**
 * Clear a session
 */
function clearSession(phoneNumber) {
    sessions.delete(phoneNumber);
}

/**
 * Clear all expired sessions
 */
async function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [phoneNumber, session] of sessions.entries()) {
        if (now - session.timestamp > SESSION_TIMEOUT) {
            // Send notification to user
            try {
                const message = `⏳ *Sesi Berakhir*\n\nMaaf, sesi Anda telah berakhir karena tidak ada respons selama 5 menit.\n\nSilakan ulangi perintah Anda dari awal.`;
                await whatsapp.sendMessage(phoneNumber, message);
                console.log(`⏰ Session expired for ${phoneNumber}`);
            } catch (error) {
                console.error(`❌ Failed to send session expiration message to ${phoneNumber}:`, error.message);
            }

            sessions.delete(phoneNumber);
        }
    }
}

// Run cleanup every 30 seconds
setInterval(cleanupExpiredSessions, 30 * 1000);

module.exports = {
    setSession,
    getSession,
    clearSession
};

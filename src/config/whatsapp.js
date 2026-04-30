const axios = require('axios');
require('dotenv').config();

const WA_API_URL = process.env.WA_API_URL || 'http://localhost:3000';
const WA_API_USERNAME = process.env.WA_API_USERNAME || 'admin';
const WA_API_PASSWORD = process.env.WA_API_PASSWORD || 'admin';

let deviceCache = {};
let lastCacheTime = 0;

async function resolveDeviceId(deviceId) {
    if (/^\d+$/.test(deviceId) && deviceId.length < 5) return deviceId;
    if (Date.now() - lastCacheTime > 60000) {
        try {
            const res = await axios.get(WA_API_URL + '/devices');
            if (res.data && res.data.results) {
                const newCache = {};
                res.data.results.forEach(d => {
                    newCache[d.jid] = d.id;
                    if (d.jid) newCache[d.jid.split('@')[0]] = d.id;
                });
                deviceCache = newCache;
                lastCacheTime = Date.now();
            }
        } catch (e) {
            console.error('Failed to fetch devices:', e.message);
        }
    }
    return deviceCache[deviceId] || deviceId;
}


/**
 * Send WhatsApp message
 * @param {string} phoneNumber - Phone number with country code (e.g., 6281234567890)
 * @param {string} message - Message text
 */
async function sendMessage(phoneNumber, message, deviceId = '1') {
    try {
        // Check if it's a Group ID or already formatted ID (contains @)
        let normalizedPhone = phoneNumber;

        if (!phoneNumber.includes('@') && phoneNumber.length <= 15) {
            // Normalize phone number (strip non-digits)
            normalizedPhone = phoneNumber.replace(/\D/g, '');

            // Add country code if not present
            if (!normalizedPhone.startsWith('62')) {
                if (normalizedPhone.startsWith('0')) {
                    normalizedPhone = '62' + normalizedPhone.substring(1);
                } else {
                    normalizedPhone = '62' + normalizedPhone;
                }
            }
        } else {
            console.log(`ℹ️ Detected Group/Special ID: ${phoneNumber}, skipping normalization`);
        }

        // Try different possible endpoints
        const endpoints = [
            '/send/message',
            '/api/send/message',
            '/api/send/text',
            '/send-message'
        ];

        const payload = {
            phone: normalizedPhone,
            message: message
        };

        const resolvedDeviceId = await resolveDeviceId(deviceId);
        console.log(`📤 Sending message to ${normalizedPhone} via Device ID ${resolvedDeviceId}`);

        let lastError = null;

        for (const endpoint of endpoints) {
            try {
                const url = `${WA_API_URL}${endpoint}`;
                console.log(`🔄 Trying endpoint: ${url}`);

                const response = await axios.post(url, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Device-Id': resolvedDeviceId
                    },
                    auth: {
                        username: WA_API_USERNAME,
                        password: WA_API_PASSWORD
                    },
                    timeout: 10000
                });

                if (response.status === 200) {
                    console.log(`✅ Message sent successfully via ${endpoint}`);
                    return { success: true, data: response.data, endpoint: endpoint };
                }
            } catch (err) {
                lastError = err;
                if (err.response?.status !== 404) {
                    // If not 404, it's a different error, log it
                    console.log(`⚠️ Error on ${endpoint}: ${err.message}`);
                }
                // Continue to next endpoint
                continue;
            }
        }

        // If all endpoints failed
        console.error(`❌ All endpoints failed. Last error:`, lastError?.message);
        return { success: false, error: 'All send endpoints failed' };

    } catch (error) {
        console.error(`❌ Error sending message:`, error.message);
        return { success: false, error: error.message };
    }
}


/**
 * Delete WhatsApp message
 * @param {string} phoneNumber - Phone number or Group ID
 * @param {string} messageId - ID of the message to delete
 */
async function deleteMessage(phoneNumber, messageId, deviceId = '1') {
    try {
        // Ensure proper suffix for deletion
        let formattedPhone = phoneNumber;
        if (!formattedPhone.includes('@')) {
            if (formattedPhone.length > 15) {
                formattedPhone += '@g.us';
            } else {
                if (formattedPhone.startsWith('0')) formattedPhone = '62' + formattedPhone.substring(1);
                else if (!formattedPhone.startsWith('62')) formattedPhone = '62' + formattedPhone;
                formattedPhone += '@s.whatsapp.net';
            }
        }

        const endpoints = [
            `/message/${messageId}/revoke`,
            `/message/${messageId}/delete`,
            '/delete/message',
            '/api/delete/message',
            '/api/message/delete',
            '/message/delete'
        ];

        const payload = {
            phone: formattedPhone,
            messageId: messageId,
            id: messageId // handle different API variations
        };

        const resolvedDeviceId = await resolveDeviceId(deviceId);
        console.log(`🗑️ Deleting message ${messageId} for ${formattedPhone} via Device ID ${resolvedDeviceId}`);

        let lastError = null;

        for (const endpoint of endpoints) {
            try {
                const url = `${WA_API_URL}${endpoint}`;

                const response = await axios.post(url, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Device-Id': resolvedDeviceId
                    },
                    auth: {
                        username: WA_API_USERNAME,
                        password: WA_API_PASSWORD
                    },
                    timeout: 5000
                });

                if (response.status === 200) {
                    console.log(`✅ Message deleted successfully via ${endpoint}`);
                    return { success: true };
                }
            } catch (err) {
                lastError = err;
                if (err.response?.status !== 404) {
                    // console.log(`⚠️ Error on ${endpoint}: ${err.message}`);
                }
                continue;
            }
        }

        console.error(`❌ Failed to delete message. Last error:`, lastError?.message);
        return { success: false };

    } catch (error) {
        console.error(`❌ Error deleting message:`, error.message);
        return { success: false };
    }
}

const BOT_NUMBER = process.env.BOT_NUMBER;

module.exports = {
    sendMessage,
    deleteMessage,
    resolveDeviceId,
    BOT_NUMBER
};

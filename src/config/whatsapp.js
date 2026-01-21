const axios = require('axios');
require('dotenv').config();

const WA_API_URL = process.env.WA_API_URL || 'http://localhost:3000';
const WA_API_USERNAME = process.env.WA_API_USERNAME || 'admin';
const WA_API_PASSWORD = process.env.WA_API_PASSWORD || 'admin';

/**
 * Send WhatsApp message
 * @param {string} phoneNumber - Phone number with country code (e.g., 6281234567890)
 * @param {string} message - Message text
 */
async function sendMessage(phoneNumber, message) {
    try {
        // Normalize phone number
        let normalizedPhone = phoneNumber.replace(/\D/g, '');

        // Add country code if not present
        if (!normalizedPhone.startsWith('62')) {
            if (normalizedPhone.startsWith('0')) {
                normalizedPhone = '62' + normalizedPhone.substring(1);
            } else {
                normalizedPhone = '62' + normalizedPhone;
            }
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

        console.log(`📤 Sending message to ${normalizedPhone}`);

        let lastError = null;

        for (const endpoint of endpoints) {
            try {
                const url = `${WA_API_URL}${endpoint}`;
                console.log(`🔄 Trying endpoint: ${url}`);

                const response = await axios.post(url, payload, {
                    headers: {
                        'Content-Type': 'application/json'
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


const BOT_NUMBER = process.env.BOT_NUMBER;

module.exports = {
    sendMessage,
    BOT_NUMBER
};

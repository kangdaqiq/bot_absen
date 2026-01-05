const express = require('express');
const router = express.Router();
const messageHandler = require('../handlers/messageHandler');

/**
 * POST /webhook - Receive messages from WhatsApp API
 */
router.post('/', messageHandler.handleMessage);

/**
 * GET /webhook - Health check
 */
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'WhatsApp Bot Webhook is running',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;

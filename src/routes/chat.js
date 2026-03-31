const express = require('express');

const { requireAuth } = require('../middleware/auth');
const chatController = require('../controllers/chatController');

const router = express.Router();

router.post('/create-get-room/', requireAuth, chatController.createOrGetRoom);
router.get('/get-room/', requireAuth, chatController.getRoom);
router.get('/messages/', requireAuth, chatController.listMessages);
router.post('/send-message/', requireAuth, chatController.sendMessage);
router.get('/user-chats/', requireAuth, chatController.userChats);

module.exports = { router };


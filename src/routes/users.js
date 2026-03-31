const express = require('express');

const { requireAuth } = require('../middleware/auth');
const usersController = require('../controllers/usersController');

const router = express.Router();

router.post('/register/', usersController.register);
router.post('/login/', usersController.login);
router.post('/token/refresh/', usersController.refresh);
router.get('/profile/', requireAuth, usersController.profile);
router.put('/profile/', requireAuth, usersController.updateProfile);
router.post('/forgot-password/', usersController.forgotPassword);
router.post('/forgot-password/verify-otp/', usersController.verifyOtp);
router.post('/forgot-password/reset-password/', usersController.resetPassword);

module.exports = { router };


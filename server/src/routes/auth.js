const express = require('express');
const authenticate = require('../middleware/auth');
const { login, logout, me } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/login', asyncHandler(login));
router.post('/logout', asyncHandler(logout));
router.get('/me', authenticate, asyncHandler(me));

module.exports = router;

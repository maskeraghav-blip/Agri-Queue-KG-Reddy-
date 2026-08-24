const express = require('express');
const router = express.Router();
const schemeController = require('../controllers/schemeController');
const { optionalAuth } = require('../middleware/auth');

router.get('/', schemeController.getAll);
router.post('/chat', optionalAuth, schemeController.chat);
router.post('/check-eligibility', optionalAuth, schemeController.checkEligibility);

module.exports = router;

const express = require('express');

const { requireAuth } = require('../middleware/auth');
const freelancerController = require('../controllers/freelancerController');

const router = express.Router();

router.post('/apply-gig/', requireAuth, freelancerController.applyGig);
router.post('/cancel-appl/', requireAuth, freelancerController.cancelApplication);
router.get('/applied-gigs/', requireAuth, freelancerController.appliedGigs);

module.exports = { router };


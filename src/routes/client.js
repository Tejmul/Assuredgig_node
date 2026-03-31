const express = require('express');

const { requireAuth } = require('../middleware/auth');
const clientController = require('../controllers/clientController');

const router = express.Router();

router.post('/create-gig/', requireAuth, clientController.createGig);
router.post('/update-gig/', requireAuth, clientController.updateGig);
router.delete('/delete-gig/', requireAuth, clientController.deleteGig);
router.get('/get-all-gigs/', clientController.allGigs);
router.get('/get-a-gig/', clientController.getGig);
router.get('/get-user-gigs/', requireAuth, clientController.userGigs);
router.get('/view-gig-appl/', requireAuth, clientController.viewGigApplications);
router.post('/reject-appl/', requireAuth, clientController.rejectApplication);
router.post('/accept-appl/', requireAuth, clientController.acceptApplication);
router.patch('/close-gig/', requireAuth, clientController.closeGig);
router.patch('/finish-gig-appl/', requireAuth, clientController.finishApplication);
router.post('/feedback/', clientController.feedback);

module.exports = { router };


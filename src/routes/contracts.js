const express = require('express');

const { requireAuth } = require('../middleware/auth');
const contractsController = require('../controllers/contractsController');

const router = express.Router();

router.get('/', requireAuth, contractsController.list);
router.post('/create/', requireAuth, contractsController.create);
router.get('/stats/', requireAuth, contractsController.stats);
router.get('/available-applications/', requireAuth, contractsController.availableApplications);

router.get('/:uuid/', requireAuth, contractsController.getByUuid);
router.get('/:uuid/history/', requireAuth, contractsController.history);
router.post('/:uuid/accept/', requireAuth, contractsController.accept);
router.post('/:uuid/reject/', requireAuth, contractsController.reject);
router.post('/:uuid/complete/', requireAuth, contractsController.complete);

router.get('/:uuid/draft/', requireAuth, contractsController.draftGet);
router.post('/:uuid/create-draft/', requireAuth, contractsController.draftCreate);
router.post('/:uuid/approve-draft/', requireAuth, contractsController.draftApprove);
router.post('/:uuid/reject-draft/', requireAuth, contractsController.draftReject);
router.post('/:uuid/cancel-draft/', requireAuth, contractsController.draftCancel);

router.get('/:uuid/milestones/', requireAuth, contractsController.milestonesList);
router.post('/:uuid/milestones/create/', requireAuth, contractsController.milestonesCreate);
router.get('/:uuid/milestones/:milestone_uuid/', requireAuth, contractsController.milestonesGet);
router.post('/:uuid/milestones/:milestone_uuid/complete/', requireAuth, contractsController.milestonesComplete);
router.post('/:uuid/milestones/:milestone_uuid/approve/', requireAuth, contractsController.milestonesApprove);
router.post('/:uuid/milestones/:milestone_uuid/reject/', requireAuth, contractsController.milestonesReject);

router.get('/:uuid/disputes/', requireAuth, contractsController.disputesList);
router.post('/:uuid/disputes/create/', requireAuth, contractsController.disputesCreate);
router.get('/:uuid/disputes/:dispute_uuid/', requireAuth, contractsController.disputesGet);
router.post('/:uuid/disputes/:dispute_uuid/close/', requireAuth, contractsController.disputesClose);

router.post('/:uuid/request-progress-update/', requireAuth, contractsController.requestProgressUpdate);

module.exports = { router };


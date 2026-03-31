const express = require('express');

const { requireAuth } = require('../middleware/auth');
const portfolioController = require('../controllers/portfolioController');

const router = express.Router();

router.get('/', portfolioController.list);
router.post('/create/', requireAuth, portfolioController.create);
router.get('/my/', requireAuth, portfolioController.my);
router.put('/update/', requireAuth, portfolioController.update);
router.delete('/delete/', requireAuth, portfolioController.remove);
router.get('/:portfolio_id/', portfolioController.getById);
router.get('/:user_id/reviews/', portfolioController.listReviews);
router.post('/:user_id/reviews/', requireAuth, portfolioController.upsertReview);

module.exports = { router };


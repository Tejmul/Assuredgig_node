const express = require('express');

const users = require('./users');
const client = require('./client');
const freelancer = require('./freelancer');
const chat = require('./chat');
const portfolio = require('./portfolio');
const contracts = require('./contracts');

const apiRouter = express.Router();

apiRouter.use('/users', users.router);
apiRouter.use('/client', client.router);
apiRouter.use('/freelancer', freelancer.router);
apiRouter.use('/chat', chat.router);
apiRouter.use('/portfolio', portfolio.router);
apiRouter.use('/contracts', contracts.router);

module.exports = { apiRouter };


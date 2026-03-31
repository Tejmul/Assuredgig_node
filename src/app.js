const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { apiRouter } = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errors');

async function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: true, credentials: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  app.get('/health/', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

let cachedApp;

// Vercel (and other serverless runtimes) may treat this module as an entrypoint.
// Export a default handler, while still exposing createApp for local/server usage.
async function handler(req, res) {
  if (!cachedApp) {
    cachedApp = await createApp();
  }
  return cachedApp(req, res);
}

module.exports = handler;
module.exports.createApp = createApp;


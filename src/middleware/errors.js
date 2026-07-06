const { ZodError } = require('zod');

function notFoundHandler(req, res, next) {
  res.status(404).json({ error: 'Not found' });
}

// Normalize a few error envelope shapes used in your docs:
// - DRF style field errors: { field: ["..."] }
// - { error, details }
// - { message, errors? }
function errorHandler(err, req, res, next) {
  // Zod validation errors are client errors (400), returned as DRF-style
  // field errors: { field: ["message", ...] }. Without this, ZodError falls
  // through to the generic branches below and is reported as a 500.
  if (err instanceof ZodError || err?.name === 'ZodError') {
    const details = {};
    for (const issue of err.issues || []) {
      const key = issue.path && issue.path.length ? issue.path.join('.') : 'non_field_errors';
      (details[key] = details[key] || []).push(issue.message);
    }
    return res.status(400).json(details);
  }

  const status = Number(err.status || err.statusCode || 500);

  if (err.expose && err.body) {
    return res.status(status).json(err.body);
  }

  if (err && typeof err === 'object') {
    if (err.details && err.error) {
      return res.status(status).json({ error: err.error, details: err.details });
    }
    if (err.message && err.errors) {
      return res.status(status).json({ message: err.message, errors: err.errors });
    }
    if (err.message && err.message !== 'Error') {
      return res.status(status).json({ error: err.message });
    }
  }

  return res.status(status).json({ error: 'Internal server error' });
}

module.exports = { errorHandler, notFoundHandler };


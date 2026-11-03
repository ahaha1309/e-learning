function notFoundHandler(req, res) {
  res.status(404).render('errors/404', {
    title: 'Page not found',
    path: req.originalUrl,
  });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // The 500 page hides the real error from the user, so without this line
  // there is nothing in the terminal to diagnose with. Log the request +
  // stack here; the user still only sees the generic page.
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);

  const statusCode = err.statusCode || 500;

  res.status(statusCode).render('errors/error', {
    title: 'Application error',
    statusCode,
    message: statusCode === 500 ? 'An unexpected error occurred.' : err.message,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};

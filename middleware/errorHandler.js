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

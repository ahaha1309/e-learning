const AuditLog = require('../../models/AuditLog');

async function listAuditLogs(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.action) {
      query.action = req.query.action;
    }
    
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('user', 'name email role avatarUrl')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(query)
    ]);

    res.render('admin/audit-log', {
      title: 'Audit Logs',
      activeNav: 'audit',
      logs,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalLogs: total,
      actionFilter: req.query.action || ''
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listAuditLogs
};

const User = require('../../models/User');

async function listStudents(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const PAGE_SIZE = 20;
    const query = { role: 'student' };

    if (req.query.q) {
      const search = req.query.q.trim();
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await User.countDocuments(query);
    const totalPages = Math.ceil(total / PAGE_SIZE);

    const students = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE);

    return res.render('admin/students/index', {
      title: 'Students',
      students,
      query: req.query.q || '',
      currentPage: page,
      totalPages
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listStudents };

async function renderHome(req, res, next) {
  try {
    const authenticated = req.isAuthenticated ? req.isAuthenticated() : Boolean(req.user);
    if (authenticated && req.user) {
      const role = req.user.role;
      if (role === 'admin') return res.redirect('/admin/dashboard');
      if (role === 'teacher') return res.redirect('/teacher');
      if (role === 'student') return res.redirect('/student');
      return res.redirect('/auth/login');
    }

    const Classroom = require('../../models/Classroom');
    const User = require('../../models/User');
    const Lecture = require('../../models/Lecture');

    let classroomCount = 0;
    let teacherCount = 0;
    let studentCount = 0;
    let lectureCount = 0;
    try {
      [classroomCount, teacherCount, studentCount, lectureCount] = await Promise.all([
        Classroom.countDocuments({ isArchived: false }),
        User.countDocuments({ role: 'teacher', status: 'active' }),
        User.countDocuments({ role: 'student', status: 'active' }),
        Lecture.countDocuments({ isPublished: true }),
      ]);
    } catch (countErr) {
      // keep the zero defaults
    }

    res.render('index', {
      title: 'Enterprise Learning Platform',
      classroomCount,
      teacherCount,
      studentCount,
      lectureCount,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderHome,
};

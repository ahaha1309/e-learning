const User = require('../../models/User');

async function listPendingTeachers() {
  return User.find({ role: 'teacher', status: 'pending' }).sort({ createdAt: -1 });
}

async function approveTeacher(teacherId) {
  const teacher = await User.findOne({ _id: teacherId, role: 'teacher' });

  if (!teacher) {
    const error = new Error('Teacher account not found.');
    error.statusCode = 404;
    throw error;
  }

  teacher.status = 'active';
  await teacher.save();

  return teacher;
}

async function rejectTeacher(teacherId) {
  const teacher = await User.findOne({ _id: teacherId, role: 'teacher' });

  if (!teacher) {
    const error = new Error('Teacher account not found.');
    error.statusCode = 404;
    throw error;
  }

  teacher.status = 'rejected';
  await teacher.save();

  return teacher;
}

module.exports = {
  listPendingTeachers,
  approveTeacher,
  rejectTeacher,
};

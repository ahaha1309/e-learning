const Classroom = require('../../models/Classroom');
const Lecture = require('../../models/Lecture');
const Exam = require('../../models/Exam');
const ClassroomMember = require('../../models/ClassroomMember');

const PAGE_SIZE = 20;

async function listClassrooms(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const query = {};

    if (req.query.q) {
      const search = req.query.q.trim();
      query.name = { $regex: search, $options: 'i' };
    }

    const total = await Classroom.countDocuments(query);
    const totalPages = Math.ceil(total / PAGE_SIZE);

    const classrooms = await Classroom.find(query)
      .populate('teacher', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE);

    return res.render('admin/classrooms/index', {
      title: 'Classrooms',
      classrooms,
      query: req.query.q || '',
      currentPage: page,
      totalPages
    });
  } catch (error) {
    return next(error);
  }
}

async function showClassroom(req, res, next) {
  try {
    const classroom = await Classroom.findById(req.params.classroomId)
      .populate('teacher', 'name email');

    if (!classroom) {
      return res.redirect('/admin/classrooms');
    }

    const [students, lectures, exams] = await Promise.all([
      ClassroomMember.countDocuments({ classroom: classroom.id, status: 'approved' }),
      Lecture.countDocuments({ classroom: classroom.id }),
      Exam.countDocuments({ classroom: classroom.id }),
    ]);

    return res.render('admin/classrooms/show', {
      title: classroom.name,
      classroom,
      stats: { students, lectures, exams }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listClassrooms, showClassroom };

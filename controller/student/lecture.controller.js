const ClassroomMember = require('../../models/ClassroomMember');
const Lecture = require('../../models/Lecture');
const ChatMessage = require('../../models/ChatMessage');
const { markComplete, CONTENT_TYPES } = require('../../helper/progress');
const { buildPreviewModel } = require('../../helper/lecturePreview');
const { checkItemAccess } = require('../../services/completion.service');

function groupLecturesByChapter(lectures) {
  return lectures.reduce((groups, lecture) => {
    if (!groups[lecture.chapterTitle]) {
      groups[lecture.chapterTitle] = [];
    }

    groups[lecture.chapterTitle].push(lecture);
    return groups;
  }, {});
}

async function renderStudentLectures(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ classroom: req.params.classroomId, student: req.user.id, status: 'approved' }).populate('classroom');

    if (!membership) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const lectures = await Lecture.find({ classroom: membership.classroom.id, isPublished: true }).sort({ chapterTitle: 1, orderIndex: 1, createdAt: 1 });
    const lecturesByChapter = groupLecturesByChapter(lectures);

    return res.render('student/lectures/index', {
      title: `${membership.classroom.name} lectures`,
      membership,
      lecturesByChapter,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderStudentLectureDetail(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ classroom: req.params.classroomId, student: req.user.id, status: 'approved' }).populate('classroom');

    if (!membership) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const lecture = await Lecture.findOne({ _id: req.params.lectureId, classroom: membership.classroom.id, isPublished: true });

    if (!lecture) {
      return res.status(404).render('errors/404', {
        title: 'Lecture not found',
        path: req.originalUrl,
      });
    }

    // Server-side prerequisite gate (Track 3). The progress tree already shows
    // LOCKED items on the outline; this enforces it server-side so a student
    // can't bypass prerequisites by guessing the lecture URL. Reads the same
    // completion ledger the tree uses, so the two can never disagree.
    const access = await checkItemAccess({
      classroom: membership.classroom,
      studentId: req.user.id,
      itemType: CONTENT_TYPES.LESSON,
      itemId: lecture._id,
    });
    if (!access.allowed) {
      return res.status(403).render('errors/403', {
        title: 'Content locked',
        message: 'Complete the previous item in this module before continuing.',
        path: req.originalUrl,
      });
    }

    // Load last 50 chat messages for the split-pane hub
    const messages = await ChatMessage.find({ classroom: membership.classroom.id })
      .populate('sender', 'name avatarUrl')
      .sort({ createdAt: -1 })
      .limit(50);
    messages.reverse();

    return res.render('student/lectures/show', {
      title: lecture.title,
      membership,
      lecture,
      messages,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderStudentLecturePreview(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ classroom: req.params.classroomId, student: req.user.id, status: 'approved' }).populate('classroom');

    if (!membership) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const lecture = await Lecture.findOne({ _id: req.params.lectureId, classroom: membership.classroom.id, isPublished: true });

    if (!lecture) {
      return res.status(404).render('errors/404', {
        title: 'Lecture not found',
        path: req.originalUrl,
      });
    }

    return res.render('student/lectures/preview', {
      title: `${lecture.title} preview`,
      membership,
      lecture,
      preview: buildPreviewModel(lecture),
    });
  } catch (error) {
    return next(error);
  }
}

// Records a lesson completion (the data that drives course progress). Idempotent:
// the unique index on StudentProgress guarantees one row per (student, classroom,
// item), so re-submitting just updates completedAt. Routed through the shared
// markComplete helper so lessons, assignments, and exams share one write path.
async function markLectureComplete(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({
      classroom: req.params.classroomId,
      student: req.user.id,
      status: 'approved',
    });

    if (!membership) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const lecture = await Lecture.findOne({
      _id: req.params.lectureId,
      classroom: membership.classroom,
      isPublished: true,
    });

    if (!lecture) {
      return res.status(404).render('errors/404', {
        title: 'Lecture not found',
        path: req.originalUrl,
      });
    }

    await markComplete({
      student: req.user.id,
      classroom: String(membership.classroom._id || membership.classroom),
      itemType: CONTENT_TYPES.LESSON,
      itemId: lecture._id,
    });

    return res.redirect(`/student/classrooms/${membership.classroom._id}/lectures/${lecture._id}`);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderStudentLectures,
  renderStudentLectureDetail,
  renderStudentLecturePreview,
  markLectureComplete,
};

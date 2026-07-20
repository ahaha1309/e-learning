const { validationResult } = require('express-validator');
const Classroom = require('../../models/Classroom');
const Lecture = require('../../models/Lecture');
const ChatMessage = require('../../models/ChatMessage');
const { buildPreviewModel } = require('../../helper/lecturePreview');

function formatValidationErrors(req) {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array().map((item) => item.msg).join('. ');
}

async function renderLectureIndex(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const lectures = await Lecture.find({ classroom: classroom.id, teacher: req.user.id, isPublished: true }).sort({ chapterTitle: 1, orderIndex: 1, createdAt: 1 });

    return res.render('teacher/lectures/index', {
      title: `${classroom.name} lectures`,
      classroom,
      lectures,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderCreateLecture(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    return res.render('teacher/lectures/new', {
      title: 'Create lecture',
      classroom,
      formData: {},
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function createLectureHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const validationMessage = formatValidationErrors(req);
    if (validationMessage) {
      return res.status(422).render('teacher/lectures/new', {
        title: 'Create lecture',
        classroom,
        formData: req.body,
        errorMessage: validationMessage,
      });
    }

    const resourceUrl = req.file ? '/uploads/lectures/' + req.file.filename : (req.body.resourceUrl || '');
    const resourceType = req.file
      ? (req.file.mimetype.startsWith('video') ? 'video' : req.file.mimetype === 'application/pdf' ? 'pdf' : 'document')
      : (req.body.resourceType || 'text');

    const lecture = new Lecture({
      classroom: classroom.id,
      teacher: req.user.id,
      chapterTitle: req.body.chapterTitle,
      title: req.body.title,
      summary: req.body.summary || '',
      content: req.body.content || '',
      resourceUrl,
      resourceType,
      orderIndex: Number(req.body.orderIndex || 0),
      isPublished: req.body.isPublished !== 'false',
    });

    await lecture.save();
    return res.redirect(`/teacher/classrooms/${classroom.id}/lectures?feedback=${encodeURIComponent('Lecture created.')}`);
  } catch (error) {
    return next(error);
  }
}

async function renderLectureDetail(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const lecture = await Lecture.findOne({ _id: req.params.lectureId, classroom: classroom.id, teacher: req.user.id });
    if (!lecture) {
      return res.status(404).render('errors/404', {
        title: 'Lecture not found',
        path: req.originalUrl,
      });
    }

    // Load last 50 chat messages for the split-pane hub
    const messages = await ChatMessage.find({ classroom: classroom.id })
      .populate('sender', 'name avatarUrl')
      .sort({ createdAt: -1 })
      .limit(50);
    messages.reverse();

    return res.render('teacher/lectures/show', {
      title: lecture.title,
      classroom,
      lecture,
      messages,
      preview: buildPreviewModel(lecture),
    });
  } catch (error) {
    return next(error);
  }
}

async function renderLecturePreview(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const lecture = await Lecture.findOne({ _id: req.params.lectureId, classroom: classroom.id, teacher: req.user.id });
    if (!lecture) {
      return res.status(404).render('errors/404', {
        title: 'Lecture not found',
        path: req.originalUrl,
      });
    }

    return res.render('teacher/lectures/preview', {
      title: `${lecture.title} preview`,
      classroom,
      lecture,
      preview: buildPreviewModel(lecture),
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderLectureIndex,
  renderCreateLecture,
  createLectureHandler,
  renderLectureDetail,
  renderLecturePreview,
};

async function renderEditLecture(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    }

    const lecture = await Lecture.findOne({ _id: req.params.lectureId, classroom: classroom.id, teacher: req.user.id });
    if (!lecture) {
      return res.status(404).render('errors/404', { title: 'Lecture not found', path: req.originalUrl });
    }

    return res.render('teacher/lectures/edit', {
      title: `Edit: ${lecture.title}`,
      classroom,
      lecture,
      formData: lecture,
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateLectureHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    }

    const lecture = await Lecture.findOne({ _id: req.params.lectureId, classroom: classroom.id, teacher: req.user.id });
    if (!lecture) {
      return res.status(404).render('errors/404', { title: 'Lecture not found', path: req.originalUrl });
    }

    const validationMessage = formatValidationErrors(req);
    if (validationMessage) {
      return res.status(422).render('teacher/lectures/edit', {
        title: `Edit: ${lecture.title}`,
        classroom,
        lecture,
        formData: req.body,
        errorMessage: validationMessage,
      });
    }

    if (req.file) {
      lecture.resourceUrl = '/uploads/lectures/' + req.file.filename;
      lecture.resourceType = req.file.mimetype.startsWith('video') ? 'video' : req.file.mimetype === 'application/pdf' ? 'pdf' : 'document';
    } else if (req.body.resourceUrl && req.body.resourceUrl !== lecture.resourceUrl) {
      lecture.resourceUrl = req.body.resourceUrl;
      lecture.resourceType = req.body.resourceType || 'text';
    } else if (req.body.resourceType && req.body.resourceType !== lecture.resourceType) {
      lecture.resourceType = req.body.resourceType;
    }

    lecture.chapterTitle = req.body.chapterTitle;
    lecture.title = req.body.title;
    lecture.summary = req.body.summary || '';
    lecture.content = req.body.content || '';
    lecture.orderIndex = Number(req.body.orderIndex || 0);
    lecture.isPublished = req.body.isPublished !== 'false';

    await lecture.save();
    return res.redirect(`/teacher/classrooms/${classroom.id}/lectures/${lecture.id}?feedback=${encodeURIComponent('Lecture updated.')}`);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderLectureIndex,
  renderCreateLecture,
  createLectureHandler,
  renderLectureDetail,
  renderLecturePreview,
  renderEditLecture,
  updateLectureHandler,
};

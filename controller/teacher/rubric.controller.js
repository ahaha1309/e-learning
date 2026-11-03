const { validationResult } = require('express-validator');
const Classroom = require('../../models/Classroom');
const Assignment = require('../../models/Assignment');
const Rubric = require('../../models/Rubric');

function formatValidationErrors(req) {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array().map((item) => item.msg).join('. ');
}

function parseCriteriaInput(raw) {
  let criteria = raw;
  if (typeof criteria === 'string') {
    try {
      criteria = JSON.parse(criteria);
    } catch {
      criteria = [];
    }
  }
  if (!Array.isArray(criteria)) {
    return [];
  }
  return criteria.map((c) => {
    const scale = Array.isArray(c.scale)
      ? c.scale
          .map((s) => ({
            points: Number(s.points) || 0,
            label: String(s.label || '').trim(),
          }))
          .filter((s) => s.label)
      : [];

    return {
      label: String(c.label || '').trim(),
      description: String(c.description || '').trim(),
      maxPoints: Math.max(0, Number(c.maxPoints) || 0),
      scale,
    };
  });
}

async function renderRubricIndex(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const rubrics = await Rubric.find({ classroom: classroom.id, teacher: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const rubricIds = rubrics.map((r) => r._id);
    const assignments = await Assignment.find({
      classroom: classroom.id,
      rubric: { $in: rubricIds },
    })
      .select('title rubric')
      .lean();

    const enrichedRubrics = rubrics.map((r) => {
      const assigned = assignments.filter((a) => String(a.rubric) === String(r._id));
      return {
        ...r,
        assignments: assigned,
        assignmentCount: assigned.length,
      };
    });

    return res.render('teacher/rubrics/index', {
      title: `Tiêu chí chấm điểm (Rubric) — ${classroom.name}`,
      classroom,
      rubrics: enrichedRubrics,
      feedback: req.query.feedback || null,
      errorMessage: req.query.error || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderCreateRubric(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    return res.render('teacher/rubrics/new', {
      title: 'Tạo Rubric mới',
      classroom,
      formData: {
        criteria: [
          {
            label: 'Chất lượng nội dung & Tính hoàn thiện',
            description: 'Mức độ đáp ứng yêu cầu của bài tập và độ chính xác của giải pháp.',
            maxPoints: 4,
            scale: [
              { points: 4, label: 'Xuất sắc / Mastery' },
              { points: 3, label: 'Tốt / Proficient' },
              { points: 2, label: 'Đạt / Developing' },
              { points: 1, label: 'Cần cải thiện / Novice' },
            ],
          },
          {
            label: 'Cấu trúc & Định dạng trình bày',
            description: 'Bố cục rõ ràng, trình bày mạch lạc, tuân thủ quy định định dạng.',
            maxPoints: 3,
            scale: [
              { points: 3, label: 'Tốt' },
              { points: 2, label: 'Đạt' },
              { points: 1, label: 'Chưa đạt' },
            ],
          },
          {
            label: 'Sáng tạo & Phân tích chuyên sâu',
            description: 'Ý tưởng mở rộng, tư duy phân tích độc lập và khả năng lập luận.',
            maxPoints: 3,
            scale: [
              { points: 3, label: 'Vượt kỳ vọng' },
              { points: 2, label: 'Đạt yêu cầu' },
              { points: 0, label: 'Không có' },
            ],
          },
        ],
      },
      errorMessage: null,
      returnTo: req.query.returnTo || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function createRubricHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const validationMessage = formatValidationErrors(req);
    const parsedCriteria = parseCriteriaInput(req.body.criteria);

    if (validationMessage || parsedCriteria.length === 0) {
      return res.status(422).render('teacher/rubrics/new', {
        title: 'Tạo Rubric mới',
        classroom,
        formData: {
          name: req.body.name,
          description: req.body.description,
          criteria: parsedCriteria,
        },
        errorMessage: validationMessage || 'Rubric phải có ít nhất một tiêu chí đánh giá hợp lệ.',
        returnTo: req.body.returnTo || null,
      });
    }

    const rubric = new Rubric({
      classroom: classroom.id,
      teacher: req.user.id,
      name: req.body.name,
      description: req.body.description || '',
      criteria: parsedCriteria,
    });

    await rubric.save();

    if (req.body.returnTo === 'assignment-new') {
      return res.redirect(`/teacher/classrooms/${classroom.id}/assignments/new?rubricId=${rubric.id}&feedback=${encodeURIComponent('Đã tạo Rubric thành công và sẵn sàng gắn vào bài tập.')}`);
    }

    return res.redirect(`/teacher/classrooms/${classroom.id}/rubrics?feedback=${encodeURIComponent('Đã tạo Rubric thành công.')}`);
  } catch (error) {
    return next(error);
  }
}

async function renderRubricDetail(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const rubric = await Rubric.findOne({
      _id: req.params.rubricId,
      classroom: classroom.id,
      teacher: req.user.id,
    });

    if (!rubric) {
      return res.status(404).render('errors/404', {
        title: 'Rubric not found',
        path: req.originalUrl,
      });
    }

    const assignments = await Assignment.find({
      classroom: classroom.id,
      rubric: rubric.id,
    }).select('title dueDate totalPoints isPublished').lean();

    return res.render('teacher/rubrics/show', {
      title: `${rubric.name} — Rubric`,
      classroom,
      rubric,
      assignments,
      feedback: req.query.feedback || null,
      errorMessage: req.query.error || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderEditRubric(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const rubric = await Rubric.findOne({
      _id: req.params.rubricId,
      classroom: classroom.id,
      teacher: req.user.id,
    });

    if (!rubric) {
      return res.status(404).render('errors/404', {
        title: 'Rubric not found',
        path: req.originalUrl,
      });
    }

    return res.render('teacher/rubrics/edit', {
      title: `Chỉnh sửa: ${rubric.name}`,
      classroom,
      rubric,
      formData: {
        name: rubric.name,
        description: rubric.description,
        criteria: rubric.criteria,
      },
      errorMessage: null,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateRubricHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const rubric = await Rubric.findOne({
      _id: req.params.rubricId,
      classroom: classroom.id,
      teacher: req.user.id,
    });

    if (!rubric) {
      return res.status(404).render('errors/404', {
        title: 'Rubric not found',
        path: req.originalUrl,
      });
    }

    const validationMessage = formatValidationErrors(req);
    const parsedCriteria = parseCriteriaInput(req.body.criteria);

    if (validationMessage || parsedCriteria.length === 0) {
      return res.status(422).render('teacher/rubrics/edit', {
        title: `Chỉnh sửa: ${rubric.name}`,
        classroom,
        rubric,
        formData: {
          name: req.body.name,
          description: req.body.description,
          criteria: parsedCriteria,
        },
        errorMessage: validationMessage || 'Rubric phải có ít nhất một tiêu chí đánh giá hợp lệ.',
      });
    }

    rubric.name = req.body.name;
    rubric.description = req.body.description || '';
    rubric.criteria = parsedCriteria;

    await rubric.save();

    return res.redirect(`/teacher/classrooms/${classroom.id}/rubrics/${rubric.id}?feedback=${encodeURIComponent('Đã cập nhật Rubric thành công.')}`);
  } catch (error) {
    return next(error);
  }
}

async function deleteRubricHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const rubric = await Rubric.findOne({
      _id: req.params.rubricId,
      classroom: classroom.id,
      teacher: req.user.id,
    });

    if (!rubric) {
      return res.status(404).render('errors/404', {
        title: 'Rubric not found',
        path: req.originalUrl,
      });
    }

    // Unlink from any assignments referencing this rubric
    const affectedAssignments = await Assignment.updateMany(
      { classroom: classroom.id, rubric: rubric.id },
      { $set: { rubric: null } }
    );

    await Rubric.deleteOne({ _id: rubric.id });

    let msg = 'Đã xóa Rubric thành công.';
    if (affectedAssignments.modifiedCount > 0) {
      msg += ` Đã gỡ liên kết khỏi ${affectedAssignments.modifiedCount} bài tập.`;
    }

    return res.redirect(`/teacher/classrooms/${classroom.id}/rubrics?feedback=${encodeURIComponent(msg)}`);
  } catch (error) {
    return next(error);
  }
}

async function duplicateRubricHandler(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    const rubric = await Rubric.findOne({
      _id: req.params.rubricId,
      classroom: classroom.id,
      teacher: req.user.id,
    });

    if (!rubric) {
      return res.status(404).render('errors/404', {
        title: 'Rubric not found',
        path: req.originalUrl,
      });
    }

    const criteriaCopy = rubric.criteria.map((c) => ({
      label: c.label,
      description: c.description,
      maxPoints: c.maxPoints,
      scale: (c.scale || []).map((s) => ({ points: s.points, label: s.label })),
    }));

    const clone = new Rubric({
      classroom: classroom.id,
      teacher: req.user.id,
      name: `${rubric.name} (Bản sao)`,
      description: rubric.description,
      criteria: criteriaCopy,
    });

    await clone.save();

    return res.redirect(`/teacher/classrooms/${classroom.id}/rubrics?feedback=${encodeURIComponent(`Đã nhân bản Rubric "${clone.name}" thành công.`)}`);
  } catch (error) {
    return next(error);
  }
}

async function apiGetRubrics(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    const rubrics = await Rubric.find({ classroom: classroom.id, teacher: req.user.id })
      .sort({ name: 1 })
      .lean();

    return res.json({ rubrics });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderRubricIndex,
  renderCreateRubric,
  createRubricHandler,
  renderRubricDetail,
  renderEditRubric,
  updateRubricHandler,
  deleteRubricHandler,
  duplicateRubricHandler,
  apiGetRubrics,
};


const Outcome = require('../../models/Outcome');
const StudentOutcomeResult = require('../../models/StudentOutcomeResult');
const Classroom = require('../../models/Classroom');
const Exam = require('../../models/Exam');
const Question = require('../../models/Question');
const ExamSubmission = require('../../models/ExamSubmission');
const ClassroomMember = require('../../models/ClassroomMember');

/**
 * Calculates CLO and PLO attainment percentages for a student in a classroom
 */
async function calculateOutcomeAttainments(studentId, classroomId) {
  // 1. Fetch all CLOs for this classroom
  const clos = await Outcome.find({ classroom: classroomId, type: 'CLO' }).populate('mappedPLOs.plo').lean();
  if (clos.length === 0) return [];

  // 2. Fetch the latest graded submissions for each exam in the classroom
  const submissions = await ExamSubmission.find({
    classroom: classroomId,
    student: studentId,
    status: { $ne: 'in_progress' }
  }).sort({ attemptNumber: -1 }).lean();

  const latestSubmissionsMap = {};
  submissions.forEach(sub => {
    const examIdStr = String(sub.exam);
    if (!latestSubmissionsMap[examIdStr]) {
      latestSubmissionsMap[examIdStr] = sub;
    }
  });
  const activeSubmissions = Object.values(latestSubmissionsMap);

  // 3. Map question scores achieved by the student
  const questionScoresMap = {};
  activeSubmissions.forEach(sub => {
    if (sub.answers && Array.isArray(sub.answers)) {
      sub.answers.forEach(ans => {
        questionScoresMap[String(ans.question)] = ans.pointsAchieved || 0;
      });
    }
  });

  // 4. Fetch all exams and questions took by the student
  const examIds = activeSubmissions.map(sub => sub.exam);
  const exams = await Exam.find({ _id: { $in: examIds } }).lean();
  
  const examPointsMap = {};
  exams.forEach(exam => {
    const qCount = exam.questionCount || 1;
    examPointsMap[String(exam._id)] = (exam.totalPoints || 0) / qCount;
  });

  const questions = await Question.find({ exam: { $in: examIds } }).lean();

  const cloAttainments = [];
  const plosToUpdate = {}; // { ploId: { totalAchievedWeight, totalMaxWeight } }

  // 5. Calculate CLO scores
  for (const clo of clos) {
    let totalMaxPoints = 0;
    let totalAchievedPoints = 0;

    questions.forEach(q => {
      const mapping = q.outcomeMappings?.find(m => String(m.clo) === String(clo._id));
      if (mapping) {
        const weight = mapping.weight || 1;
        const maxPoints = examPointsMap[String(q.exam)] || (q.points || 0);
        totalMaxPoints += maxPoints * weight;
        const achieved = questionScoresMap[String(q._id)] || 0;
        totalAchievedPoints += achieved * weight;
      }
    });

    const achievedPercent = totalMaxPoints > 0 
      ? Math.round((totalAchievedPoints / totalMaxPoints) * 100) 
      : 0;

    const isPassed = achievedPercent >= (clo.passThreshold || 50);

    // Upsert CLO Result Cache
    await StudentOutcomeResult.findOneAndUpdate(
      { student: studentId, outcome: clo._id, classroom: classroomId },
      { achievedPercent, isPassed, lastCalculatedAt: new Date() },
      { upsert: true, new: true }
    );

    cloAttainments.push({
      cloId: clo._id,
      code: clo.code,
      description: clo.description,
      achievedPercent,
      isPassed,
      passThreshold: clo.passThreshold
    });

    // Roll up to PLOs
    if (clo.mappedPLOs && Array.isArray(clo.mappedPLOs)) {
      clo.mappedPLOs.forEach(mapping => {
        const ploIdStr = String(mapping.plo._id || mapping.plo);
        if (!plosToUpdate[ploIdStr]) {
          plosToUpdate[ploIdStr] = {
            totalAchievedWeight: 0,
            totalMaxWeight: 0,
            ploRef: mapping.plo
          };
        }
        const w = mapping.weight || 1;
        plosToUpdate[ploIdStr].totalAchievedWeight += achievedPercent * w;
        plosToUpdate[ploIdStr].totalMaxWeight += 100 * w; // Maximum achievable percent (100%) * weight
      });
    }
  }

  // 6. Calculate PLO scores
  for (const [ploIdStr, data] of Object.entries(plosToUpdate)) {
    const achievedPercent = data.totalMaxWeight > 0
      ? Math.round((data.totalAchievedWeight / data.totalMaxWeight) * 100)
      : 0;
    
    const passThreshold = data.ploRef?.passThreshold || 50;
    const isPassed = achievedPercent >= passThreshold;

    // Upsert PLO Result Cache
    await StudentOutcomeResult.findOneAndUpdate(
      { student: studentId, outcome: ploIdStr, classroom: classroomId },
      { achievedPercent, isPassed, lastCalculatedAt: new Date() },
      { upsert: true, new: true }
    );
  }

  return cloAttainments;
}

/**
 * Renders the student's OBE Report
 */
async function renderStudentOBEReport(req, res, next) {
  try {
    const { classroomId } = req.params;
    const studentId = req.user.id;

    const classroom = await Classroom.findById(classroomId).lean();
    if (!classroom) {
      return res.status(404).render('errors/404', { message: 'Lớp học không tồn tại' });
    }

    // Verify membership
    const member = await ClassroomMember.findOne({ classroom: classroomId, student: studentId, status: 'approved' }).lean();
    if (!member) {
      return res.status(403).render('errors/403', { message: 'Bạn không có quyền truy cập báo cáo lớp học này' });
    }

    // Calculate outcomes
    await calculateOutcomeAttainments(studentId, classroomId);

    // Fetch outcomes and results
    const results = await StudentOutcomeResult.find({ student: studentId, classroom: classroomId })
      .populate('outcome')
      .lean();

    const clos = results.filter(r => r.outcome?.type === 'CLO');
    const plos = results.filter(r => r.outcome?.type === 'PLO');

    res.render('student/classrooms/obe-report', {
      title: `Báo cáo Chuẩn đầu ra OBE - ${classroom.name}`,
      classroom,
      clos,
      plos,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Renders OBE Setup and Mapping Panel for Teachers
 */
async function renderClassroomOBEManagement(req, res, next) {
  try {
    const { classroomId } = req.params;
    const teacherId = req.user.id;

    const classroom = await Classroom.findOne({ _id: classroomId, teacher: teacherId }).lean();
    if (!classroom) {
      return res.status(404).render('errors/404', { message: 'Lớp học không tồn tại hoặc bạn không phải giáo viên phụ trách' });
    }

    // Fetch existing PLOs (global) and CLOs (classroom specific)
    const [plos, clos] = await Promise.all([
      Outcome.find({ type: 'PLO' }).lean(),
      Outcome.find({ classroom: classroomId, type: 'CLO' }).populate('mappedPLOs.plo').lean()
    ]);

    // Fetch classroom exams
    const exams = await Exam.find({ classroom: classroomId }).lean();

    res.render('teacher/classrooms/obe-manage', {
      title: `Quản lý chuẩn đầu ra OBE - ${classroom.name}`,
      classroom,
      plos,
      clos,
      exams,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Renders OBE Setup and Mapping Panel for a specific Exam
 */
async function renderExamOBEConfig(req, res, next) {
  try {
    const { classroomId, examId } = req.params;
    const teacherId = req.user.id;

    const classroom = await Classroom.findOne({ _id: classroomId, teacher: teacherId }).lean();
    if (!classroom) {
      return res.status(404).render('errors/404', { message: 'Lớp học không tồn tại hoặc bạn không phải giáo viên phụ trách' });
    }

    const exam = await Exam.findOne({ _id: examId, classroom: classroomId }).lean();
    if (!exam) {
      return res.status(404).render('errors/404', { message: 'Bài thi không tồn tại' });
    }

    // Fetch existing CLOs (classroom specific)
    const clos = await Outcome.find({ classroom: classroomId, type: 'CLO' }).populate('mappedPLOs.plo').lean();

    // Fetch questions for this exam
    const questions = await Question.find({ exam: examId }).lean();

    res.render('teacher/classrooms/obe-exam', {
      title: `Cấu hình OBE - ${exam.title}`,
      classroom,
      exam,
      clos,
      questions,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Saves mappings of questions to CLOs
 */
async function apiSaveQuestionMappings(req, res, next) {
  try {
    const { classroomId } = req.params;
    const { questionId, mappings } = req.body; // mappings: Array of { clo: id, weight: number }

    // Verify teacher owns classroom
    const classroom = await Classroom.findOne({ _id: classroomId, teacher: req.user.id }).lean();
    if (!classroom) {
      return res.status(403).json({ error: 'Không có quyền sửa đổi thông tin lớp học này' });
    }

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: 'Câu hỏi không tồn tại' });
    }

    question.outcomeMappings = mappings.map(m => ({
      clo: m.clo,
      weight: Number(m.weight) || 1
    }));

    await question.save();
    return res.json({ success: true, message: 'Lưu ánh xạ chuẩn đầu ra thành công' });
  } catch (error) {
    return next(error);
  }
}

/**
 * Bulk saves mappings of questions to CLOs for a specific exam
 */
async function apiBulkSaveQuestionMappings(req, res, next) {
  try {
    const { classroomId, examId } = req.params;
    const { mappingsList } = req.body; // Array of { questionId, mappings: [{ clo, weight }] }

    // Verify teacher owns classroom
    const classroom = await Classroom.findOne({ _id: classroomId, teacher: req.user.id }).lean();
    if (!classroom) {
      return res.status(403).json({ error: 'Không có quyền sửa đổi thông tin lớp học này' });
    }
    
    if (!Array.isArray(mappingsList)) {
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    }

    // We can iterate and update each question
    const updatePromises = mappingsList.map(async (item) => {
      const q = await Question.findOne({ _id: item.questionId, exam: examId });
      if (q) {
        q.outcomeMappings = item.mappings.map(m => ({
          clo: m.clo,
          weight: Number(m.weight) || 1
        }));
        return q.save();
      }
    });

    await Promise.all(updatePromises);
    
    return res.json({ success: true, message: 'Đã lưu tất cả ánh xạ thành công' });
  } catch (error) {
    return next(error);
  }
}

/**
 * Creates a new CLO Outcome under a classroom
 */
async function apiCreateCLO(req, res, next) {
  try {
    const { classroomId } = req.params;
    const { code, description, mappedPLOs, passThreshold } = req.body;

    const classroom = await Classroom.findOne({ _id: classroomId, teacher: req.user.id }).lean();
    if (!classroom) {
      return res.status(403).json({ error: 'Không có quyền thao tác trên lớp học này' });
    }

    const clo = new Outcome({
      code,
      type: 'CLO',
      description,
      classroom: classroomId,
      mappedPLOs: mappedPLOs ? mappedPLOs.map(m => ({ plo: m.plo, weight: Number(m.weight) || 1 })) : [],
      passThreshold: Number(passThreshold) || 50
    });

    await clo.save();
    return res.json({ success: true, data: clo });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: `Mã chuẩn đầu ra ${code} đã tồn tại trong lớp học này` });
    }
    return next(error);
  }
}

module.exports = {
  calculateOutcomeAttainments,
  renderStudentOBEReport,
  renderClassroomOBEManagement,
  renderExamOBEConfig,
  apiSaveQuestionMappings,
  apiBulkSaveQuestionMappings,
  apiCreateCLO,
};

const Classroom = require('../../models/Classroom');
const Exam = require('../../models/Exam');
const Question = require('../../models/Question');
const ExamSubmission = require('../../models/ExamSubmission');
const ClassroomMember = require('../../models/ClassroomMember');
const { markComplete, CONTENT_TYPES } = require('../../helper/progress');
const { computeDeadline, evaluateDeadline, canStartAttempt } = require('../../services/examIntegrity.service');
const { checkItemAccess } = require('../../services/completion.service');
const { resolveSubmissionAttachment } = require('../../middleware/submissionUpload');

// Terminal statuses that already count as a consumed attempt.
const ATTEMPT_STATUSES = ['submitted', 'graded', 'late', 'auto_submitted'];

// ── Cross-classroom aggregator: all published exams across the student's
// approved enrollments, each annotated with consumed-attempt count + whether a
// fresh attempt is allowed. Audit A2: one sidebar entry instead of drilling
// into each classroom.
async function renderAllStudentExams(req, res, next) {
  try {
    const memberships = await ClassroomMember.find({ student: req.user.id, status: 'approved' })
      .populate('classroom', 'name code').lean();
    const valid = memberships.filter(m => m.classroom);
    const classroomIds = valid.map(m => m.classroom._id);

    let upcoming = [];
    let pastDue = [];
    let completed = [];

    if (classroomIds.length) {
      const exams = await Exam.find({ classroom: { $in: classroomIds }, isPublished: true })
        .populate('classroom', 'name code').sort({ createdAt: -1 }).lean();
      
      if (exams.length) {
        const inProgress = await ExamSubmission.find({
          exam: { $in: exams.map(e => e._id) }, student: req.user.id, status: 'in_progress'
        }).lean();
        const ipByExam = {};
        inProgress.forEach(s => { ipByExam[String(s.exam)] = s; });

        const terminalSubmissions = await ExamSubmission.find({
          exam: { $in: exams.map(e => e._id) }, student: req.user.id, status: { $in: ATTEMPT_STATUSES }
        }).lean();
        
        // Count terminal attempts per exam
        const attemptsByExam = {};
        const lastSubmissionByExam = {};
        terminalSubmissions.forEach(s => {
           const eId = String(s.exam);
           attemptsByExam[eId] = (attemptsByExam[eId] || 0) + 1;
           // Keep track of latest submission for display
           if (!lastSubmissionByExam[eId] || s.submittedAt > lastSubmissionByExam[eId].submittedAt) {
               lastSubmissionByExam[eId] = s;
           }
        });

        const now = new Date();
        for (const exam of exams) {
          const usedAttempts = attemptsByExam[String(exam._id)] || 0;
          const canStart = canStartAttempt(usedAttempts, exam.maxAttempts);
          const hasInProgress = Boolean(ipByExam[String(exam._id)]);
          const lastSubmission = lastSubmissionByExam[String(exam._id)] || null;
          
          const isPastDue = exam.endTime && now > new Date(exam.endTime);
          // For exams, if you can't start anymore (max attempts reached) or if time window is closed (isPastDue), it's completed.
          const isCompleted = !canStart || isPastDue;

          const enriched = Object.assign(exam, {
            usedAttempts,
            canStart,
            hasInProgress,
            mySubmission: lastSubmission,
            isPastDue,
            isExpired: isCompleted
          });

          if (isCompleted) {
            completed.push(enriched);
          } else {
            // Exams usually don't have "Past due" that you can still take late unless there's a specific logic.
            // Since isCompleted covers isPastDue for exams, pastDue will mostly be empty.
            upcoming.push(enriched);
          }
        }
      }
    }

    return res.render('student/exams/all', { title: 'Tất cả bài thi', upcoming, pastDue, completed });
  } catch (error) {
    return next(error);
  }
}

async function renderStudentExams(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ classroom: req.params.classroomId, student: req.user.id, status: 'approved' }).populate('classroom');
    if (!membership || !membership.classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    const classroom = membership.classroom;
    
    const exams = await Exam.find({ classroom: classroom.id, isPublished: true }).sort({ createdAt: -1 }).lean();
    const examIds = exams.map(e => e._id);

    const terminalSubmissions = await ExamSubmission.find({
      exam: { $in: examIds },
      student: req.user.id,
      status: { $in: ATTEMPT_STATUSES }
    }).lean();

    const takenExamIds = new Set(terminalSubmissions.map(s => String(s.exam)));

    const enrichedExams = exams.map(exam => ({
      ...exam,
      id: exam._id,
      hasTaken: takenExamIds.has(String(exam._id))
    }));

    return res.render('student/exams/index', {
      title: `${classroom.name} Exams`,
      classroom,
      exams: enrichedExams,
    });
  } catch (error) {
    return next(error);
  }
}

async function renderTakeExam(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ classroom: req.params.classroomId, student: req.user.id, status: 'approved' }).populate('classroom');
    if (!membership || !membership.classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    const classroom = membership.classroom;

    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id, isPublished: true });
    if (!exam) {
      return res.status(404).render('errors/404', { title: 'Exam not found', path: req.originalUrl });
    }

    // Requirement removed: allow taking exams even if previous items are not complete

    // Atomically enforce maxAttempts. Count consumed (terminal) attempts; if the
    // limit is reached, the student is blocked from starting another — closes
    // the prior non-atomic read-then-write race.
    const usedAttempts = await ExamSubmission.countDocuments({
      exam: exam.id,
      student: req.user.id,
      status: { $in: ATTEMPT_STATUSES },
    });
    if (!canStartAttempt(usedAttempts, exam.maxAttempts)) {
      return res.redirect(`/student/classrooms/${classroom.id}/exams/${exam.id}/result`);
    }

    // Reuse an in_progress attempt if one exists for this student (no duplicate
    // in_progress rows). Otherwise open a new attempt with the next attemptNumber
    // and a server-computed deadline (Track 8).
    let submission = await ExamSubmission.findOne({ exam: exam.id, student: req.user.id, status: 'in_progress' });
    if (!submission) {
      submission = new ExamSubmission({
        exam: exam.id,
        student: req.user.id,
        classroom: classroom.id,
        status: 'in_progress',
        startedAt: new Date(),
        attemptNumber: usedAttempts + 1,
        deadlineAt: computeDeadline(new Date(), exam.duration),
      });
      try {
        await submission.save();
      } catch (err) {
        // The unique {exam,student,attemptNumber} index backstops a concurrent
        // take request that already opened this attempt. Redirect to the result
        // view rather than surfacing a duplicate-key error to the student.
        if (err && err.code === 11000) {
          return res.redirect(`/student/classrooms/${classroom.id}/exams/${exam.id}/result`);
        }
        throw err;
      }
    }

    let questions = await Question.find({ exam: exam.id }).sort({ order: 1, createdAt: 1 });

    if (exam.shuffle) {
      // Fisher-Yates shuffle for questions
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
      // Shuffle options within multiple choice/answer questions
      questions.forEach(q => {
        if (q.options && q.options.length > 0) {
          for (let i = q.options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [q.options[i], q.options[j]] = [q.options[j], q.options[i]];
          }
        }
      });
    }

    if (exam.type === 'upload') {
      return res.render('student/exams/take_upload', {
        title: `Taking ${exam.title}`,
        classroom,
        exam,
        submission,
      });
    }

    return res.render('student/exams/take', {
      title: `Taking ${exam.title}`,
      classroom,
      exam,
      questions,
      submission,
    });
  } catch (error) {
    return next(error);
  }
}

async function submitExamHandler(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ classroom: req.params.classroomId, student: req.user.id, status: 'approved' }).populate('classroom');
    if (!membership || !membership.classroom) return res.status(404).send('Classroom not found');
    const classroom = membership.classroom;
    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id });
    if (!exam) return res.status(404).send('Not found');

    const submission = await ExamSubmission.findOne({ _id: req.body.submissionId, exam: exam.id, student: req.user.id, status: 'in_progress' });
    if (!submission) return res.status(400).send('No active submission');

    const questions = await Question.find({ exam: exam.id });
    const pointPerQuestion = questions.length > 0 ? (exam.totalPoints / questions.length) : 0;
    
    let totalScore = 0;
    const answers = [];
    let hasEssay = false;

    // Parse answers from req.body (e.g., req.body['q_' + question.id] )
    for (const q of questions) {
      const studentAnswer = req.body[`q_${q.id}`];
      let isCorrect = false;
      let pointsAchieved = 0;
      let selectedOptions = [];
      let text = '';

      if (q.type === 'multiple_choice' || q.type === 'multiple_answer') {
         if (studentAnswer) {
             const ansArray = Array.isArray(studentAnswer) ? studentAnswer : [studentAnswer];
             selectedOptions = ansArray;
             
             // Check correctness
             const correctOptionIds = q.options.filter(o => o.isCorrect).map(o => o._id.toString());
             // simple exact match
             if (correctOptionIds.length === ansArray.length && correctOptionIds.every(id => ansArray.includes(id))) {
                 isCorrect = true;
                 pointsAchieved = pointPerQuestion;
             }
         }
      } else if (q.type === 'essay') {
          text = studentAnswer || '';
          hasEssay = true;
      }

      totalScore += pointsAchieved;
      answers.push({
          question: q.id,
          selectedOptions,
          text,
          isCorrect,
          pointsAchieved
      });
    }

    const submittedAt = new Date();
    const { isLate } = evaluateDeadline(submission.deadlineAt, submittedAt);

    if (exam.type === 'upload') {
      if (req.file) {
        submission.attachment = resolveSubmissionAttachment(req.file);
      }
      submission.score = 0;
      submission.gradingStatus = 'pending_manual_grade';
    } else {
      submission.answers = answers;
      submission.score = totalScore;
      submission.gradingStatus = hasEssay ? 'pending_manual_grade' : 'auto_graded';
    }

    submission.submittedAt = submittedAt;
    submission.status = isLate ? 'late' : 'submitted';

    // Client-reported violations are intentionally NOT persisted. Proctoring
    // signals must originate from authenticated socket events on /exam-monitor,
    // where the server controls the sender identity. Accepting req.body.violations
    // let a student self-report (or drop) their own violation log — a forgery.
    // Socket-side persistence of violations is wired in index.js.

    await submission.save();

    // Write the completion ledger row (Track 1). Only objective-graded exams are
    // complete now; essay exams become complete when fully graded in
    // services/exam.service.js gradeSubmission (which re-writes this row with
    // the final score). maxScore is the exam's totalPoints snapshot.
    if (exam.type !== 'upload' && !hasEssay) {
      await markComplete({
        student: req.user.id,
        classroom: String(classroom.id),
        itemType: CONTENT_TYPES.EXAM,
        itemId: exam.id,
        evidence: { score: totalScore, maxScore: exam.totalPoints, submittedAt },
      });
    }

    return res.redirect(`/student/classrooms/${classroom.id}/exams/${exam.id}/result`);
  } catch (error) {
    return next(error);
  }
}

async function renderExamResult(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ classroom: req.params.classroomId, student: req.user.id, status: 'approved' }).populate('classroom');
    if (!membership || !membership.classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });
    const classroom = membership.classroom;
    
    const exam = await Exam.findOne({ _id: req.params.examId, classroom: classroom.id });
    if (!exam) return res.status(404).render('errors/404', { title: 'Exam not found', path: req.originalUrl });

    const submissions = await ExamSubmission.find({ exam: exam.id, student: req.user.id, status: { $in: ATTEMPT_STATUSES } }).sort({ submittedAt: -1 }).populate('answers.question');

    return res.render('student/exams/result', {
      title: `${exam.title} Result`,
      classroom,
      exam,
      submissions,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderAllStudentExams,
  renderStudentExams,
  renderTakeExam,
  submitExamHandler,
  renderExamResult
};

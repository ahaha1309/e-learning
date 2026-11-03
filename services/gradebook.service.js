const StudentProgress = require('../models/StudentProgress');
const Exam = require('../models/Exam');
const ClassroomMember = require('../models/ClassroomMember');

/**
 * Gradebook service (Redesigned C-B-A Logic).
 */

function getLetterGrade(totalScore) {
  if (totalScore == null) return { letterGrade: null, grade4: null, classification: null };
  if (totalScore >= 9.0) return { letterGrade: 'A+', grade4: 4.0, classification: 'Đạt' };
  if (totalScore >= 8.5) return { letterGrade: 'A', grade4: 3.7, classification: 'Đạt' };
  if (totalScore >= 8.0) return { letterGrade: 'B+', grade4: 3.5, classification: 'Đạt' };
  if (totalScore >= 7.0) return { letterGrade: 'B', grade4: 3.0, classification: 'Đạt' };
  if (totalScore >= 6.5) return { letterGrade: 'C+', grade4: 2.5, classification: 'Đạt' };
  if (totalScore >= 5.5) return { letterGrade: 'C', grade4: 2.0, classification: 'Đạt' };
  if (totalScore >= 5.0) return { letterGrade: 'D+', grade4: 1.5, classification: 'Đạt' };
  if (totalScore >= 4.0) return { letterGrade: 'D', grade4: 1.0, classification: 'Đạt' };
  return { letterGrade: 'F', grade4: 0, classification: 'Không đạt' };
}

async function computeGradebook(classroom, studentId) {
  const classroomId = String(classroom._id || classroom.id || classroom);
  
  if (!studentId) {
    throw new Error('studentId is required for computeGradebook');
  }

  // 1. Fetch the member to get manual grades
  const member = await ClassroomMember.findOne({ classroom: classroomId, student: studentId });
  const attendanceScore = member && member.attendanceScore != null ? member.attendanceScore : null;

  // 2. Fetch all published exams for this classroom
  const publishedExams = await Exam.find({ classroom: classroomId, isPublished: true }).lean();
  
  const midtermExamsList = publishedExams.filter(e => e.examCategory === 'MIDTERM');
  const finalExamsList = publishedExams.filter(e => e.examCategory === 'FINAL');
  const finalExamDef = finalExamsList.length > 0 ? finalExamsList[0] : null;

  // 3. Fetch student progress for exams (for B and A calculations)
  const examIds = publishedExams.map(e => e._id);
  
  // Also fetch ALL scored progress for backward compatibility with completion.service
  const allProgressRows = await StudentProgress.find({
    classroom: classroomId,
    student: studentId,
    score: { $ne: null } // must have a valid score
  }).lean();

  const progressMap = {};
  const byType = {};
  
  allProgressRows.forEach(row => {
    // Only map exams for the C/B/A logic
    if (row.itemType === 'EXAM' && examIds.some(id => String(id) === String(row.itemId))) {
      progressMap[String(row.itemId)] = row;
    }
    
    // Track counts for backward compatibility
    if (!byType[row.itemType]) {
      byType[row.itemType] = { count: 0 };
    }
    byType[row.itemType].count++;
  });

  // Calculate MIDTERM (B)
  let midtermScore = null;
  let midtermScoreSource = 'AUTO';
  const midtermExams = [];

  if (member && member.useManualMidterm) {
    midtermScore = member.manualMidtermScore;
    midtermScoreSource = 'MANUAL';
  } else {
    if (midtermExamsList.length === 0) {
      midtermScore = null; // Chưa có điểm
    } else {
      let completedAll = true;
      let sum = 0;
      for (const mExam of midtermExamsList) {
        const prog = progressMap[String(mExam._id)];
        if (!prog || prog.score == null) {
          completedAll = false;
          midtermExams.push({ exam: mExam, score: null, maxScore: mExam.totalPoints });
        } else {
          // Scale exam score to 10
          const scale10 = (prog.score / prog.maxScore) * 10;
          sum += scale10;
          midtermExams.push({ exam: mExam, score: prog.score, maxScore: prog.maxScore, scale10 });
        }
      }
      if (completedAll && midtermExamsList.length > 0) {
        midtermScore = sum / midtermExamsList.length;
        // round to 2 decimals
        midtermScore = Math.round(midtermScore * 100) / 100;
      }
    }
  }

  // Calculate FINAL (A)
  let finalScore = null;
  let finalScoreSource = 'AUTO';
  let finalExamDetail = null;

  if (member && member.useManualFinal) {
    finalScore = member.manualFinalScore;
    finalScoreSource = 'MANUAL';
  } else {
    if (!finalExamDef) {
      finalScore = null; // Chưa có điểm
    } else {
      const prog = progressMap[String(finalExamDef._id)];
      if (!prog || prog.score == null) {
        finalScore = null;
        finalExamDetail = { exam: finalExamDef, score: null, maxScore: finalExamDef.totalPoints };
      } else {
        const scale10 = (prog.score / prog.maxScore) * 10;
        finalScore = Math.round(scale10 * 100) / 100;
        finalExamDetail = { exam: finalExamDef, score: prog.score, maxScore: prog.maxScore, scale10 };
      }
    }
  }

  // Calculate Total
  let totalScore = null;
  if (attendanceScore != null && midtermScore != null && finalScore != null) {
    totalScore = 0.1 * attendanceScore + 0.3 * midtermScore + 0.6 * finalScore;
    totalScore = Math.round(totalScore * 100) / 100;
  }

  const { letterGrade, grade4, classification } = getLetterGrade(totalScore);

  // For compatibility with completion.service.js
  const overallPercent = totalScore != null ? totalScore * 10 : null;

  return {
    studentId,
    classroomId,
    attendanceScore,
    midtermScore,
    midtermScoreSource,
    midtermExams,
    midtermCount: midtermExamsList.length,
    finalScore,
    finalScoreSource,
    finalExam: finalExamDetail,
    hasFinalDef: !!finalExamDef,
    totalScore,
    letterGrade,
    grade4,
    classification,
    overallPercent,
    byType
  };
}

module.exports = {
  computeGradebook,
  getLetterGrade
};

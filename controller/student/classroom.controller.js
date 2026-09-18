const { validationResult } = require('express-validator');
const Classroom = require('../../models/Classroom');
const ClassroomMember = require('../../models/ClassroomMember');
const { computeCourseProgress } = require('../../services/courseProgress.service');
const { evaluateClassroomCompletion } = require('../../services/completion.service');
const meetingService = require('../../services/meeting.service');

function formatValidationErrors(req) {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array().map((item) => item.msg).join('. ');
}

async function renderStudentClassrooms(req, res, next) {
  try {
    const memberships = await ClassroomMember.find({ student: req.user.id }).populate('classroom').sort({ requestedAt: -1 });
    const pendingMemberships = memberships.filter((membership) => membership.status === 'pending');
    const approvedMemberships = memberships.filter((membership) => membership.status === 'approved');

    return res.render('student/classrooms/index', {
      title: 'My classrooms',
      pendingMemberships,
      approvedMemberships,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function joinClassroomHandler(req, res, next) {
  try {

    const validationMessage = formatValidationErrors(req);
    if (validationMessage) {
      const memberships = await ClassroomMember.find({ student: req.user.id }).populate('classroom').sort({ requestedAt: -1 });
      const pendingMemberships = memberships.filter((membership) => membership.status === 'pending');
      const approvedMemberships = memberships.filter((membership) => membership.status === 'approved');

      return res.status(422).render('student/classrooms/index', {
        title: 'My classrooms',
        pendingMemberships,
        approvedMemberships,
        feedback: validationMessage,
      });
    }

    const code = req.body.code.toUpperCase();
    const classroom = await Classroom.findOne({ code, isArchived: false });

    if (!classroom) {
      return res.redirect('/student/classrooms?feedback=' + encodeURIComponent('Không tìm thấy mã lớp học.'));
    }

    const existingMember = await ClassroomMember.findOne({ classroom: classroom.id, student: req.user.id });
    if (existingMember) {
      return res.redirect('/student/classrooms?feedback=' + encodeURIComponent('Bạn đã gửi yêu cầu tham gia hoặc đã ở trong lớp học này rồi.'));
    }

    const member = new ClassroomMember({
      classroom: classroom.id,
      student: req.user.id,
      status: classroom.approvalRequired ? 'pending' : 'approved',
      approvedAt: classroom.approvalRequired ? null : new Date(),
    });

    await member.save();
    return res.redirect('/student/classrooms?feedback=' + encodeURIComponent(classroom.approvalRequired ? 'Đã gửi yêu cầu tham gia lớp học.' : 'Đã tham gia lớp học thành công.'));
  } catch (error) {
    if (error.code === 11000) {
      return res.redirect('/student/classrooms?feedback=' + encodeURIComponent('Bạn đã gửi yêu cầu tham gia lớp học này rồi.'));
    }
    return next(error);
  }
}

async function renderStudentClassroomDetail(req, res, next) {
  try {
    const member = await ClassroomMember.findOne({ classroom: req.params.classroomId, student: req.user.id }).populate('classroom');

    if (!member) {
      return res.status(404).render('errors/404', {
        title: 'Classroom not found',
        path: req.originalUrl,
      });
    }

    // Syllabus progress
    const courseProgress = await computeCourseProgress(member.classroom, req.user.id);
    const courseCompletion = await evaluateClassroomCompletion(member.classroom, req.user.id);
    const io = req.app.get('io');
    const activeMeeting = await meetingService.getActiveOrUpcomingMeeting(member.classroom.id || member.classroom._id, io);

    return res.render('student/classrooms/show', {
      title: member.classroom.name,
      membership: member,
      courseProgress,
      courseCompletion,
      activeMeeting,
    });
  } catch (error) {
    return next(error);
  }
}

async function askAiAssistantHandler(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ 
      classroom: req.params.classroomId, 
      student: req.user.id, 
      status: 'approved' 
    }).populate('classroom');

    if (!membership || !membership.classroom) {
      return res.status(404).json({ error: 'Classroom not found or membership not approved' });
    }

    const classroom = membership.classroom;
    const userMessage = req.body.message?.toString().trim();
    if (!userMessage) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const Lecture = require('../../models/Lecture');
    const Assignment = require('../../models/Assignment');
    const Exam = require('../../models/Exam');

    const [lectures, assignments, exams] = await Promise.all([
      Lecture.find({ classroom: classroom.id, isPublished: true }).select('title summary').lean(),
      Assignment.find({ classroom: classroom.id, isPublished: true }).select('title description').lean(),
      Exam.find({ classroom: classroom.id, isPublished: true }).select('title description').lean()
    ]);

    const context = `
    Bạn là Trợ lý Học tập AI (AI Tutor) thân thiện dành riêng cho lớp học: "${classroom.name}".
    Mô tả lớp học: "${classroom.description || 'Chưa có mô tả'}".
    Cấp độ lớp học: ${classroom.level || 'Cơ bản'}.

    Dưới đây là nội dung giáo trình của lớp học này để bạn tham khảo khi trả lời:
    - Danh sách các Bài giảng:
      ${lectures.map(l => `- Tiêu đề: ${l.title}. Tóm tắt: ${l.summary || 'Không có'}`).join('\n')}
    - Danh sách các Bài tập về nhà:
      ${assignments.map(a => `- Tiêu đề: ${a.title}. Mô tả: ${a.description || 'Không có'}`).join('\n')}
    - Danh sách các Bài thi/kiểm tra:
      ${exams.map(e => `- Tiêu đề: ${e.title}. Mô tả: ${e.description || 'Không có'}`).join('\n')}

    Nhiệm vụ của bạn:
    1. Trả lời câu hỏi của học sinh một cách rõ ràng, ngắn gọn và hữu ích.
    2. Cố gắng hướng câu trả lời liên quan đến nội dung giáo trình của khóa học nếu có thể.
    3. Trả lời bằng tiếng Việt.
    `;

    const SystemSetting = require('../../models/SystemSetting');
    const dbSetting = await SystemSetting.findOne({ key: 'geminiApiKey' });
    const apiKey = (dbSetting ? dbSetting.value : null) || process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: context + "\n\nUser Question: " + userMessage }]
            }]
          })
        });
        const data = await response.json();
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "Không thể nhận câu trả lời từ AI lúc này.";
        return res.json({ answer });
      } catch (err) {
        console.error('Gemini API Error:', err);
        return res.status(500).json({ error: 'Failed to query AI engine.' });
      }
    } else {
      // Fallback smart mock response
      let mockAnswer = `Xin chào! Tôi là Trợ lý AI của lớp học **${classroom.name}**. Hiện tại hệ thống chưa cấu hình \`GEMINI_API_KEY\`, nên tôi đang chạy ở chế độ Demo để biểu diễn. Dưới đây là thông tin tóm tắt giáo trình lớp học của bạn:\n\n`;
      mockAnswer += `📚 **Bài giảng**: Lớp học có ${lectures.length} bài giảng hoạt động.\n`;
      mockAnswer += `📝 **Bài tập**: Có ${assignments.length} bài tập về nhà cần hoàn thành.\n`;
      mockAnswer += `✏️ **Bài thi**: Có ${exams.length} bài kiểm tra đang được mở.\n\n`;
      mockAnswer += `Bạn có thể nhập câu hỏi thử, khi Quản trị viên cấu hình API Key trong file \`.env\` hoặc mục Cài đặt hệ thống, tôi sẽ trả lời thông minh chi tiết mọi nội dung học tập!`;
      return res.json({ answer: mockAnswer });
    }
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderStudentClassrooms,
  joinClassroomHandler,
  renderStudentClassroomDetail,
  askAiAssistantHandler,
};

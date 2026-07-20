const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

const { connectDatabase } = require('../config/db');
const User = require('../models/User');
const Classroom = require('../models/Classroom');
const ClassroomMember = require('../models/ClassroomMember');
const Lecture = require('../models/Lecture');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const QuestionBank = require('../models/QuestionBank');
const ExamSubmission = require('../models/ExamSubmission');
const SystemSetting = require('../models/SystemSetting');
const DiscussionTopic = require('../models/DiscussionTopic');
const DiscussionReply = require('../models/DiscussionReply');
const Notification = require('../models/Notification');
const ChatMessage = require('../models/ChatMessage');
const { ROLES, GRADING_STATUS, SUBMISSION_STATUS } = require('../config/constants');

async function clearDatabase() {
  console.log('Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    Classroom.deleteMany({}),
    ClassroomMember.deleteMany({}),
    Lecture.deleteMany({}),
    Assignment.deleteMany({}),
    Submission.deleteMany({}),
    Exam.deleteMany({}),
    Question.deleteMany({}),
    QuestionBank.deleteMany({}),
    ExamSubmission.deleteMany({}),
    SystemSetting.deleteMany({}),
    DiscussionTopic.deleteMany({}),
    DiscussionReply.deleteMany({}),
    Notification.deleteMany({}),
    ChatMessage.deleteMany({})
  ]);
  console.log('Database cleared.');
}

function randomDate(daysAgo) {
  const now = Date.now();
  const past = now - daysAgo * 86400000;
  return new Date(past + Math.random() * (now - past));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seed() {
  try {
    await connectDatabase();
    await clearDatabase();

    const password = 'Password123!';
    const passwordHash = await bcrypt.hash(password, 12);

    // 1. Settings
    await SystemSetting.create([
      { key: 'siteName', value: 'E-Learning Việt Nam' },
      { key: 'maintenanceMode', value: false },
      { key: 'allowRegistration', value: true }
    ]);
    console.log('Settings seeded.');

    // 2. Admin
    const admin = await User.create({
      name: 'Quản Trị Viên',
      email: 'admin@elearning.vn',
      role: ROLES.ADMIN,
      status: 'active',
      passwordHash,
      lastLoginAt: new Date()
    });

    // 3. Teachers (10 teachers with Vietnamese names)
    const teacherNames = [
      'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Minh Đức', 'Hoàng Thu Hà',
      'Vũ Thị Hồng', 'Đặng Quốc Hưng', 'Bùi Thanh Hương', 'Đỗ Nhật Khanh', 'Mai Xuân Phương'
    ];
    const teachers = await User.insertMany(teacherNames.map((name, i) => ({
      name,
      email: `gvien.${i + 1}@elearning.vn`,
      role: ROLES.TEACHER,
      status: 'active',
      passwordHash,
      createdAt: randomDate(60),
      lastLoginAt: randomDate(7)
    })));
    console.log(`Created ${teachers.length} teachers.`);

    // 4. Students (30+ students)
    const studentNames = [
      'Lê Quang Hải', 'Phạm Quỳnh Anh', 'Vũ Tấn Đạt', 'Hoàng Minh Tuấn', 'Đặng Mai Phương',
      'Bùi Tuấn Anh', 'Đỗ Thùy Trang', 'Hồ Quang Hiếu', 'Ngô Thanh Vân', 'Dương Đình Tùng',
      'Trương Khánh Linh', 'Tạ Công Sơn', 'Lý Bảo Ngọc', 'Ung Đức Mạnh', 'Dương Thu Thảo',
      'La Văn Phát', 'Thái Ngọc Anh', 'Chu Thị Lan', 'Hà Minh Quân', 'Lương Phương Thảo',
      'Nông Đức Tài', 'Đinh Thị Nhung', 'Kiều Công Danh', 'Vương Mộng Cầm', 'Từ Thanh Huyền',
      'Cao Bá Hưng', 'Lâm Tuyết Nhi', 'Mạc Văn Trường', 'Ninh Thị Yến', 'Phùng Chí Công',
      'Tôn Nữ Diệu', 'Lý Thường Kiệt', 'Văn Thị Thanh', 'Hứa Minh Nhật'
    ];
    const students = await User.insertMany(studentNames.map((name, i) => ({
      name,
      email: `hocsinh.${i + 1}@elearning.vn`,
      role: ROLES.STUDENT,
      status: 'active',
      passwordHash,
      createdAt: randomDate(90),
      lastLoginAt: randomDate(14)
    })));
    console.log(`Created ${students.length} students.`);

    // 5. Classrooms (20 courses with Vietnamese names)
    const classroomData = [
      { name: 'Toán Cao Cấp A1', code: 'TOANA1', desc: 'Giải tích và đại số tuyến tính cho sinh viên năm nhất' },
      { name: 'Lập Trình Web Node.js', code: 'WEB101', desc: 'Xây dựng ứng dụng web với Node.js và Express' },
      { name: 'Vật Lý Đại Cương', code: 'PHY101', desc: 'Cơ học, nhiệt học và điện từ học cơ bản' },
      { name: 'Cơ Sở Dữ Liệu', code: 'DB101', desc: 'Thiết kế và quản trị cơ sở dữ liệu quan hệ' },
      { name: 'Cấu Trúc Dữ Liệu & Giải Thuật', code: 'DSA201', desc: 'Các cấu trúc dữ liệu và thuật toán phổ biến' },
      { name: 'Trí Tuệ Nhân Tạo', code: 'AI301', desc: 'Học máy, mạng nơ-ron và xử lý ngôn ngữ tự nhiên' },
      { name: 'An Toàn Thông Tin', code: 'SEC201', desc: 'Bảo mật mạng và an toàn thông tin doanh nghiệp' },
      { name: 'Hệ Điều Hành', code: 'OS201', desc: 'Nguyên lý hệ điều hành và quản lý tiến trình' },
      { name: 'Mạng Máy Tính', code: 'NET201', desc: 'Giao thức mạng, định tuyến và bảo mật mạng' },
      { name: 'Phân Tích Thiết Kế Hệ Thống', code: 'SE202', desc: 'Phương pháp luận phát triển phần mềm' },
      { name: 'Học Máy', code: 'ML301', desc: 'Các thuật toán học có giám sát và không giám sát' },
      { name: 'Lập Trình Python', code: 'PY101', desc: 'Nhập môn lập trình với Python' },
      { name: 'Tiếng Anh Chuyên Ngành CNTT', code: 'ENG101', desc: 'Tiếng Anh học thuật cho ngành công nghệ' },
      { name: 'Đồ Họa Máy Tính', code: 'CG301', desc: 'Xử lý ảnh và đồ họa 3D cơ bản' },
      { name: 'Công Nghệ Phần Mềm', code: 'SE301', desc: 'Quy trình phát triển phần mềm Agile' },
      { name: 'Hóa Học Đại Cương', code: 'CHEM101', desc: 'Hóa vô cơ và hữu cơ cơ bản' },
      { name: 'Kinh Tế Vi Mô', code: 'ECO101', desc: 'Nguyên lý kinh tế vi mô' },
      { name: 'Xác Suất Thống Kê', code: 'STAT201', desc: 'Xác suất và thống kê ứng dụng' },
      { name: 'Điện Tử Cơ Bản', code: 'EE101', desc: 'Mạch điện và linh kiện điện tử' },
      { name: 'Triết Học Mác-Lênin', code: 'PHIL101', desc: 'Nguyên lý cơ bản của chủ nghĩa Mác-Lênin' }
    ];

    const classrooms = [];
    for (let i = 0; i < classroomData.length; i++) {
      const cd = classroomData[i];
      const teacher = teachers[i % teachers.length];
      const c = await Classroom.create({
        name: cd.name,
        code: cd.code,
        description: cd.desc,
        teacher: teacher._id,
        createdAt: randomDate(60),
        isArchived: false
      });
      classrooms.push(c);
    }
    console.log(`Created ${classrooms.length} classrooms.`);

    // 6. Enrollments (students in classrooms)
    const memberships = [];
    for (let ci = 0; ci < classrooms.length; ci++) {
      const classroom = classrooms[ci];
      const studentCount = 5 + Math.floor(Math.random() * 12);
      const shuffled = [...students].sort(() => Math.random() - 0.5);
      for (let si = 0; si < Math.min(studentCount, shuffled.length); si++) {
        memberships.push({
          classroom: classroom._id,
          student: shuffled[si]._id,
          status: 'approved',
          requestedAt: randomDate(50),
          approvedAt: randomDate(30)
        });
      }
    }
    await ClassroomMember.insertMany(memberships);
    console.log(`Created ${memberships.length} enrollments.`);

    // 7. Lectures (40+ lectures)
    const lectures = [];
    const chapterTitles = ['Chương 1: Giới Thiệu', 'Chương 2: Kiến Thức Nền Tảng', 'Chương 3: Nâng Cao', 'Chương 4: Ứng Dụng Thực Tế'];
    for (let ci = 0; ci < classrooms.length; ci++) {
      const classroom = classrooms[ci];
      const numChapters = 2 + Math.floor(Math.random() * 3);
      for (let ch = 0; ch < numChapters; ch++) {
        const numLectures = 2 + Math.floor(Math.random() * 3);
        for (let li = 0; li < numLectures; li++) {
          lectures.push({
            classroom: classroom._id,
            teacher: classroom.teacher,
            chapterTitle: chapterTitles[ch % chapterTitles.length],
            title: `Bài ${li + 1}: ${classroom.name} - Nội dung ${li + 1}`,
            content: `<p>Nội dung bài giảng số ${li + 1} của ${classroom.name}.</p><p>Đây là nội dung chi tiết dành cho sinh viên.</p>`,
            isPublished: true,
            orderIndex: ch * 10 + li + 1,
            createdAt: randomDate(40)
          });
        }
      }
    }
    await Lecture.insertMany(lectures);
    console.log(`Created ${lectures.length} lectures.`);

    // 8. Assignments (50 assignments)
    const assignments = [];
    const assignmentTitles = [
      'Bài tập thực hành', 'Bài tập nhóm', 'Bài tập về nhà', 'Đồ án môn học',
      'Bài tập cuối chương', 'Bài tập ứng dụng', 'Thực hành lab', 'Bài kiểm tra ngắn'
    ];
    for (let ci = 0; ci < classrooms.length; ci++) {
      const classroom = classrooms[ci];
      const numAssignments = 2 + Math.floor(Math.random() * 4);
      for (let ai = 0; ai < numAssignments; ai++) {
        assignments.push({
          classroom: classroom._id,
          teacher: classroom.teacher,
          title: `${classroom.name} - ${pick(assignmentTitles)} ${ai + 1}`,
          description: `Yêu cầu: Hoàn thành bài tập và nộp trước hạn.`,
          dueDate: new Date(Date.now() + (7 + Math.floor(Math.random() * 21)) * 86400000),
          maxScore: Math.random() > 0.3 ? 10 : 100,
          totalPoints: Math.random() > 0.3 ? 10 : 100,
          isPublished: true,
          allowLateSubmission: Math.random() > 0.5,
          createdAt: randomDate(35)
        });
      }
    }
    const createdAssignments = await Assignment.insertMany(assignments);
    console.log(`Created ${createdAssignments.length} assignments.`);

    // 9. Submissions (from students)
    const submissions = [];
    for (let i = 0; i < createdAssignments.length; i++) {
      const assignment = createdAssignments[i];
      const enrolledStudents = memberships.filter(m => m.classroom.toString() === assignment.classroom.toString());
      const submittingStudents = enrolledStudents.slice(0, 2 + Math.floor(Math.random() * Math.min(enrolledStudents.length, 4)));
      for (const m of submittingStudents) {
        const isGraded = Math.random() > 0.3;
        const score = isGraded ? Math.floor(Math.random() * (assignment.totalPoints || 10)) : null;
        submissions.push({
          assignment: assignment._id,
          classroom: assignment.classroom,
          teacher: assignment.teacher,
          student: m.student,
          textAnswer: `Bài nộp của sinh viên cho ${assignment.title}`,
          status: isGraded ? 'graded' : 'submitted',
          score: score,
          teacherComment: isGraded ? 'Đã chấm bài. Cần cải thiện thêm.' : '',
          submittedAt: randomDate(10),
          gradedAt: isGraded ? randomDate(5) : null,
          createdAt: randomDate(10)
        });
      }
    }
    await Submission.insertMany(submissions);
    console.log(`Created ${submissions.length} submissions.`);

    // 10. Exams (10+ exams)
    const exams = [];
    for (let ci = 0; ci < 10; ci++) {
      const classroom = classrooms[ci % classrooms.length];
      const exam = await Exam.create({
        classroom: classroom._id,
        teacher: classroom.teacher,
        title: `Kiểm tra ${classroom.name}`,
        description: `Bài kiểm tra đánh giá kiến thức môn ${classroom.name}`,
        duration: 45 + Math.floor(Math.random() * 75),
        totalPoints: 100,
        questionCount: 10 + Math.floor(Math.random() * 20),
        isPublished: true,
        shuffle: true,
        strictMode: Math.random() > 0.5,
        maxAttempts: 1 + Math.floor(Math.random() * 3),
        maxViolations: 3,
        startTime: randomDate(20),
        endTime: new Date(Date.now() + 30 * 86400000),
        createdAt: randomDate(30)
      });
      exams.push(exam);

      // Questions for each exam
      const questions = [];
      for (let qi = 0; qi < 15; qi++) {
        const isMCQ = Math.random() > 0.3;
        questions.push({
          exam: exam._id,
          type: isMCQ ? 'multiple_choice' : 'essay',
          content: isMCQ
            ? `Câu hỏi trắc nghiệm ${qi + 1} về ${classroom.name}?`
            : `Câu hỏi tự luận ${qi + 1}: Trình bày chi tiết về nội dung liên quan đến ${classroom.name}.`,
          options: isMCQ
            ? [
                { text: 'Đáp án A', isCorrect: qi % 4 === 0 },
                { text: 'Đáp án B', isCorrect: qi % 4 === 1 },
                { text: 'Đáp án C', isCorrect: qi % 4 === 2 },
                { text: 'Đáp án D', isCorrect: qi % 4 === 3 }
              ]
            : undefined,
          points: isMCQ ? 5 : 10,
          order: qi + 1
        });
      }
      await Question.create(questions);
    }
    console.log(`Created ${exams.length} exams with questions.`);

    // 11. Exam Submissions
    const examSubmissions = [];
    for (let ei = 0; ei < exams.length; ei++) {
      const exam = exams[ei];
      const enrolled = memberships.filter(m => m.classroom.toString() === exam.classroom.toString());
      const submitters = enrolled.slice(0, 3 + Math.floor(Math.random() * Math.min(enrolled.length, 5)));
      for (const m of submitters) {
        const score = 30 + Math.floor(Math.random() * 70);
        examSubmissions.push({
          exam: exam._id,
          student: m.student,
          classroom: exam.classroom,
          status: 'submitted',
          gradingStatus: Math.random() > 0.2 ? 'fully_graded' : 'pending_manual_grade',
          score: score,
          startedAt: randomDate(15),
          submittedAt: randomDate(10)
        });
      }
    }
    if (examSubmissions.length > 0) {
      await ExamSubmission.insertMany(examSubmissions);
    }
    console.log(`Created ${examSubmissions.length} exam submissions.`);

    // 12. QuestionBank (shared question library)
    const qbEntries = [];
    for (let ti = 0; ti < teachers.length; ti++) {
      for (let qi = 0; qi < 5; qi++) {
        qbEntries.push({
          teacher: teachers[ti]._id,
          subject: pick(['Toán', 'Lý', 'Hóa', 'Tin', 'Anh']),
          chapter: `Chương ${1 + Math.floor(Math.random() * 10)}`,
          difficulty: pick(['nhan_biet', 'thong_hieu', 'van_dung']),
          tags: [pick(['cơ bản', 'nâng cao', 'ôn tập', 'kiểm tra'])],
          type: Math.random() > 0.3 ? 'multiple_choice' : 'essay',
          content: `Câu hỏi từ ngân hàng - ${pick(['Định nghĩa', 'Phân tích', 'So sánh', 'Ứng dụng'])}`,
          options: [
            { text: 'Phương án A', isCorrect: true },
            { text: 'Phương án B', isCorrect: false },
            { text: 'Phương án C', isCorrect: false },
            { text: 'Phương án D', isCorrect: false }
          ],
          points: 5 + Math.floor(Math.random() * 15)
        });
      }
    }
    await QuestionBank.insertMany(qbEntries);
    console.log(`Created ${qbEntries.length} question bank entries.`);

    // 13. Discussion Topics (100+ discussions)
    const topics = [];
    for (let ci = 0; ci < classrooms.length; ci++) {
      const classroom = classrooms[ci];
      const numTopics = 5 + Math.floor(Math.random() * 8);
      const enrolledStudents = memberships.filter(m => m.classroom.toString() === classroom._id.toString());
      for (let ti = 0; ti < numTopics; ti++) {
        const author = ti % 3 === 0
          ? classroom.teacher
          : (enrolledStudents.length > 0 ? pick(enrolledStudents).student : students[0]._id);
        topics.push({
          classroom: classroom._id,
          author: author,
          title: `Thảo luận: Vấn đề ${ti + 1} - ${pick(['Bài tập khó', 'Lý thuyết', 'Ứng dụng', 'Bài tập nhóm', 'Ôn thi'])}`,
          content: `Em có thắc mắc về nội dung bài học tuần này. Mong thầy/cô và các bạn giải đáp giúp ạ.`,
          isPinned: ti === 0,
          replyCount: Math.floor(Math.random() * 10),
          createdAt: randomDate(25)
        });
      }
    }
    const createdTopics = await DiscussionTopic.insertMany(topics);
    console.log(`Created ${createdTopics.length} discussion topics.`);

    // 14. Discussion Replies
    const replies = [];
    for (let ti = 0; ti < createdTopics.length && ti < 60; ti++) {
      const numReplies = 1 + Math.floor(Math.random() * 4);
      const topic = createdTopics[ti];
      const enrolled = memberships.filter(m => m.classroom.toString() === topic.classroom.toString());
      for (let ri = 0; ri < numReplies; ri++) {
        const author = ri % 2 === 0
          ? (enrolled.length > 0 ? pick(enrolled).student : students[0]._id)
          : topic.author;
        replies.push({
          topic: topic._id,
          author: author,
          content: `Theo em thì ${pick(['nội dung này cần xem xét thêm', 'bài giảng đã giải thích rõ', 'có thể tham khảo thêm tài liệu', 'em đồng ý với ý kiến trên'])}.`,
          createdAt: randomDate(20)
        });
      }
    }
    if (replies.length > 0) {
      await DiscussionReply.insertMany(replies);
    }
    console.log(`Created ${replies.length} discussion replies.`);

    // 15. Notifications (activity logs)
    const notificationMessages = [
      { title: 'Chào mừng', message: 'Chào mừng bạn đến với hệ thống E-Learning' },
      { title: 'Bài tập mới', message: 'Có bài tập mới cần hoàn thành' },
      { title: 'Điểm số', message: 'Điểm bài kiểm tra đã được cập nhật' },
      { title: 'Thông báo lớp', message: 'Lịch học tuần này có thay đổi' },
      { title: 'Tài liệu mới', message: 'Tài liệu học tập mới đã được đăng tải' },
      { title: 'Nhắc nhở', message: 'Bài tập sắp đến hạn nộp' },
      { title: 'Phản hồi', message: 'Giảng viên đã phản hồi câu hỏi của bạn' },
      { title: 'Hệ thống', message: 'Bảo trì hệ thống định kỳ' }
    ];
    const allUserIds = [admin._id, ...teachers.map(t => t._id), ...students.map(s => s._id)];
    const notifications = [];
    for (let i = 0; i < 60; i++) {
      const msg = pick(notificationMessages);
      notifications.push({
        recipient: pick(allUserIds),
        title: msg.title,
        message: msg.message,
        link: '#',
        isRead: Math.random() > 0.6,
        createdAt: randomDate(30)
      });
    }
    await Notification.insertMany(notifications);
    console.log(`Created ${notifications.length} notifications.`);

    // 16. Chat Messages
    const chatMessages = [];
    for (let ci = 0; ci < classrooms.length; ci++) {
      const classroom = classrooms[ci];
      const numMessages = 3 + Math.floor(Math.random() * 10);
      const enrolled = memberships.filter(m => m.classroom.toString() === classroom._id.toString());
      for (let mi = 0; mi < numMessages; mi++) {
        const sender = mi % 2 === 0
          ? classroom.teacher
          : (enrolled.length > 0 ? pick(enrolled).student : students[0]._id);
        chatMessages.push({
          classroom: classroom._id,
          sender: sender,
          content: pick([
            'Chào mọi người!',
            'Bài giảng hôm nay rất hay ạ.',
            'Cho em hỏi bài tập về nhà tuần này ạ?',
            'Cảm ơn thầy/cô!',
            'Em nộp bài rồi ạ.',
            'Khi nào có bài kiểm tra tiếp theo ạ?',
            'Mọi người đã làm bài tập chưa?',
            'Thầy ơi, em chưa hiểu phần này lắm.'
          ]),
          createdAt: randomDate(15)
        });
      }
    }
    await ChatMessage.insertMany(chatMessages);
    console.log(`Created ${chatMessages.length} chat messages.`);

    console.log('\n========================================');
    console.log('         SEED COMPLETE');
    console.log('========================================');
    console.log(`  Admin:    admin@elearning.vn / ${password}`);
    console.log(`  Teachers:  gvien.1@elearning.vn / ${password}`);
    console.log(`  Students:  hocsinh.1@elearning.vn / ${password}`);
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seed();

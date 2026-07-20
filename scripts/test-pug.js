const pug = require('pug');
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/e-learning')
  .then(async () => {
    try {
      const Classroom = require('./models/Classroom');
      const ClassroomMember = require('./models/ClassroomMember');
      const { computeCourseProgress } = require('./services/courseProgress.service');
      const { evaluateClassroomCompletion } = require('./services/completion.service');

      const classroom = await Classroom.findOne();
      if (!classroom) {
        console.log("No classroom found");
        process.exit(0);
      }
      
      const member = await ClassroomMember.findOne({ classroom: classroom._id }).populate('classroom');
      if (!member) {
        console.log("No member found");
        process.exit(0);
      }

      const courseProgress = await computeCourseProgress(classroom, member.student);
      const courseCompletion = await evaluateClassroomCompletion(classroom, member.student);

      const html = pug.renderFile(path.join(__dirname, 'views', 'student', 'classrooms', 'show.pug'), {
        title: classroom.name,
        membership: member,
        courseProgress,
        courseCompletion,
        currentUser: { role: 'student', id: member.student },
        isAuthenticated: true,
        siteName: 'EduSpace',
        csrfToken: 'test'
      });

      console.log("HTML RENDERED SUCCESSFULLY.");
      // Just print the portion around glass-panel
      const idx = html.indexOf('Tiến độ Giáo trình');
      if (idx !== -1) {
        console.log(html.substring(idx - 100, idx + 2000));
      } else {
        console.log("Not found Tiendo Giao trinh");
      }
    } catch (e) {
      console.error(e);
    }
    process.exit(0);
  });

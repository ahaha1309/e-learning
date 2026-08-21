require('dotenv').config();
const mongoose = require('mongoose');
const { computeCourseProgress } = require('./services/courseProgress.service');
const Classroom = require('./models/Classroom');
const ClassroomMember = require('./models/ClassroomMember');

mongoose.connect(process.env.MONGO_URL).then(async () => {
  try {
    const classroomId = '6a4b1505d655e981e321e8ad'; // Fixed ID
    const classroom = await Classroom.findById(classroomId);
    if (!classroom) return console.log('No classroom');
    
    const members = await ClassroomMember.find({ classroom: classroom._id, status: 'approved' });
    if (!members.length) return console.log('No members');
    
    const studentId = members[0].student;
    
    const progress = await computeCourseProgress(classroom, studentId);
    const assessments = progress.modules.find(m => m.key === 'Assessments');
    if (!assessments) {
        console.log('No assessments module');
    } else {
        assessments.children.forEach(c => {
            console.log(`[${c.status}] - ${c.itemType} - ${c.title}`);
        });
    }
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
});

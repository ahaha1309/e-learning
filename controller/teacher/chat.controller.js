const Classroom = require('../../models/Classroom');
const ChatMessage = require('../../models/ChatMessage');

async function renderChatRoom(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).render('errors/404', { title: 'Classroom not found', path: req.originalUrl });

    // Load last 50 messages
    const messages = await ChatMessage.find({ classroom: classroom.id })
      .populate('sender', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(50);
      
    // Reverse so the oldest of the 50 is first, suitable for chat UI
    messages.reverse();

    return res.render('shared/chat/room', {
      title: 'Live Chat',
      classroom,
      messages,
      currentUser: req.user,
      role: 'teacher',
      backUrl: `/teacher/classrooms/${classroom.id}`
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderChatRoom
};

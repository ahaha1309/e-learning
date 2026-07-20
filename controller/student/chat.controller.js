const ClassroomMember = require('../../models/ClassroomMember');
const ChatMessage = require('../../models/ChatMessage');

async function renderChatRoom(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ 
      classroom: req.params.classroomId, 
      student: req.user.id,
      status: 'approved'
    }).populate('classroom');
    
    if (!membership || !membership.classroom) return res.status(404).render('errors/404', { title: 'Not found', path: req.originalUrl });
    const classroom = membership.classroom;

    // Load last 50 messages
    const messages = await ChatMessage.find({ classroom: classroom.id })
      .populate('sender', 'name avatarUrl')
      .sort({ createdAt: -1 })
      .limit(50);
      
    // Reverse so the oldest of the 50 is first
    messages.reverse();

    return res.render('shared/chat/room', {
      title: 'Live Chat',
      classroom,
      messages,
      currentUser: req.user,
      role: 'student',
      backUrl: `/student/classrooms/${req.params.classroomId}`
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderChatRoom
};

const ClassroomMember = require('../../models/ClassroomMember');
const DiscussionTopic = require('../../models/DiscussionTopic');
const DiscussionReply = require('../../models/DiscussionReply');
const { sanitizeRichHtml, sanitizePlainText } = require('../../helper/sanitize');
const { sendNotification } = require('../../helper/notification.helper');

async function renderIndex(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ 
      classroom: req.params.classroomId, 
      student: req.user.id,
      status: 'approved'
    }).populate('classroom');
    
    if (!membership || !membership.classroom) return res.status(404).render('errors/404', { title: 'Not found', path: req.originalUrl });
    const classroom = membership.classroom;

    const topics = await DiscussionTopic.find({ classroom: classroom.id })
      .populate('author', 'name role avatar')
      .sort({ isPinned: -1, createdAt: -1 });

    return res.render('student/discussions/index', {
      title: 'Discussions',
      classroom,
      membership,
      topics,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function createTopic(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ 
      classroom: req.params.classroomId, 
      student: req.user.id,
      status: 'approved'
    });
    if (!membership) return res.status(404).send('Not found');

    const { title, content } = req.body;
    if (!title || !content) return res.status(400).send('Missing fields');

    const cleanTitle = sanitizePlainText(title, 255);
    const cleanContent = sanitizeRichHtml(content);

    await DiscussionTopic.create({
      classroom: membership.classroom,
      author: req.user.id,
      title: cleanTitle,
      content: cleanContent
    });

    return res.redirect(`/student/classrooms/${req.params.classroomId}/discussions`);
  } catch (error) {
    return next(error);
  }
}

async function renderShow(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ 
      classroom: req.params.classroomId, 
      student: req.user.id,
      status: 'approved'
    }).populate('classroom');
    if (!membership || !membership.classroom) return res.status(404).render('errors/404', { title: 'Not found', path: req.originalUrl });
    const classroom = membership.classroom;

    const topic = await DiscussionTopic.findOne({ _id: req.params.topicId, classroom: classroom.id })
      .populate('author', 'name role avatar');
    if (!topic) return res.status(404).render('errors/404', { title: 'Topic not found', path: req.originalUrl });

    const replies = await DiscussionReply.find({ topic: topic.id })
      .populate('author', 'name role avatar')
      .sort({ createdAt: 1 });

    return res.render('student/discussions/show', {
      title: topic.title,
      classroom,
      membership,
      topic,
      replies,
      feedback: req.query.feedback || null,
      currentUser: req.user
    });
  } catch (error) {
    return next(error);
  }
}

async function createReply(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ 
      classroom: req.params.classroomId, 
      student: req.user.id,
      status: 'approved'
    });
    if (!membership) return res.status(404).send('Not found');

    const topic = await DiscussionTopic.findOne({ _id: req.params.topicId, classroom: membership.classroom }).populate('author');
    if (!topic) return res.status(404).send('Topic not found');

    const { content } = req.body;
    if (content) {
      const cleanContent = sanitizeRichHtml(content);
      await DiscussionReply.create({
        topic: topic.id,
        author: req.user.id,
        content: cleanContent
      });

      if (topic.author && topic.author.id !== req.user.id) {
        const linkPrefix = topic.author.role === 'teacher' ? 'teacher' : 'student';
        await sendNotification(
          topic.author.id,
          'Phản hồi mới',
          `${req.user.name || 'Ai đó'} đã trả lời chủ đề thảo luận của bạn: "${topic.title}"`,
          `/${linkPrefix}/classrooms/${req.params.classroomId}/discussions/${topic.id}`
        );
      }
    }

    return res.redirect(`/student/classrooms/${req.params.classroomId}/discussions/${topic.id}`);
  } catch (error) {
    return next(error);
  }
}

async function deleteTopic(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ 
      classroom: req.params.classroomId, 
      student: req.user.id,
      status: 'approved'
    });
    if (!membership) return res.status(404).send('Not found');

    // Student can only delete their own topic
    const topic = await DiscussionTopic.findOneAndDelete({ 
      _id: req.params.topicId, 
      classroom: membership.classroom,
      author: req.user.id 
    });
    
    if (topic) {
      await DiscussionReply.deleteMany({ topic: topic.id });
      return res.redirect(`/student/classrooms/${req.params.classroomId}/discussions?feedback=Topic+Deleted`);
    } else {
      return res.status(403).send('Forbidden');
    }
  } catch (error) {
    return next(error);
  }
}

async function deleteReply(req, res, next) {
  try {
    const membership = await ClassroomMember.findOne({ 
      classroom: req.params.classroomId, 
      student: req.user.id,
      status: 'approved'
    });
    if (!membership) return res.status(404).send('Not found');

    // Student can only delete their own reply
    const reply = await DiscussionReply.findOneAndDelete({ 
      _id: req.params.replyId,
      author: req.user.id
    });
    
    if (!reply) return res.status(403).send('Forbidden');

    return res.redirect(`/student/classrooms/${req.params.classroomId}/discussions/${req.params.topicId}`);
  } catch (error) {
    return next(error);
  }
}

// ── Cross-classroom aggregator: all discussion topics across the student's
// approved enrollments, grouped by classroom. Audit A2.
async function renderAllStudentDiscussions(req, res, next) {
  try {
    const memberships = await ClassroomMember.find({ student: req.user.id, status: 'approved' })
      .populate('classroom', 'name code').lean();
    const valid = memberships.filter(m => m.classroom);
    const classroomIds = valid.map(m => m.classroom._id);

    let groups = [];
    if (classroomIds.length) {
      const topics = await DiscussionTopic.find({ classroom: { $in: classroomIds } })
        .populate('author', 'name role avatarUrl')
        .populate('classroom', 'name code')
        .sort({ isPinned: -1, createdAt: -1 }).lean();
      const byClass = {};
      topics.forEach(t => {
        if (!t.classroom) return;
        const key = String(t.classroom._id);
        if (!byClass[key]) byClass[key] = { classroom: t.classroom, items: [] };
        byClass[key].items.push(t);
      });
      groups = Object.values(byClass);
    }

    return res.render('student/discussions/all', { title: 'Tất cả thảo luận', groups });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderAllStudentDiscussions,
  renderIndex,
  createTopic,
  renderShow,
  createReply,
  deleteTopic,
  deleteReply
};


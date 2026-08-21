const Classroom = require('../../models/Classroom');
const DiscussionTopic = require('../../models/DiscussionTopic');
const DiscussionReply = require('../../models/DiscussionReply');
const { sanitizeRichHtml, sanitizePlainText } = require('../../helper/sanitize');

async function renderIndex(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).render('errors/404', { title: 'Not found', path: req.originalUrl });

    const topics = await DiscussionTopic.find({ classroom: classroom.id })
      .populate('author', 'name role avatar')
      .sort({ isPinned: -1, createdAt: -1 });

    return res.render('teacher/discussions/index', {
      title: 'Discussions',
      classroom,
      topics,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function createTopic(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).send('Not found');

    const { title, content } = req.body;
    if (!title || !content) return res.status(400).send('Missing fields');

    const cleanTitle = sanitizePlainText(title, 255);
    const cleanContent = sanitizeRichHtml(content);

    await DiscussionTopic.create({
      classroom: classroom.id,
      author: req.user.id,
      title: cleanTitle,
      content: cleanContent
    });

    return res.redirect(`/teacher/classrooms/${classroom.id}/discussions`);
  } catch (error) {
    return next(error);
  }
}

async function renderShow(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).render('errors/404', { title: 'Not found', path: req.originalUrl });

    const topic = await DiscussionTopic.findOne({ _id: req.params.topicId, classroom: classroom.id })
      .populate('author', 'name role avatar');
    if (!topic) return res.status(404).render('errors/404', { title: 'Topic not found', path: req.originalUrl });

    const replies = await DiscussionReply.find({ topic: topic.id })
      .populate('author', 'name role avatar')
      .sort({ createdAt: 1 });

    return res.render('teacher/discussions/show', {
      title: topic.title,
      classroom,
      topic,
      replies,
      feedback: req.query.feedback || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function createReply(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).send('Not found');

    const topic = await DiscussionTopic.findOne({ _id: req.params.topicId, classroom: classroom.id });
    if (!topic) return res.status(404).send('Topic not found');

    const { content } = req.body;
    if (!content) {
      return res.redirect(`/teacher/classrooms/${classroom.id}/discussions/${topic.id}?feedback=Reply+cannot+be+empty`);
    }

    const cleanContent = sanitizeRichHtml(content);

    await DiscussionReply.create({
      topic: topic.id,
      author: req.user.id,
      content: cleanContent
    });

    return res.redirect(`/teacher/classrooms/${classroom.id}/discussions/${topic.id}?feedback=Reply+added`);
  } catch (error) {
    return next(error);
  }
}

async function togglePin(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).send('Not found');

    const topic = await DiscussionTopic.findOne({ _id: req.params.topicId, classroom: classroom.id });
    if (!topic) return res.status(404).send('Topic not found');

    topic.isPinned = !topic.isPinned;
    await topic.save();

    return res.redirect(`/teacher/classrooms/${classroom.id}/discussions/${topic.id}`);
  } catch (error) {
    return next(error);
  }
}

async function deleteTopic(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).send('Not found');

    const topic = await DiscussionTopic.findOneAndDelete({ _id: req.params.topicId, classroom: classroom.id });
    if (topic) {
      await DiscussionReply.deleteMany({ topic: topic.id });
    }

    return res.redirect(`/teacher/classrooms/${classroom.id}/discussions?feedback=Topic+Deleted`);
  } catch (error) {
    return next(error);
  }
}

async function deleteReply(req, res, next) {
  try {
    const classroom = await Classroom.findOne({ _id: req.params.classroomId, teacher: req.user.id });
    if (!classroom) return res.status(404).send('Not found');

    const topic = await DiscussionTopic.findOne({ _id: req.params.topicId, classroom: classroom.id });
    if (!topic) return res.status(404).send('Topic not found');

    await DiscussionReply.findOneAndDelete({ _id: req.params.replyId, topic: topic.id });
    return res.redirect(`/teacher/classrooms/${classroom.id}/discussions/${topic.id}?feedback=Reply+deleted`);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  renderIndex,
  createTopic,
  renderShow,
  createReply,
  togglePin,
  deleteTopic,
  deleteReply
};

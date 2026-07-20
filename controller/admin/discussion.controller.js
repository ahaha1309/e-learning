const DiscussionTopic = require('../../models/DiscussionTopic');
const DiscussionReply = require('../../models/DiscussionReply');

async function listDiscussions(req, res, next) {
  try {
    const query = req.query.q;
    let filter = {};
    if (query) {
      filter.title = { $regex: query, $options: 'i' };
    }

    const topics = await DiscussionTopic.find(filter)
      .populate('author', 'name avatarUrl')
      .populate('classroom', 'name')
      .sort({ createdAt: -1 });

    return res.render('admin/discussions/index', {
      title: 'Discussions',
      topics,
      query
    });
  } catch (error) {
    return next(error);
  }
}

async function showDiscussion(req, res, next) {
  try {
    const topic = await DiscussionTopic.findById(req.params.topicId)
      .populate('author', 'name email avatarUrl role')
      .populate('classroom', 'name');

    if (!topic) {
      return res.status(404).render('admin/errors/notFound', { title: 'Discussion not found', path: req.originalUrl });
    }

    const replies = await DiscussionReply.find({ topic: topic.id })
      .populate('author', 'name email avatarUrl role')
      .sort({ createdAt: 1 });

    return res.render('admin/discussions/show', {
      title: topic.title,
      topic,
      replies,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listDiscussions, showDiscussion };

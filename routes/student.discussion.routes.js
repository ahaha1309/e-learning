const express = require('express');
const discussionController = require('../controller/student/discussion.controller');

const router = express.Router({ mergeParams: true });

router.get('/', discussionController.renderIndex);
router.post('/', discussionController.createTopic);
router.get('/:topicId', discussionController.renderShow);
router.post('/:topicId/replies', discussionController.createReply);
router.post('/:topicId/delete', discussionController.deleteTopic);
router.post('/:topicId/replies/:replyId/delete', discussionController.deleteReply);

module.exports = router;

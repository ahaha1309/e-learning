const express = require('express');
const discussionController = require('../controller/teacher/discussion.controller');
const { classroomIdRules } = require('../validate/teacher/classroom.validate');

const router = express.Router({ mergeParams: true });

router.get('/', classroomIdRules, discussionController.renderIndex);
router.post('/', classroomIdRules, discussionController.createTopic);
router.get('/:topicId', classroomIdRules, discussionController.renderShow);
router.post('/:topicId/replies', classroomIdRules, discussionController.createReply);
router.post('/:topicId/pin', classroomIdRules, discussionController.togglePin);
router.post('/:topicId/delete', classroomIdRules, discussionController.deleteTopic);
router.post('/:topicId/replies/:replyId/delete', classroomIdRules, discussionController.deleteReply);

module.exports = router;

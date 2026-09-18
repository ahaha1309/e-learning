const express = require('express');
const { requireAuth } = require('../middleware/rbac');
const {
  renderTeamsChatHub,
  getConversationsApi,
  getDirectMessagesApi,
  getClassroomMessagesApi,
  searchContactsApi,
  uploadChatFileApi,
  sendMessageApi,
  markAsReadApi,
} = require('../controller/chat.controller');

const router = express.Router();

router.get('/chat', requireAuth, renderTeamsChatHub);
router.get('/api/chat/conversations', requireAuth, getConversationsApi);
router.get('/api/chat/messages/user/:targetUserId', requireAuth, getDirectMessagesApi);
router.get('/api/chat/messages/classroom/:classroomId', requireAuth, getClassroomMessagesApi);
router.get('/api/chat/search-users', requireAuth, searchContactsApi);
router.post('/api/chat/upload', requireAuth, uploadChatFileApi);
router.post('/api/chat/send', requireAuth, sendMessageApi);
router.post('/api/chat/read/:targetUserId', requireAuth, markAsReadApi);

module.exports = router;

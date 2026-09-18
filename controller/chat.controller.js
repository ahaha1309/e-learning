const chatService = require('../services/chat.service');
const ChatMessage = require('../models/ChatMessage');
const { uploadChatFile, resolveChatFileAttachment } = require('../middleware/chatUpload');

async function renderTeamsChatHub(req, res, next) {
  try {
    const conversations = await chatService.getRecentConversations(req.user.id);
    const targetUserId = req.query.user || null;
    const targetClassroomId = req.query.classroom || null;

    return res.render('chat/index', {
      title: 'Trò chuyện - Microsoft Teams Style',
      currentUser: req.user,
      conversations,
      targetUserId,
      targetClassroomId,
    });
  } catch (error) {
    return next(error);
  }
}

async function getConversationsApi(req, res, next) {
  try {
    const conversations = await chatService.getRecentConversations(req.user.id);
    return res.json({ conversations });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getDirectMessagesApi(req, res, next) {
  try {
    const { targetUserId } = req.params;
    await chatService.markDirectMessagesAsRead(req.user.id, targetUserId);
    const messages = await chatService.getDirectMessages(req.user.id, targetUserId);
    return res.json({ messages });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function markAsReadApi(req, res, next) {
  try {
    const { targetUserId } = req.params;
    await chatService.markDirectMessagesAsRead(req.user.id, targetUserId);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getClassroomMessagesApi(req, res, next) {
  try {
    const { classroomId } = req.params;
    const messages = await ChatMessage.find({ classroom: classroomId })
      .populate('sender', 'name email role avatarUrl')
      .sort({ createdAt: -1 })
      .limit(50);

    messages.reverse();
    return res.json({ messages });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function searchContactsApi(req, res, next) {
  try {
    const query = req.query.q || '';
    const users = await chatService.searchUsersForChat(query, req.user.id);
    return res.json({ users });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

function uploadChatFileApi(req, res, next) {
  uploadChatFile(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const attachment = resolveChatFileAttachment(req.file);
    return res.json({ success: true, ...attachment });
  });
}

async function sendMessageApi(req, res, next) {
  try {
    const { type, targetId, content, fileUrl, fileName, fileType, fileSize } = req.body;
    const cleanContent = String(content || '').trim();

    if ((!cleanContent && !fileUrl) || !type || !targetId) {
      return res.status(400).json({ error: 'Missing required message parameters' });
    }

    if (type === 'direct') {
      const dm = await chatService.saveDirectMessage({
        senderId: req.user.id,
        recipientId: targetId,
        content: cleanContent,
        fileUrl,
        fileName,
        fileType,
        fileSize,
      });

      const io = req.app.get('io');
      if (io) {
        io.of('/chat').to(`user:${targetId}`).to(`user:${req.user.id}`).emit('receive_direct_message', dm);
      }

      return res.json({ success: true, message: dm });
    } else {
      const msg = await ChatMessage.create({
        classroom: targetId,
        sender: req.user.id,
        content: cleanContent,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileType: fileType || null,
        fileSize: fileSize || 0,
      });

      await msg.populate('sender', 'name email role avatarUrl');

      const io = req.app.get('io');
      if (io) {
        io.of('/chat').to(targetId).emit('receive_message', {
          id: msg._id,
          classroomId: targetId,
          content: msg.content,
          fileUrl: msg.fileUrl,
          fileName: msg.fileName,
          fileType: msg.fileType,
          fileSize: msg.fileSize,
          sender: msg.sender,
          createdAt: msg.createdAt,
        });
      }

      return res.json({ success: true, message: msg });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  renderTeamsChatHub,
  getConversationsApi,
  getDirectMessagesApi,
  getClassroomMessagesApi,
  searchContactsApi,
  uploadChatFileApi,
  sendMessageApi,
  markAsReadApi,
};

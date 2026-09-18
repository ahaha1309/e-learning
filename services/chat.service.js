const mongoose = require('mongoose');
const DirectMessage = require('../models/DirectMessage');
const ChatMessage = require('../models/ChatMessage');
const Classroom = require('../models/Classroom');
const ClassroomMember = require('../models/ClassroomMember');
const User = require('../models/User');

/**
 * Gets recent 1:1 conversations and class group chats for a user.
 */
async function getRecentConversations(userId) {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // 1. Get all 1:1 DM partners & latest message
  const dmMessages = await DirectMessage.aggregate([
    {
      $match: {
        $or: [{ sender: userObjectId }, { recipient: userObjectId }],
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: ['$sender', userObjectId] },
            '$recipient',
            '$sender',
          ],
        },
        lastMessage: { $first: '$$ROOT' },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$recipient', userObjectId] },
                  { $eq: ['$isRead', false] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  // Populate partner users
  const directConversations = await Promise.all(
    dmMessages.map(async (item) => {
      const partner = await User.findById(item._id).select('name email role avatarUrl');
      if (!partner) return null;

      let msgSnippet = item.lastMessage.content || '';
      if (!msgSnippet && item.lastMessage.fileUrl) {
        msgSnippet = item.lastMessage.fileName ? `📎 [Tệp] ${item.lastMessage.fileName}` : '📎 [Tệp đính kèm]';
      }

      return {
        id: `dm_${partner._id}`,
        type: 'direct',
        targetUser: partner,
        lastMessage: msgSnippet,
        lastMessageTime: item.lastMessage.createdAt,
        unreadCount: item.unreadCount,
      };
    })
  );

  const validDirectConvs = directConversations
    .filter(Boolean)
    .sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

  return validDirectConvs;
}

/**
 * Gets 1:1 direct message history between two users
 */
async function getDirectMessages(userId, targetUserId) {
  const messages = await DirectMessage.find({
    $or: [
      { sender: userId, recipient: targetUserId },
      { sender: targetUserId, recipient: userId },
    ],
  })
    .populate('sender', 'name email role avatarUrl')
    .populate('recipient', 'name email role avatarUrl')
    .sort({ createdAt: 1 });

  return messages;
}

/**
 * Marks messages from senderId to userId as read
 */
async function markDirectMessagesAsRead(userId, senderId) {
  await DirectMessage.updateMany(
    { sender: senderId, recipient: userId, isRead: false },
    { $set: { isRead: true } }
  );
}

/**
 * Searches users for starting a new chat
 */
async function searchUsersForChat(query, currentUserId) {
  if (!query || !query.trim()) return [];

  const regex = new RegExp(query.trim(), 'i');
  const users = await User.find({
    _id: { $ne: currentUserId },
    $or: [{ name: regex }, { email: regex }],
  })
    .select('name email role avatarUrl')
    .limit(20);

  return users;
}

/**
 * Saves a new direct message
 */
async function saveDirectMessage({
  senderId,
  recipientId,
  classroomId = null,
  content = '',
  fileUrl = null,
  fileName = null,
  fileType = null,
  fileSize = 0,
}) {
  const cleanContent = String(content || '').trim();
  if (!cleanContent && !fileUrl) {
    throw new Error('Message content or file attachment is required');
  }

  const dm = new DirectMessage({
    sender: senderId,
    recipient: recipientId,
    classroom: classroomId || null,
    content: cleanContent,
    fileUrl: fileUrl || null,
    fileName: fileName || null,
    fileType: fileType || null,
    fileSize: fileSize || 0,
    isRead: false,
  });

  await dm.save();
  await dm.populate('sender', 'name email role avatarUrl');
  await dm.populate('recipient', 'name email role avatarUrl');

  return dm;
}

module.exports = {
  getRecentConversations,
  getDirectMessages,
  markDirectMessagesAsRead,
  searchUsersForChat,
  saveDirectMessage,
};

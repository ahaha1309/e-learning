document.addEventListener('DOMContentLoaded', () => {
  const conversationsList = document.getElementById('conversations-list');
  const chatMessagesFeed = document.getElementById('teams-chat-messages');
  const chatInputBar = document.getElementById('chat-input-bar');
  const chatForm = document.getElementById('teams-chat-form');
  const chatInput = document.getElementById('teams-chat-input');
  const chatHeaderName = document.getElementById('chat-header-name');
  const chatHeaderSub = document.getElementById('chat-header-sub');
  const chatHeaderAvatar = document.getElementById('chat-header-avatar');

  const btnAttachFile = document.getElementById('btn-attach-file');
  const chatFileInput = document.getElementById('chat-file-input');
  const attachmentPreviewBar = document.getElementById('attachment-preview-bar');
  const attachmentName = document.getElementById('attachment-name');
  const attachmentSize = document.getElementById('attachment-size');
  const btnRemoveAttachment = document.getElementById('btn-remove-attachment');

  const newChatModal = document.getElementById('new-chat-modal');
  const newChatSearchInput = document.getElementById('new-chat-search-input');
  const newChatResults = document.getElementById('new-chat-results');

  const currentUserId = chatMessagesFeed ? chatMessagesFeed.dataset.currentUserId : null;
  const currentUserAvatar = chatMessagesFeed ? (chatMessagesFeed.dataset.currentUserAvatar || '') : '';
  const csrfToken = chatMessagesFeed ? chatMessagesFeed.dataset.csrfToken : '';

  let activeConv = null; // { type: 'direct', targetId, name, role, avatarUrl }
  let selectedFile = null;

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Socket.IO setup
  const socket = io('/chat', {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    auth: {
      userId: currentUserId,
    },
  });

  socket.on('connect', () => {
    if (currentUserId) {
      socket.emit('join_user_dm_room');
    }
  });

  // Handle incoming 1:1 Direct Messages
  socket.on('receive_direct_message', async (dm) => {
    const senderId = dm.sender ? (dm.sender._id || dm.sender.id || dm.sender) : null;
    const recipientId = dm.recipient ? (dm.recipient._id || dm.recipient.id || dm.recipient) : null;

    const isCurrentActive =
      activeConv &&
      activeConv.type === 'direct' &&
      (String(senderId) === String(activeConv.targetId) || String(recipientId) === String(activeConv.targetId) || String(senderId) === String(currentUserId));

    if (isCurrentActive) {
      const isMine = currentUserId ? String(senderId) === String(currentUserId) : false;
      const avatarUrl = dm.sender ? (dm.sender.avatarUrl || null) : null;

      appendMessageBubble({
        id: dm._id || dm.id,
        senderName: isMine ? 'Bạn' : (dm.sender ? dm.sender.name : 'Người dùng'),
        senderAvatar: avatarUrl,
        content: dm.content,
        fileUrl: dm.fileUrl,
        fileName: dm.fileName,
        fileType: dm.fileType,
        fileSize: dm.fileSize,
        time: dm.createdAt,
        isMine,
      });

      // Mark as read immediately on active conversation
      if (!isMine) {
        try {
          await fetch(`/api/chat/read/${activeConv.targetId}`, {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrfToken },
          });
        } catch (e) {}
      }
    }

    await refreshConversationsList();
  });

  function bindConvItems() {
    document.querySelectorAll('.conv-item').forEach((item) => {
      item.addEventListener('click', () => {
        const type = item.dataset.type || 'direct';
        const targetId = item.dataset.targetUserId;
        const name = item.dataset.targetUserName;
        const role = item.dataset.targetUserRole || '';
        const avatarUrl = item.dataset.targetUserAvatar || '';

        openConversation({ type, targetId, name, role, avatarUrl });
      });
    });
  }

  bindConvItems();

  async function openConversation({ type, targetId, name, role, avatarUrl }) {
    if (!targetId) return;

    activeConv = { type, targetId, name, role, avatarUrl };

    document.querySelectorAll('.conv-item').forEach((item) => {
      const itemTargetId = item.dataset.targetUserId;
      if (String(itemTargetId) === String(targetId)) {
        item.classList.add('bg-primary/10', 'border-l-4', 'border-primary');
        const badge = item.querySelector('.badge-danger');
        if (badge) badge.remove();
      } else {
        item.classList.remove('bg-primary/10', 'border-l-4', 'border-primary');
      }
    });

    if (type === 'direct') {
      try {
        fetch(`/api/chat/read/${targetId}`, {
          method: 'POST',
          headers: { 'X-CSRF-Token': csrfToken },
        });
      } catch (e) {}
    }

    if (chatHeaderName) chatHeaderName.textContent = name;
    if (chatHeaderSub) {
      chatHeaderSub.textContent = `${role === 'teacher' ? 'Giáo viên' : 'Học sinh'} • 🟢 Trực tuyến`;
    }
    if (chatHeaderAvatar) {
      if (avatarUrl) {
        chatHeaderAvatar.innerHTML = `<img src="${avatarUrl}" class="w-10 h-10 rounded-full object-cover border border-border" alt="${name}">`;
      } else {
        chatHeaderAvatar.innerHTML = (name || 'C').charAt(0).toUpperCase();
      }
    }

    if (chatInputBar) chatInputBar.classList.remove('hidden');

    chatMessagesFeed.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-8 space-y-2">
        <i class="ph-bold ph-spinner animate-spin text-3xl text-primary"></i>
        <p class="text-xs font-bold">Đang tải tin nhắn...</p>
      </div>`;

    try {
      const res = await fetch(`/api/chat/messages/user/${targetId}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      renderMessagesFeed(data.messages || [], type);
      refreshConversationsList();
    } catch (err) {
      console.error('Error loading messages:', err);
      chatMessagesFeed.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-8 space-y-2">
          <i class="ph-bold ph-warning text-3xl text-destructive"></i>
          <p class="text-sm font-bold text-foreground">Không thể tải tin nhắn</p>
          <button type="button" onclick="window.location.reload()" class="btn-outline px-4 py-1.5 rounded-full text-xs font-bold mt-2">Thử lại</button>
        </div>`;
    }
  }

  function renderMessagesFeed(messages, type) {
    chatMessagesFeed.innerHTML = '';

    if (!messages || messages.length === 0) {
      chatMessagesFeed.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-8 space-y-2">
          <i class="ph-bold ph-hand-waving text-3xl text-primary animate-bounce"></i>
          <p class="text-sm font-bold text-foreground">Hãy gửi lời chào đầu tiên!</p>
          <p class="text-xs">Bắt đầu trò chuyện với <strong>${activeConv.name}</strong>.</p>
        </div>`;
      return;
    }

    messages.forEach((msg) => {
      const senderId = msg.sender ? (msg.sender._id || msg.sender.id || msg.sender) : null;
      const isMine = currentUserId ? String(senderId) === String(currentUserId) : false;
      const avatarUrl = msg.sender ? (msg.sender.avatarUrl || null) : null;

      appendMessageBubble({
        id: msg._id || msg.id,
        senderName: isMine ? 'Bạn' : (msg.sender ? msg.sender.name : 'Người dùng'),
        senderAvatar: avatarUrl,
        content: msg.content,
        fileUrl: msg.fileUrl,
        fileName: msg.fileName,
        fileType: msg.fileType,
        fileSize: msg.fileSize,
        time: msg.createdAt,
        isMine,
      });
    });

    chatMessagesFeed.scrollTop = chatMessagesFeed.scrollHeight;
  }

  function appendMessageBubble({ id, senderName, senderAvatar, content, fileUrl, fileName, fileType, fileSize, time, isMine }) {
    if (id && document.getElementById(`msg-${id}`)) {
      return;
    }

    const bubble = document.createElement('div');
    if (id) bubble.id = `msg-${id}`;
    bubble.className = `flex gap-3 max-w-[80%] ${isMine ? 'ml-auto flex-row-reverse' : ''}`;

    const avatarToUse = isMine ? (currentUserAvatar || senderAvatar) : senderAvatar;

    const avatarHtml = avatarToUse
      ? `<img src="${avatarToUse}" class="w-9 h-9 rounded-full object-cover border border-border flex-shrink-0" alt="${senderName}">`
      : `<div class="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold flex items-center justify-center text-xs flex-shrink-0">${(senderName || 'U').charAt(0).toUpperCase()}</div>`;

    const timeStr = time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    let attachmentHtml = '';
    if (fileUrl) {
      if (fileType === 'image' || (/\.(jpg|jpeg|png|webp|gif)$/i).test(fileUrl)) {
        attachmentHtml = `
          <div class="mt-2 overflow-hidden rounded-xl border border-border shadow-sm max-w-xs">
            <a href="${fileUrl}" target="_blank" title="Xem ảnh">
              <img src="${fileUrl}" class="w-full h-auto object-cover hover:opacity-95 transition-opacity" alt="${fileName || 'Image'}">
            </a>
          </div>`;
      } else {
        const fileIcon = fileType === 'pdf' ? 'ph-file-pdf text-rose-500' : 'ph-file-text text-primary';
        attachmentHtml = `
          <a href="${fileUrl}" download="${fileName || 'file'}" target="_blank" class="mt-2 flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:bg-muted/50 transition-colors shadow-sm text-foreground">
            <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">
              <i class="ph-bold ${fileIcon}"></i>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-bold truncate">${fileName || 'Tệp đính kèm'}</p>
              <p class="text-[10px] text-muted-foreground font-mono">${formatBytes(fileSize)}</p>
            </div>
            <i class="ph-bold ph-download-simple text-base text-primary"></i>
          </a>`;
      }
    }

    const textContentHtml = content
      ? `<p class="margin-0 leading-relaxed">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      : '';

    bubble.innerHTML = `
      ${avatarHtml}
      <div class="space-y-1 min-w-0">
        <div class="flex items-center gap-2 text-xs text-muted-foreground ${isMine ? 'justify-end' : ''}">
          <span class="font-bold text-foreground">${senderName}</span>
          <span class="text-[10px] font-mono">${timeStr}</span>
        </div>
        <div class="p-3.5 rounded-2xl text-sm font-medium shadow-sm ${
          isMine ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-card border border-border text-foreground rounded-tl-none'
        }">
          ${textContentHtml}
          ${attachmentHtml}
        </div>
      </div>`;

    chatMessagesFeed.appendChild(bubble);
    chatMessagesFeed.scrollTop = chatMessagesFeed.scrollHeight;
  }

  // File Input Attachment Handling
  if (btnAttachFile && chatFileInput) {
    btnAttachFile.addEventListener('click', () => {
      chatFileInput.click();
    });

    chatFileInput.addEventListener('change', () => {
      if (chatFileInput.files && chatFileInput.files[0]) {
        selectedFile = chatFileInput.files[0];
        if (attachmentName) attachmentName.textContent = selectedFile.name;
        if (attachmentSize) attachmentSize.textContent = `(${formatBytes(selectedFile.size)})`;
        if (attachmentPreviewBar) attachmentPreviewBar.classList.remove('hidden');
      }
    });
  }

  if (btnRemoveAttachment) {
    btnRemoveAttachment.addEventListener('click', () => {
      selectedFile = null;
      if (chatFileInput) chatFileInput.value = '';
      if (attachmentPreviewBar) attachmentPreviewBar.classList.add('hidden');
    });
  }

  // Handle Form Submit with File Upload Support
  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = chatInput.value.trim();
      if (!content && !selectedFile) return;
      if (!activeConv) return;

      chatInput.value = '';

      let fileData = { fileUrl: null, fileName: null, fileType: null, fileSize: 0 };

      if (selectedFile) {
        try {
          const formData = new FormData();
          formData.append('file', selectedFile);

          selectedFile = null;
          if (chatFileInput) chatFileInput.value = '';
          if (attachmentPreviewBar) attachmentPreviewBar.classList.add('hidden');

          const uploadRes = await fetch('/api/chat/upload', {
            method: 'POST',
            headers: {
              'X-CSRF-Token': csrfToken,
            },
            body: formData,
          });

          if (!uploadRes.ok) throw new Error('File upload failed');
          const uploadResult = await uploadRes.json();
          if (uploadResult.success) {
            fileData = {
              fileUrl: uploadResult.fileUrl,
              fileName: uploadResult.fileName,
              fileType: uploadResult.fileType,
              fileSize: uploadResult.fileSize,
            };
          }
        } catch (uploadErr) {
          console.error('File upload error:', uploadErr);
          alert('Không thể tải tệp lên. Vui lòng thử lại!');
          return;
        }
      }

      const payload = {
        type: 'direct',
        targetId: activeConv.targetId,
        content,
        ...fileData,
      };

      if (socket && socket.connected) {
        socket.emit('send_direct_message', {
          recipientId: activeConv.targetId,
          content,
          ...fileData,
        });
      } else {
        try {
          await fetch('/api/chat/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify(payload),
          });
        } catch (err) {
          console.error('HTTP Send error:', err);
        }
      }

      // Mark conversation as read on sending message (replying)
      try {
        await fetch(`/api/chat/read/${activeConv.targetId}`, {
          method: 'POST',
          headers: { 'X-CSRF-Token': csrfToken },
        });
      } catch (e) {}
    });
  }

  // Emoji buttons quick insert
  document.querySelectorAll('.emoji-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (chatInput) {
        chatInput.value += btn.dataset.emoji;
        chatInput.focus();
      }
    });
  });

  // New Chat Search Modal
  let searchTimeout = null;
  if (newChatSearchInput && newChatResults) {
    newChatSearchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = newChatSearchInput.value.trim();
      if (!q) {
        newChatResults.innerHTML = '<p class="text-xs text-center text-muted-foreground py-6">Nhập từ khóa để tìm kiếm người dùng.</p>';
        return;
      }

      searchTimeout = setTimeout(async () => {
        try {
          const res = await fetch(`/api/chat/search-users?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          renderSearchResults(data.users || []);
        } catch (err) {
          console.error('Error searching users:', err);
        }
      }, 300);
    });
  }

  function renderSearchResults(users) {
    if (!users || users.length === 0) {
      newChatResults.innerHTML = '<p class="text-xs text-center text-muted-foreground py-6">Không tìm thấy người dùng phù hợp.</p>';
      return;
    }

    newChatResults.innerHTML = '';
    users.forEach((user) => {
      const item = document.createElement('div');
      item.className = 'p-3 flex items-center justify-between cursor-pointer hover:bg-muted/50 rounded-xl transition-colors';

      const avatarHtml = user.avatarUrl
        ? `<img src="${user.avatarUrl}" class="w-10 h-10 rounded-full object-cover border border-border flex-shrink-0">`
        : `<div class="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold flex items-center justify-center flex-shrink-0">${(user.name || 'U').charAt(0).toUpperCase()}</div>`;

      item.innerHTML = `
        <div class="flex items-center gap-3">
          ${avatarHtml}
          <div>
            <p class="text-sm font-bold text-foreground">${user.name}</p>
            <p class="text-xs text-muted-foreground font-mono">${user.email}</p>
          </div>
        </div>
        <span class="badge-primary text-[10px] font-bold uppercase px-2 py-0.5">${user.role === 'teacher' ? 'Giảng viên' : 'Học sinh'}</span>`;

      item.addEventListener('click', () => {
        if (newChatModal) newChatModal.classList.add('hidden');
        openConversation({
          type: 'direct',
          targetId: user._id,
          name: user.name,
          role: user.role,
          avatarUrl: user.avatarUrl || '',
        });
      });

      newChatResults.appendChild(item);
    });
  }

  function renderConversationsSidebar(conversations) {
    if (!conversationsList) return;

    let totalUnread = 0;
    if (!conversations || conversations.length === 0) {
      conversationsList.innerHTML = `
        <div class="p-8 text-center text-muted-foreground space-y-2">
          <i class="ph-bold ph-chats-teardrop text-4xl opacity-40"></i>
          <p class="text-xs font-medium">Chưa có cuộc trò chuyện nào. Hãy bấm "Chat mới" để bắt đầu!</p>
        </div>`;
    } else {
      conversationsList.innerHTML = '';
      conversations.forEach((conv) => {
        totalUnread += Number(conv.unreadCount || 0);

        const item = document.createElement('div');
        item.className = 'conv-item p-4 flex items-center gap-3 cursor-pointer transition-colors hover:bg-muted/50';

        const targetUserId = conv.targetUser ? (conv.targetUser._id || conv.targetUser.id) : '';
        const targetUserName = conv.targetUser ? conv.targetUser.name : 'Người dùng';
        const targetUserRole = conv.targetUser ? conv.targetUser.role : '';
        const targetUserAvatar = conv.targetUser ? (conv.targetUser.avatarUrl || '') : '';

        item.dataset.id = conv.id;
        item.dataset.type = 'direct';
        item.dataset.targetUserId = targetUserId;
        item.dataset.targetUserName = targetUserName;
        item.dataset.targetUserRole = targetUserRole;
        item.dataset.targetUserAvatar = targetUserAvatar;

        const activeTargetId = activeConv ? activeConv.targetId : null;
        const isSelected = activeTargetId && String(targetUserId) === String(activeTargetId);

        if (isSelected) {
          item.classList.add('bg-primary/10', 'border-l-4', 'border-primary');
        }

        const avatarLetter = (targetUserName || 'U').charAt(0).toUpperCase();

        const timeStr = (conv.lastMessageTime && conv.lastMessageTime !== '1970-01-01T00:00:00.000Z')
          ? new Date(conv.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '';

        const avatarHtml = targetUserAvatar
          ? `<div class="relative flex-shrink-0">
               <img src="${targetUserAvatar}" class="w-12 h-12 rounded-full object-cover border border-border" alt="${targetUserName}">
               <span class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-background"></span>
             </div>`
          : `<div class="relative flex-shrink-0">
               <div class="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 text-primary font-extrabold flex items-center justify-center text-lg">${avatarLetter}</div>
               <span class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-background"></span>
             </div>`;

        const unreadBadgeHtml = conv.unreadCount > 0
          ? `<span class="badge badge-danger badge-sm font-black">${conv.unreadCount}</span>`
          : '';

        item.innerHTML = `
          ${avatarHtml}
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between mb-1">
              <h3 class="text-sm font-bold text-foreground truncate">${targetUserName}</h3>
              <span class="font-mono text-muted-foreground text-[10px]">${timeStr}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs text-muted-foreground truncate font-medium">${conv.lastMessage || 'Chưa có tin nhắn'}</p>
              ${unreadBadgeHtml}
            </div>
          </div>`;

        item.addEventListener('click', () => {
          openConversation({
            type: 'direct',
            targetId: targetUserId,
            name: targetUserName,
            role: targetUserRole,
            avatarUrl: targetUserAvatar,
          });
        });

        conversationsList.appendChild(item);
      });
    }

    // Update global sidebar chat badge
    const globalChatBadge = document.querySelector('.sidebar-chat-badge');
    if (globalChatBadge) {
      globalChatBadge.textContent = totalUnread;
      if (totalUnread > 0) {
        globalChatBadge.classList.remove('hidden');
      } else {
        globalChatBadge.classList.add('hidden');
      }
    }
  }

  async function refreshConversationsList() {
    try {
      const res = await fetch('/api/chat/conversations');
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.conversations) {
        renderConversationsSidebar(data.conversations);
      }
    } catch (err) {
      console.error('Error refreshing conversations:', err);
    }
  }

  // Auto-open first conversation on load if present
  const firstConvItem = document.querySelector('.conv-item');
  if (firstConvItem) {
    firstConvItem.click();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const configEl = document.getElementById('meeting-room-config');
  if (!configEl) return;

  const meetingId = configEl.dataset.meetingId;
  const classroomId = configEl.dataset.classroomId;
  const currentUserId = configEl.dataset.userId;
  const currentUserName = configEl.dataset.userName;
  const currentUserRole = configEl.dataset.userRole;

  let localStream = null;
  let screenStream = null;
  let isMicMuted = true;
  let isCamOff = true;
  let isScreenSharing = false;
  let isHandRaised = false;
  let unreadChatCount = 0;

  const peerConnections = {}; // socketId -> RTCPeerConnection
  const peersInfo = {}; // socketId -> { userId, userName, userRole, audioActive, videoActive, raisedHand }

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  };

  // Lobby elements
  const lobbyOverlay = document.getElementById('teams-prejoin-lobby');
  const lobbyVideoPreview = document.getElementById('lobby-video-preview');
  const lobbyAvatarPreview = document.getElementById('lobby-avatar-preview');
  const lobbyMicBtn = document.getElementById('lobby-toggle-mic-btn');
  const lobbyCamBtn = document.getElementById('lobby-toggle-cam-btn');
  const lobbyMicText = document.getElementById('lobby-mic-text');
  const lobbyCamText = document.getElementById('lobby-cam-text');
  const lobbyJoinBtn = document.getElementById('lobby-join-now-btn');
  const studentWaitingOverlay = document.getElementById('student-waiting-overlay');
  const waitingApprovalSection = document.getElementById('waiting-approval-section');
  const waitingApprovalCount = document.getElementById('waiting-approval-count');
  const waitingApprovalList = document.getElementById('waiting-approval-list');

  // Mode layouts
  const normalGalleryGrid = document.getElementById('normal-gallery-grid');
  const presentationStageLayout = document.getElementById('presentation-stage-layout');
  const stageVideoStream = document.getElementById('stage-video-stream');
  const stageSharerName = document.getElementById('stage-sharer-name');
  const stageRemotePeersSidebar = document.getElementById('stage-remote-peers-sidebar');
  const stageNoPeersMsg = document.getElementById('stage-no-peers-msg');
  const stageSidebarPeerCount = document.getElementById('stage-sidebar-peer-count');
  const toastNotificationArea = document.getElementById('toast-notification-area');

  // Local Video elements
  const localVideo = document.getElementById('local-video');
  const localAvatar = document.getElementById('local-avatar');
  const localNameBadge = document.getElementById('local-name-badge');
  const localHandBadge = document.getElementById('local-hand-badge');

  const stageLocalVideo = document.getElementById('stage-local-video');
  const stageLocalAvatar = document.getElementById('stage-local-avatar');
  const stageLocalMicIcon = document.getElementById('stage-local-mic-icon');
  const stageLocalHandBadge = document.getElementById('stage-local-hand-badge');

  // Control Buttons
  const micBtn = document.getElementById('toggle-mic-btn');
  const camBtn = document.getElementById('toggle-cam-btn');
  const screenBtn = document.getElementById('toggle-screen-btn');
  const raiseHandBtn = document.getElementById('toggle-raise-hand-btn');
  const reactionsBtn = document.getElementById('toggle-reactions-btn');
  const reactionsPopover = document.getElementById('reactions-popover');
  const floatingReactionsContainer = document.getElementById('floating-reactions-container');

  const chatToggleBtn = document.getElementById('toggle-chat-btn');
  const unreadChatBadge = document.getElementById('unread-chat-badge');
  const participantsToggleBtn = document.getElementById('toggle-participants-btn');
  const leaveBtn = document.getElementById('leave-meeting-btn');
  const muteAllBtn = document.getElementById('mute-all-btn');

  const chatPanel = document.getElementById('meeting-chat-panel');
  const chatForm = document.getElementById('meeting-chat-form');
  const chatInput = document.getElementById('meeting-chat-input');
  const chatMessages = document.getElementById('meeting-chat-messages');

  const participantsPanel = document.getElementById('meeting-participants-panel');
  const participantsList = document.getElementById('meeting-participants-list');
  const participantCountBadge = document.getElementById('participant-count-badge');

  if (localNameBadge) localNameBadge.textContent = currentUserName + ' (Bạn)';

  // Initialize camera & mic for Lobby & Meeting Room (Default OFF)
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (localVideo) localVideo.srcObject = localStream;
    if (stageLocalVideo) stageLocalVideo.srcObject = localStream;
    if (lobbyVideoPreview) lobbyVideoPreview.srcObject = localStream;

    localStream.getAudioTracks().forEach((t) => (t.enabled = false));
    localStream.getVideoTracks().forEach((t) => (t.enabled = false));
  } catch (err) {
    console.warn('Could not access camera/microphone:', err);
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (localVideo) localVideo.srcObject = localStream;
      if (stageLocalVideo) stageLocalVideo.srcObject = localStream;
      if (lobbyVideoPreview) lobbyVideoPreview.srcObject = localStream;
      localStream.getAudioTracks().forEach((t) => (t.enabled = false));
    } catch (err2) {
      console.warn('No media devices available:', err2);
      localStream = new MediaStream();
    }
  }

  updateCamStateUI();
  updateMicStateUI();

  // Lobby Controls
  if (lobbyMicBtn) {
    lobbyMicBtn.addEventListener('click', () => {
      isMicMuted = !isMicMuted;
      localStream.getAudioTracks().forEach((t) => (t.enabled = !isMicMuted));
      updateMicStateUI();
    });
  }

  if (lobbyCamBtn) {
    lobbyCamBtn.addEventListener('click', () => {
      isCamOff = !isCamOff;
      localStream.getVideoTracks().forEach((t) => (t.enabled = !isCamOff));
      updateCamStateUI();
    });
  }

  // Socket Connection setup
  let socket = null;

  function connectToMeetingSocket() {
    if (socket) return;
    socket = io('/meeting', {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    socket.on('connect', () => {
      socket.emit('join-room', {
        meetingId,
        classroomId,
        userId: currentUserId,
        userName: currentUserName,
        userRole: currentUserRole,
        audioActive: !isMicMuted,
        videoActive: !isCamOff,
      });
    });

    socket.on('user_joined', async ({ socketId, user }) => {
      if (!user || (user.userId && String(user.userId) === String(currentUserId))) {
        return;
      }

      if (user.userId) {
        Object.keys(peersInfo).forEach((oldSId) => {
          if (peersInfo[oldSId] && String(peersInfo[oldSId].userId) === String(user.userId)) {
            if (peerConnections[oldSId]) {
              peerConnections[oldSId].close();
              delete peerConnections[oldSId];
            }
            delete peersInfo[oldSId];
            removeRemoteVideoTile(oldSId);
          }
        });
      }

      peersInfo[socketId] = user;
      updateParticipantsUI();

      const pc = createPeerConnection(socketId);
      peerConnections[socketId] = pc;

      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      // If I am screen sharing, add screen share track to this new connection!
      if (isScreenSharing && screenStream) {
        const screenTrack = screenStream.getVideoTracks()[0];
        if (screenTrack) {
          const sender = pc.addTrack(screenTrack, screenStream);
          pc.screenTrackSender = sender;
        }
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc_offer', { targetSocketId: socketId, offer });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    });

    socket.on('webrtc_offer', async ({ senderSocketId, offer, senderUser }) => {
      if (senderUser && senderUser.userId && String(senderUser.userId) === String(currentUserId)) {
        return;
      }

      console.log('[WebRTC Debug] Received webrtc_offer from', senderSocketId);

      if (senderUser) {
        peersInfo[senderSocketId] = senderUser;
        updateParticipantsUI();
      }

      let pc = peerConnections[senderSocketId];
      if (!pc) {
        console.log('[WebRTC Debug] Creating new peer connection for offer from', senderSocketId);
        pc = createPeerConnection(senderSocketId);
        peerConnections[senderSocketId] = pc;

        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

        // If I am screen sharing, add screen share track to this new connection!
        if (isScreenSharing && screenStream) {
          const screenTrack = screenStream.getVideoTracks()[0];
          if (screenTrack) {
            const sender = pc.addTrack(screenTrack, screenStream);
            pc.screenTrackSender = sender;
          }
        }
      } else {
        console.log('[WebRTC Debug] Reusing existing peer connection for offer from', senderSocketId);
      }

      try {
        console.log('[WebRTC Debug] signalingState before setRemoteDescription:', pc.signalingState);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc_answer', { targetSocketId: senderSocketId, answer });
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    });

    socket.on('webrtc_answer', async ({ senderSocketId, answer }) => {
      console.log('[WebRTC Debug] Received webrtc_answer from', senderSocketId);
      const pc = peerConnections[senderSocketId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('Error setting remote answer:', err);
        }
      }
    });

    socket.on('ice_candidate', async ({ senderSocketId, candidate }) => {
      const pc = peerConnections[senderSocketId];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    });

    socket.on('user_left', ({ socketId }) => {
      if (peerConnections[socketId]) {
        peerConnections[socketId].close();
        delete peerConnections[socketId];
      }
      delete peersInfo[socketId];
      removeRemoteVideoTile(socketId);
      updateParticipantsUI();
    });

    socket.on('room_users', (usersList) => {
      usersList.forEach(({ socketId, user }) => {
        if (socketId !== socket.id && user && String(user.userId) !== String(currentUserId)) {
          Object.keys(peersInfo).forEach((oldSId) => {
            if (peersInfo[oldSId] && String(peersInfo[oldSId].userId) === String(user.userId)) {
              if (peerConnections[oldSId]) {
                peerConnections[oldSId].close();
                delete peerConnections[oldSId];
              }
              delete peersInfo[oldSId];
              removeRemoteVideoTile(oldSId);
            }
          });
          peersInfo[socketId] = user;

          // If this user is currently sharing screen, enable Presentation Mode
          if (user.isSharingScreen) {
            enablePresentationMode(null, user.userName, socketId);
          }
        }
      });
      updateParticipantsUI();
    });

    socket.on('user_media_state', ({ socketId, audioActive, videoActive }) => {
      if (peersInfo[socketId]) {
        peersInfo[socketId].audioActive = audioActive;
        peersInfo[socketId].videoActive = videoActive;
        updateRemoteMediaUI(socketId, audioActive, videoActive);
        updateParticipantsUI();
      }
    });

    socket.on('user_raise_hand', ({ socketId, userName, raisedHand }) => {
      if (peersInfo[socketId]) {
        peersInfo[socketId].raisedHand = raisedHand;
        updateRemoteHandUI(socketId, raisedHand);
        updateParticipantsUI();
      }
    });

    socket.on('room_reaction', ({ socketId, userName, emoji }) => {
      showFloatingReaction(emoji);
    });

    socket.on('force_mute_mic', () => {
      if (currentUserRole !== 'teacher' && !isMicMuted) {
        isMicMuted = true;
        localStream.getAudioTracks().forEach((t) => (t.enabled = false));
        updateMicStateUI();
        socket.emit('toggle_media', { audioActive: false, videoActive: !isCamOff });
      }
    });

    socket.on('room_message', (msg) => {
      appendChatMessage(msg);
      if (chatPanel && chatPanel.classList.contains('hidden')) {
        unreadChatCount++;
        if (unreadChatBadge) {
          unreadChatBadge.textContent = unreadChatCount;
          unreadChatBadge.classList.remove('hidden');
        }
      }
    });

    socket.on('user_screen_share', ({ socketId, userName, isSharing, streamId }) => {
      if (peersInfo[socketId]) {
        peersInfo[socketId].isSharingScreen = !!isSharing;
        peersInfo[socketId].screenStreamId = isSharing ? streamId : null;
      }
      if (isSharing) {
        let stream = null;
        const pc = peerConnections[socketId];
        if (pc && pc.remoteStreams && streamId) {
          stream = pc.remoteStreams[streamId];
        }
        enablePresentationMode(stream, userName, socketId);
      } else {
        disablePresentationMode();
      }
    });

    socket.on('waiting_for_approval', () => {
      if (studentWaitingOverlay) {
        studentWaitingOverlay.classList.remove('hidden');
      }

      // Attach cancel button handler (after socket is ready)
      const cancelWaitingBtn = document.getElementById('cancel-waiting-btn');
      if (cancelWaitingBtn) {
        cancelWaitingBtn.addEventListener('click', () => {
          // Disconnect socket first so server can clean up waiting room
          if (localStream) localStream.getTracks().forEach((t) => t.stop());
          if (socket) socket.disconnect();
          const redirectUrl = currentUserRole === 'teacher'
            ? `/teacher/classrooms/${classroomId}`
            : `/student/classrooms/${classroomId}`;
          window.location.href = redirectUrl;
        });
      }
    });

    socket.on('join_approved', () => {
      if (studentWaitingOverlay) {
        studentWaitingOverlay.classList.add('hidden');
      }
      if (lobbyOverlay) lobbyOverlay.classList.add('hidden');
    });

    socket.on('join_declined', () => {
      alert('Yêu cầu tham gia cuộc họp của bạn đã bị Giảng viên từ chối.');
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
      if (socket) socket.disconnect();
      const redirectUrl = currentUserRole === 'teacher' ? `/teacher/classrooms/${classroomId}` : `/student/classrooms/${classroomId}`;
      window.location.href = redirectUrl;
    });

    socket.on('waiting_students_list', (waitingList) => {
      if (currentUserRole === 'teacher') {
        // Remove toasts for students who are no longer waiting
        if (toastNotificationArea) {
          const currentToasts = toastNotificationArea.querySelectorAll('[id^="toast-waiting-"]');
          const activeSocketIds = new Set((waitingList || []).map(({ socketId }) => socketId));
          currentToasts.forEach((toast) => {
            const toastSocketId = toast.id.replace('toast-waiting-', '');
            if (!activeSocketIds.has(toastSocketId)) {
              toast.remove();
            }
          });
        }

        if (waitingList && waitingList.length > 0) {
          waitingList.forEach(({ socketId, user }) => {
            showWaitingStudentToast(socketId, user ? user.userName : 'Học sinh');
          });

          if (waitingApprovalSection && waitingApprovalList) {
            waitingApprovalSection.classList.remove('hidden');
            if (waitingApprovalCount) waitingApprovalCount.textContent = waitingList.length;

            waitingApprovalList.innerHTML = '';
            waitingList.forEach(({ socketId, user }) => {
              const item = document.createElement('div');
              item.className = 'flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800';
              item.innerHTML = `
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 rounded-full bg-amber-500/20 text-amber-300 font-bold flex items-center justify-center text-xs">
                    ${(user.userName || 'S').charAt(0).toUpperCase()}
                  </div>
                  <span class="text-xs font-bold text-slate-200">${user.userName}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <button class="approve-btn px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow" data-socket-id="${socketId}">
                    Duyệt ✓
                  </button>
                  <button class="decline-btn px-2 py-1 rounded-lg bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white text-[11px] font-bold" data-socket-id="${socketId}">
                    Từ chối
                  </button>
                </div>`;
              waitingApprovalList.appendChild(item);
            });

            waitingApprovalList.querySelectorAll('.approve-btn').forEach((btn) => {
              btn.addEventListener('click', () => {
                const targetSocketId = btn.dataset.socketId;
                if (socket && targetSocketId) {
                  socket.emit('approve_student_join', { targetSocketId });
                  removeWaitingStudentToast(targetSocketId);
                }
              });
            });

            waitingApprovalList.querySelectorAll('.decline-btn').forEach((btn) => {
              btn.addEventListener('click', () => {
                const targetSocketId = btn.dataset.socketId;
                if (socket && targetSocketId) {
                  socket.emit('decline_student_join', { targetSocketId });
                  removeWaitingStudentToast(targetSocketId);
                }
              });
            });
          }
        } else {
          if (waitingApprovalSection) waitingApprovalSection.classList.add('hidden');
        }
      }
    });

  function showWaitingStudentToast(socketId, userName) {
    if (!toastNotificationArea) return;
    const toastId = `toast-waiting-${socketId}`;
    if (document.getElementById(toastId)) return;

    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className =
      'bg-slate-900 border border-amber-500/50 text-white font-bold px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-4 pointer-events-auto animate-in slide-in-from-top-4 duration-300 min-w-[280px] z-50';
    toast.innerHTML = `
      <div class="flex items-center gap-2.5">
        <span class="text-lg">⏳</span>
        <div class="text-xs">
          <span class="font-black text-amber-400">${userName}</span> xin vào họp
        </div>
      </div>
      <div class="flex items-center gap-1.5">
        <button class="toast-approve-btn px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow">
          Duyệt ✓
        </button>
        <button class="toast-decline-btn px-2 py-1 rounded-lg bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-bold">
          Từ chối
        </button>
      </div>`;
    toastNotificationArea.appendChild(toast);

    toast.querySelector('.toast-approve-btn').addEventListener('click', () => {
      if (socket) socket.emit('approve_student_join', { targetSocketId: socketId });
      toast.remove();
    });

    toast.querySelector('.toast-decline-btn').addEventListener('click', () => {
      if (socket) socket.emit('decline_student_join', { targetSocketId: socketId });
      toast.remove();
    });
  }

  function removeWaitingStudentToast(socketId) {
    const toast = document.getElementById(`toast-waiting-${socketId}`);
    if (toast) toast.remove();
  }

    socket.on('meeting_ended_automatically', (data) => {
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
      if (socket) socket.disconnect();
      const redirectUrl = currentUserRole === 'teacher' ? `/teacher/classrooms/${classroomId}` : `/student/classrooms/${classroomId}`;
      window.location.href = redirectUrl;
    });

    socket.on('meeting_ended_by_teacher', (data) => {
      alert(data.message || 'Cuộc họp đã được Giáo viên kết thúc.');
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
      if (socket) socket.disconnect();
      const redirectUrl = currentUserRole === 'teacher' ? `/teacher/classrooms/${classroomId}` : `/student/classrooms/${classroomId}`;
      window.location.href = redirectUrl;
    });
  }

  // Join Button in Lobby
  if (lobbyJoinBtn) {
    lobbyJoinBtn.addEventListener('click', () => {
      if (currentUserRole === 'teacher') {
        if (lobbyOverlay) {
          lobbyOverlay.classList.add('animate-out', 'fade-out', 'zoom-out-95');
          setTimeout(() => lobbyOverlay.remove(), 250);
        }
      }
      connectToMeetingSocket();
    });
  }

  function createPeerConnection(targetSocketId) {
    const pc = new RTCPeerConnection(iceServers);

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice_candidate', { targetSocketId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      let stream = event.streams[0];
      if (!stream) {
        stream = new MediaStream([event.track]);
      }

      console.log('[WebRTC Debug] ontrack received track kind:', event.track.kind, 'stream ID:', stream.id);

      if (!pc.remoteStreams) pc.remoteStreams = {};
      pc.remoteStreams[stream.id] = stream;

      const user = peersInfo[targetSocketId];
      if (user) {
        console.log('[WebRTC Debug] User info for peer:', user.userName, 'screenStreamId:', user.screenStreamId);
      } else {
        console.log('[WebRTC Debug] No user info found for targetSocketId:', targetSocketId);
      }

      const isScreenShareStream = (user && user.screenStreamId && stream.id === user.screenStreamId);
      console.log('[WebRTC Debug] isScreenShareStream:', isScreenShareStream);

      if (isScreenShareStream) {
        if (stageVideoStream) {
          console.log('[WebRTC Debug] Setting screen share stream to stageVideoStream');
          stageVideoStream.srcObject = stream;
        }
      } else {
        console.log('[WebRTC Debug] Adding camera stream to remote video tile');
        addOrUpdateRemoteVideoTile(targetSocketId, stream);
      }
    };

    return pc;
  }

  // Dual-mode switching functions
  let activeScreenSharerSocketId = null;

  function enablePresentationMode(stream, sharerName, socketId = null) {
    activeScreenSharerSocketId = socketId;
    if (normalGalleryGrid) normalGalleryGrid.classList.add('hidden');
    if (presentationStageLayout) {
      presentationStageLayout.classList.remove('hidden');
      presentationStageLayout.classList.add('flex');
    }
    if (stageVideoStream && stream) {
      stageVideoStream.srcObject = stream;
    }
    if (stageSharerName && sharerName) {
      stageSharerName.textContent = `Màn hình của ${sharerName}`;
    }
  }

  function disablePresentationMode() {
    activeScreenSharerSocketId = null;
    if (presentationStageLayout) {
      presentationStageLayout.classList.add('hidden');
      presentationStageLayout.classList.remove('flex');
    }
    if (normalGalleryGrid) normalGalleryGrid.classList.remove('hidden');
    if (stageVideoStream) stageVideoStream.srcObject = null;
  }

  function addOrUpdateRemoteVideoTile(socketId, stream) {
    const user = peersInfo[socketId] || { userName: 'Thành viên' };

    // 1. Tile in Normal Gallery Grid
    let tile = document.getElementById(`peer-tile-${socketId}`);
    if (!tile) {
      tile = document.createElement('div');
      tile.id = `peer-tile-${socketId}`;
      tile.className =
        'relative bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-xl group min-h-[240px]';
      tile.innerHTML = `
        <video id="peer-video-${socketId}" autoplay playsinline class="w-full h-full object-cover"></video>
        <div id="peer-avatar-${socketId}" class="flex flex-col items-center justify-center gap-3">
          <div class="w-24 h-24 rounded-full bg-[#5B5FC7]/20 border-2 border-[#5B5FC7]/40 text-[#7B83EB] flex items-center justify-center font-black text-3xl">
            ${(user.userName || 'U').charAt(0).toUpperCase()}
          </div>
          <p class="text-sm font-bold text-slate-200">${user.userName}</p>
        </div>
        <div class="absolute bottom-4 left-4 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold text-white border border-white/10 bg-black/70 flex items-center gap-2">
          <span>${user.userName}</span>
          <i id="peer-mic-icon-${socketId}" class="ph-bold ph-microphone-slash text-destructive text-sm"></i>
          <span id="peer-hand-badge-${socketId}" class="hidden text-base">✋</span>
        </div>`;
      if (normalGalleryGrid) normalGalleryGrid.appendChild(tile);
    }
    const videoEl = document.getElementById(`peer-video-${socketId}`);
    if (videoEl && stream) videoEl.srcObject = stream;

    // 2. Tile in Stage Sidebar
    let stageTile = document.getElementById(`stage-peer-tile-${socketId}`);
    if (!stageTile) {
      if (stageNoPeersMsg) stageNoPeersMsg.classList.add('hidden');
      stageTile = document.createElement('div');
      stageTile.id = `stage-peer-tile-${socketId}`;
      stageTile.className =
        'relative bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 h-36 w-full flex items-center justify-center shadow-lg group flex-shrink-0';
      stageTile.innerHTML = `
        <video id="stage-peer-video-${socketId}" autoplay playsinline class="w-full h-full object-cover"></video>
        <div id="stage-peer-avatar-${socketId}" class="flex flex-col items-center justify-center gap-1.5 h-full">
          <div class="w-12 h-12 rounded-full bg-[#5B5FC7]/20 border border-[#5B5FC7]/40 text-[#7B83EB] flex items-center justify-center font-black text-base">
            ${(user.userName || 'U').charAt(0).toUpperCase()}
          </div>
          <p class="text-xs font-bold text-slate-300 truncate max-w-[120px]">${user.userName}</p>
        </div>
        <div class="absolute bottom-2 left-2 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold text-white border border-white/10 bg-black/70 flex items-center gap-1.5">
          <span class="truncate max-w-[100px]">${user.userName}</span>
          <i id="stage-peer-mic-icon-${socketId}" class="ph-bold ph-microphone-slash text-destructive text-xs"></i>
          <span id="stage-peer-hand-badge-${socketId}" class="hidden text-xs">✋</span>
        </div>`;
      if (stageRemotePeersSidebar) stageRemotePeersSidebar.appendChild(stageTile);
    }
    const stageVideoEl = document.getElementById(`stage-peer-video-${socketId}`);
    if (stageVideoEl && stream) stageVideoEl.srcObject = stream;

    updateRemoteMediaUI(socketId, user.audioActive !== false, user.videoActive !== false);
    updateRemoteHandUI(socketId, user.raisedHand === true);
  }

  function removeRemoteVideoTile(socketId) {
    const tile = document.getElementById(`peer-tile-${socketId}`);
    if (tile) tile.remove();

    const stageTile = document.getElementById(`stage-peer-tile-${socketId}`);
    if (stageTile) stageTile.remove();

    const remainingTiles = stageRemotePeersSidebar ? stageRemotePeersSidebar.querySelectorAll('[id^="stage-peer-tile-"]').length : 0;
    if (remainingTiles === 0 && stageNoPeersMsg) {
      stageNoPeersMsg.classList.remove('hidden');
    }
  }

  function updateRemoteMediaUI(socketId, audioActive, videoActive) {
    const videoEl = document.getElementById(`peer-video-${socketId}`);
    const avatarEl = document.getElementById(`peer-avatar-${socketId}`);
    const micIcon = document.getElementById(`peer-mic-icon-${socketId}`);

    const stageVideoEl = document.getElementById(`stage-peer-video-${socketId}`);
    const stageAvatarEl = document.getElementById(`stage-peer-avatar-${socketId}`);
    const stageMicIcon = document.getElementById(`stage-peer-mic-icon-${socketId}`);

    if (videoEl && avatarEl) {
      if (videoActive) {
        videoEl.classList.remove('hidden');
        avatarEl.classList.add('hidden');
      } else {
        videoEl.classList.add('hidden');
        avatarEl.classList.remove('hidden');
      }
    }

    if (stageVideoEl && stageAvatarEl) {
      if (videoActive) {
        stageVideoEl.classList.remove('hidden');
        stageAvatarEl.classList.add('hidden');
      } else {
        stageVideoEl.classList.add('hidden');
        stageAvatarEl.classList.remove('hidden');
      }
    }

    if (micIcon) {
      micIcon.className = audioActive
        ? 'ph-bold ph-microphone text-[#7B83EB] text-sm'
        : 'ph-bold ph-microphone-slash text-destructive text-sm';
    }

    if (stageMicIcon) {
      stageMicIcon.className = audioActive
        ? 'ph-bold ph-microphone text-[#7B83EB] text-xs'
        : 'ph-bold ph-microphone-slash text-destructive text-xs';
    }
  }

  function updateRemoteHandUI(socketId, raisedHand) {
    const handBadge = document.getElementById(`peer-hand-badge-${socketId}`);
    const stageHandBadge = document.getElementById(`stage-peer-hand-badge-${socketId}`);

    if (handBadge) {
      if (raisedHand) handBadge.classList.remove('hidden');
      else handBadge.classList.add('hidden');
    }

    if (stageHandBadge) {
      if (raisedHand) stageHandBadge.classList.remove('hidden');
      else stageHandBadge.classList.add('hidden');
    }
  }



  // Local Controls
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      isMicMuted = !isMicMuted;
      localStream.getAudioTracks().forEach((track) => (track.enabled = !isMicMuted));
      updateMicStateUI();
      if (socket) socket.emit('toggle_media', { audioActive: !isMicMuted, videoActive: !isCamOff });
    });
  }

  if (camBtn) {
    camBtn.addEventListener('click', () => {
      isCamOff = !isCamOff;
      localStream.getVideoTracks().forEach((track) => (track.enabled = !isCamOff));
      updateCamStateUI();
      if (socket) socket.emit('toggle_media', { audioActive: !isMicMuted, videoActive: !isCamOff });
    });
  }

  if (screenBtn) {
    screenBtn.addEventListener('click', async () => {
      if (!isScreenSharing) {
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              cursor: 'always',
            },
            audio: false,
          });
          const screenTrack = screenStream.getVideoTracks()[0];
          console.log('[WebRTC Debug] Screen share stream obtained. ID:', screenStream.id);

          Object.entries(peerConnections).forEach(async ([socketId, pc]) => {
            try {
              console.log('[WebRTC Debug] Adding screen track to peer:', socketId);
              const sender = pc.addTrack(screenTrack, screenStream);
              pc.screenTrackSender = sender;
              
              // Renegotiate
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              socket.emit('webrtc_offer', { targetSocketId: socketId, offer });
            } catch (err) {
              console.error('Error adding screen track to peer:', socketId, err);
            }
          });

          // Enable Presentation Mode for self sharer
          enablePresentationMode(screenStream, currentUserName + ' (Bạn)', 'local');

          if (socket) {
            socket.emit('screen_share_status', { isSharing: true, streamId: screenStream.id });
          }

          screenTrack.onended = () => {
            stopScreenShare();
          };

          isScreenSharing = true;
          screenBtn.classList.add('bg-[#5B5FC7]', 'text-white');
          screenBtn.classList.remove('bg-slate-800');
        } catch (err) {
          console.error('Error starting screen share:', err);
        }
      } else {
        stopScreenShare();
      }
    });
  }

  function stopScreenShare() {
    console.log('[WebRTC Debug] Stopping screen share...');
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      screenStream = null;
    }

    Object.entries(peerConnections).forEach(async ([socketId, pc]) => {
      if (pc.screenTrackSender) {
        try {
          console.log('[WebRTC Debug] Removing screen track from peer:', socketId);
          pc.removeTrack(pc.screenTrackSender);
        } catch (err) {
          console.warn('Error removing screen track:', err);
        }
        delete pc.screenTrackSender;
      }
      // Renegotiate after removing track
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('webrtc_offer', { targetSocketId: socketId, offer });
      } catch (err) {
        console.error('Error renegotiating after stopping screen share for peer:', socketId, err);
      }
    });

    disablePresentationMode();

    if (socket) {
      socket.emit('screen_share_status', { isSharing: false });
    }

    isScreenSharing = false;
    screenBtn.classList.remove('bg-[#5B5FC7]', 'text-white');
    screenBtn.classList.add('bg-slate-800');
  }

  // Raise Hand button in bottom bar
  if (raiseHandBtn) {
    raiseHandBtn.addEventListener('click', () => {
      isHandRaised = !isHandRaised;
      if (isHandRaised) {
        raiseHandBtn.classList.add('bg-amber-500', 'text-slate-950');
        raiseHandBtn.classList.remove('bg-amber-500/20', 'text-amber-300');
        if (localHandBadge) localHandBadge.classList.remove('hidden');
        if (stageLocalHandBadge) stageLocalHandBadge.classList.remove('hidden');
      } else {
        raiseHandBtn.classList.remove('bg-amber-500', 'text-slate-950');
        raiseHandBtn.classList.add('bg-amber-500/20', 'text-amber-300');
        if (localHandBadge) localHandBadge.classList.add('hidden');
        if (stageLocalHandBadge) stageLocalHandBadge.classList.add('hidden');
      }
      if (socket) socket.emit('toggle_raise_hand', { raisedHand: isHandRaised });
      updateParticipantsUI();
    });
  }

  // Reactions Popover & Buttons
  if (reactionsBtn && reactionsPopover) {
    reactionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      reactionsPopover.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!reactionsPopover.contains(e.target) && e.target !== reactionsBtn) {
        reactionsPopover.classList.add('hidden');
      }
    });
  }

  document.querySelectorAll('.reaction-emoji-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji;
      if (emoji && socket) {
        socket.emit('send_reaction', { emoji });
        showFloatingReaction(emoji);
      }
      if (reactionsPopover) reactionsPopover.classList.add('hidden');
    });
  });

  function showFloatingReaction(emoji) {
    if (!floatingReactionsContainer) return;
    const el = document.createElement('div');
    el.className = 'absolute bottom-10 right-10 text-4xl animate-bounce pointer-events-none transition-all duration-1000';
    el.style.transform = `translate(${(Math.random() - 0.5) * 80}px, 0)`;
    el.textContent = emoji;

    floatingReactionsContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform += ' translateY(-120px) scale(1.5)';
    }, 50);

    setTimeout(() => el.remove(), 1000);
  }

  // Teacher Mute All
  if (muteAllBtn) {
    muteAllBtn.addEventListener('click', () => {
      if (confirm('Tắt Micro của tất cả học sinh trong cuộc họp?')) {
        if (socket) socket.emit('mute_all_participants');
      }
    });
  }

  function updateMicStateUI() {
    const localMicIcon = document.getElementById('local-mic-icon');
    if (isMicMuted) {
      if (micBtn) {
        micBtn.classList.add('bg-destructive', 'text-white');
        micBtn.classList.remove('bg-slate-800');
        micBtn.querySelector('i').className = 'ph-bold ph-microphone-slash text-lg';
      }
      if (lobbyMicBtn) {
        lobbyMicBtn.classList.add('bg-destructive', 'text-white');
        lobbyMicBtn.classList.remove('bg-slate-800');
        lobbyMicBtn.querySelector('i').className = 'ph-bold ph-microphone-slash text-lg';
      }
      if (lobbyMicText) lobbyMicText.textContent = 'Đã tắt Micro';
      if (localMicIcon) localMicIcon.className = 'ph-bold ph-microphone-slash text-destructive text-sm';
      if (stageLocalMicIcon) stageLocalMicIcon.className = 'ph-bold ph-microphone-slash text-destructive text-xs';
    } else {
      if (micBtn) {
        micBtn.classList.remove('bg-destructive', 'text-white');
        micBtn.classList.add('bg-slate-800');
        micBtn.querySelector('i').className = 'ph-bold ph-microphone text-lg';
      }
      if (lobbyMicBtn) {
        lobbyMicBtn.classList.remove('bg-destructive', 'text-white');
        lobbyMicBtn.classList.add('bg-slate-800');
        lobbyMicBtn.querySelector('i').className = 'ph-bold ph-microphone text-lg';
      }
      if (lobbyMicText) lobbyMicText.textContent = 'Mở Micro';
      if (localMicIcon) localMicIcon.className = 'ph-bold ph-microphone text-[#7B83EB] text-sm';
      if (stageLocalMicIcon) stageLocalMicIcon.className = 'ph-bold ph-microphone text-[#7B83EB] text-xs';
    }
    updateParticipantsUI();
  }

  function updateCamStateUI() {
    if (isCamOff) {
      if (camBtn) {
        camBtn.classList.add('bg-destructive', 'text-white');
        camBtn.classList.remove('bg-slate-800');
        camBtn.querySelector('i').className = 'ph-bold ph-video-camera-slash text-lg';
      }
      if (lobbyCamBtn) {
        lobbyCamBtn.classList.add('bg-destructive', 'text-white');
        lobbyCamBtn.classList.remove('bg-slate-800');
        lobbyCamBtn.querySelector('i').className = 'ph-bold ph-video-camera-slash text-lg';
      }
      if (lobbyCamText) lobbyCamText.textContent = 'Đã tắt Camera';

      if (localVideo) localVideo.classList.add('hidden');
      if (localAvatar) localAvatar.classList.remove('hidden');

      if (stageLocalVideo) stageLocalVideo.classList.add('hidden');
      if (stageLocalAvatar) stageLocalAvatar.classList.remove('hidden');

      if (lobbyVideoPreview) lobbyVideoPreview.classList.add('hidden');
      if (lobbyAvatarPreview) lobbyAvatarPreview.classList.remove('hidden');
    } else {
      if (camBtn) {
        camBtn.classList.remove('bg-destructive', 'text-white');
        camBtn.classList.add('bg-slate-800');
        camBtn.querySelector('i').className = 'ph-bold ph-video-camera text-lg';
      }
      if (lobbyCamBtn) {
        lobbyCamBtn.classList.remove('bg-destructive', 'text-white');
        lobbyCamBtn.classList.add('bg-slate-800');
        lobbyCamBtn.querySelector('i').className = 'ph-bold ph-video-camera text-lg';
      }
      if (lobbyCamText) lobbyCamText.textContent = 'Mở Camera';

      if (localVideo) localVideo.classList.remove('hidden');
      if (localAvatar) localAvatar.classList.add('hidden');

      if (stageLocalVideo) stageLocalVideo.classList.remove('hidden');
      if (stageLocalAvatar) stageLocalAvatar.classList.add('hidden');

      if (lobbyVideoPreview) lobbyVideoPreview.classList.remove('hidden');
      if (lobbyAvatarPreview) lobbyAvatarPreview.classList.add('hidden');
    }
    updateParticipantsUI();
  }

  // Slide-over Panels UI Toggles
  if (chatToggleBtn && chatPanel) {
    chatToggleBtn.addEventListener('click', () => {
      chatPanel.classList.toggle('hidden');
      if (!chatPanel.classList.contains('hidden')) {
        unreadChatCount = 0;
        if (unreadChatBadge) {
          unreadChatBadge.textContent = '0';
          unreadChatBadge.classList.add('hidden');
        }
      }
      if (participantsPanel) participantsPanel.classList.add('hidden');
    });
  }

  if (participantsToggleBtn && participantsPanel) {
    participantsToggleBtn.addEventListener('click', () => {
      participantsPanel.classList.toggle('hidden');
      if (chatPanel) chatPanel.classList.add('hidden');
    });
  }

  // Leave room button
  if (leaveBtn) {
    leaveBtn.addEventListener('click', () => {
      if (confirm('Bạn muốn rời khỏi cuộc họp này?')) {
        if (localStream) localStream.getTracks().forEach((t) => t.stop());
        if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
        if (socket) socket.disconnect();
        const redirectUrl = currentUserRole === 'teacher' ? `/teacher/classrooms/${classroomId}` : `/student/classrooms/${classroomId}`;
        window.location.href = redirectUrl;
      }
    });
  }

  // Chat message sending
  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const content = chatInput.value.trim();
      if (!content || !socket) return;

      socket.emit('send_room_message', {
        meetingId,
        content,
        senderName: currentUserName,
        senderRole: currentUserRole,
      });

      chatInput.value = '';
    });
  }

  function appendChatMessage({ senderName, senderRole, content, time }) {
    if (!chatMessages) return;
    const msgEl = document.createElement('div');
    const isSelf = senderName === currentUserName;
    const roleBadge = senderRole === 'teacher' ? ' (Giáo viên)' : '';

    msgEl.className = `p-3 rounded-2xl max-w-[85%] text-sm space-y-1 ${
      isSelf ? 'bg-[#5B5FC7] text-white ml-auto' : 'bg-slate-800 text-slate-100'
    }`;
    msgEl.innerHTML = `
      <div class="flex items-center gap-2 text-xs opacity-80 font-bold">
        <span>${senderName}${roleBadge}</span>
        <span class="font-normal font-mono text-[10px]">${time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <p class="leading-relaxed font-medium">${content}</p>`;

    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function updateParticipantsUI() {
    // Filter out any null/undefined entries that may appear during renegotiation
    const activePeers = Object.values(peersInfo).filter(Boolean);
    const totalCount = activePeers.length + 1;

    // Ensure remote video/avatar tiles exist for all active peers
    Object.keys(peersInfo).forEach((sId) => {
      if (!peersInfo[sId]) return; // skip undefined entries
      const peerVideo = document.getElementById(`peer-video-${sId}`);
      const stream = peerVideo && peerVideo.srcObject ? peerVideo.srcObject : null;
      addOrUpdateRemoteVideoTile(sId, stream);
    });

    if (participantCountBadge) {
      participantCountBadge.textContent = totalCount;
    }
    if (stageSidebarPeerCount) {
      stageSidebarPeerCount.textContent = activePeers.length;
    }

    if (!participantsList) return;
    participantsList.innerHTML = `
      <div class="flex items-center justify-between p-3 rounded-xl bg-[#5B5FC7]/20 border border-[#5B5FC7]/40">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-[#5B5FC7] text-white font-bold flex items-center justify-center text-xs">
            ${currentUserName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p class="text-sm font-bold text-white">${currentUserName} (Bạn)</p>
            <p class="text-xs text-slate-400 capitalize">${currentUserRole}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          ${isHandRaised ? '<span class="text-base">✋</span>' : ''}
          <i class="ph-bold ${isMicMuted ? 'ph-microphone-slash text-destructive' : 'ph-microphone text-[#7B83EB]'}"></i>
        </div>
      </div>`;

    activePeers.forEach((p) => {
      if (!p || !p.userName) return; // skip invalid entries
      const pEl = document.createElement('div');
      pEl.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700';
      pEl.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 font-bold flex items-center justify-center text-xs text-white">
            ${(p.userName || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <p class="text-sm font-bold text-slate-100">${p.userName}</p>
            <p class="text-xs text-slate-400 capitalize">${p.userRole || 'student'}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          ${p.raisedHand ? '<span class="text-base">✋</span>' : ''}
          <i class="ph-bold ${p.audioActive !== false ? 'ph-microphone text-[#7B83EB]' : 'ph-microphone-slash text-destructive'} text-base"></i>
        </div>`;
      participantsList.appendChild(pEl);
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('meeting-banner-container');
  if (!container) return;

  const classroomId = container.dataset.classroomId;
  const isTeacher = container.dataset.isTeacher === 'true';
  const csrfToken = container.dataset.csrfToken || '';

  let countdownInterval = null;

  function initCountdown() {
    const countdownEl = document.getElementById('meeting-countdown');
    if (!countdownEl) return;

    const startTimeStr = countdownEl.dataset.startTime;
    if (!startTimeStr) return;

    const startTime = new Date(startTimeStr).getTime();

    if (countdownInterval) clearInterval(countdownInterval);

    function update() {
      const now = new Date().getTime();
      const diff = startTime - now;

      if (diff <= 0) {
        clearInterval(countdownInterval);
        countdownEl.innerHTML = '<span class="text-primary font-bold animate-pulse">Bắt đầu ngay bây giờ...</span>';
        // Check active meeting status from API to seamlessly update banner
        fetchActiveMeeting();
        return;
      }

      const totalSeconds = Math.floor(diff / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      let display = '';
      if (hours > 0) {
        display = `${hours} giờ ${minutes} phút ${seconds} giây`;
      } else if (minutes > 0) {
        display = `${minutes} phút ${seconds} giây`;
      } else {
        display = `${seconds} giây`;
      }

      countdownEl.textContent = `Bắt đầu sau ${display}`;
    }

    update();
    countdownInterval = setInterval(update, 1000);
  }

  async function fetchActiveMeeting() {
    try {
      const res = await fetch(`/api/classrooms/${classroomId}/active-meeting`);
      if (!res.ok) return;
      const data = await res.json();
      renderBanner(data.meeting);
    } catch (err) {
      console.error('Error fetching active meeting:', err);
    }
  }

  function renderBanner(meeting) {
    if (!meeting || (meeting.status !== 'LIVE' && meeting.status !== 'SCHEDULED')) {
      container.innerHTML = '';
      return;
    }

    const { _id, title, status, startTime, teacher } = meeting;
    const roomUrl = `/classrooms/${classroomId}/meetings/${_id}/room`;
    const teacherName = teacher ? (teacher.name || teacher) : 'Giáo viên';

    if (status === 'LIVE') {
      container.innerHTML = `
        <div class="glass-panel p-3 px-4 md_px-5 rounded-2xl border border-destructive/40 bg-destructive/5 flex flex-col sm_flex-row items-center justify-between gap-3 shadow-md animate-in slide-in-up">
          <div class="flex items-center gap-3.5 min-w-0">
            <div class="relative flex items-center justify-center w-10 h-10 rounded-xl bg-destructive text-white shadow-md flex-shrink-0">
              <i class="ph-bold ph-video-camera text-lg"></i>
              <span class="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-destructive border-2 border-background"></span>
              </span>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="badge-destructive px-2 py-0.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                  <span class="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span> LIVE
                </span>
                <span class="text-xs text-muted-foreground truncate font-medium">• ${teacherName} đang tổ chức</span>
              </div>
              <h3 class="text-sm font-extrabold text-foreground truncate">${title}</h3>
            </div>
          </div>
          <div class="flex items-center gap-2 w-full sm_w-auto flex-shrink-0 justify-end">
            <a href="${roomUrl}" class="btn-primary h-9 px-5 rounded-xl text-xs font-extrabold shadow bg-destructive hover_bg-destructive/90 text-white flex items-center justify-center gap-1.5 transition-transform hover_scale-105">
              <i class="ph-bold ph-sign-in text-sm"></i>
              JOIN MEETING
            </a>
            ${
              isTeacher
                ? `
              <form method="POST" action="/classrooms/${classroomId}/meetings/${_id}/end" class="m-0" onsubmit="return confirm('Bạn có chắc chắn muốn kết thúc cuộc họp?');">
                <input type="hidden" name="_csrf" value="${csrfToken}">
                <button type="submit" class="btn-outline h-9 px-3 rounded-xl text-xs font-bold text-destructive border-destructive/30 hover_bg-destructive/10" title="Kết thúc cuộc họp">
                  Kết thúc
                </button>
              </form>`
                : ''
            }
          </div>
        </div>`;
    } else if (status === 'SCHEDULED') {
      container.innerHTML = `
        <div class="glass-panel p-3 px-4 md_px-5 rounded-2xl border border-primary/30 bg-primary/5 flex flex-col sm_flex-row items-center justify-between gap-3 shadow-sm animate-in slide-in-up">
          <div class="flex items-center gap-3.5 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center flex-shrink-0">
              <i class="ph-bold ph-calendar-blank text-xl"></i>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="badge-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  📅 Upcoming Meeting
                </span>
              </div>
              <h3 class="text-sm font-extrabold text-foreground truncate">${title}</h3>
              <p id="meeting-countdown" data-start-time="${startTime}" class="text-xs font-semibold text-primary flex items-center gap-1">
                ⏱️ Đang tính thời gian...
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 w-full sm_w-auto flex-shrink-0 justify-end">
            ${
              isTeacher
                ? `
              <form method="POST" action="/classrooms/${classroomId}/meetings/${_id}/start" class="m-0">
                <input type="hidden" name="_csrf" value="${csrfToken}">
                <button type="submit" class="btn-primary h-9 px-4 rounded-xl text-xs font-bold shadow flex items-center gap-1.5">
                  <i class="ph-bold ph-play text-xs"></i>
                  Start Now
                </button>
              </form>
              <form method="POST" action="/classrooms/${classroomId}/meetings/${_id}/cancel" class="m-0" onsubmit="return confirm('Hủy cuộc họp này?');">
                <input type="hidden" name="_csrf" value="${csrfToken}">
                <button type="submit" class="btn-outline h-9 px-3 rounded-xl text-xs font-bold text-destructive border-destructive/30 hover_bg-destructive/10">
                  Hủy
                </button>
              </form>`
                : `
              <a href="${roomUrl}" class="btn-outline h-9 px-4 rounded-xl text-xs font-bold opacity-75 pointer-events-none border-border">
                Chờ bắt đầu
              </a>`
            }
          </div>
        </div>`;
      initCountdown();
    }
  }

  // Socket.IO realtime connection for meeting updates
  if (typeof io !== 'undefined') {
    const socket = io('/meeting', {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    socket.on('connect', () => {
      socket.emit('join-classroom-meeting', { classroomId });
    });

    socket.on('meeting:status_changed', (data) => {
      if (data && data.classroomId === classroomId) {
        // Reload the page to ensure correct layout rendering
        // instead of injecting HTML dynamically which causes layout issues
        window.location.reload();
      }
    });
  }

  // Initial countdown run if scheduled meeting present in server HTML
  initCountdown();
});

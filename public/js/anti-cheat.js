document.addEventListener('DOMContentLoaded', () => {
  const antiCheatConfigEl = document.getElementById('anti-cheat-config');
  if (!antiCheatConfigEl) return;

  const config = JSON.parse(antiCheatConfigEl.textContent);
  if (!config.strictMode) return;

  const examForm = document.getElementById('exam-form');
  const violationsInput = document.getElementById('violationsJson');
  
  let violations = [];
  try {
    violations = JSON.parse(violationsInput.value || '[]');
  } catch (e) {}

  // Ensure Socket.io is available
  const socket = typeof io !== 'undefined' ? io('/exam-monitor') : null;
  if (socket) {
    socket.emit('join-exam', { examId: config.examId, studentId: config.studentId, studentName: config.studentName });
  }

  const violationOverlay  = document.getElementById('violation-overlay');
  const violationCountEl  = document.getElementById('violation-count-text');
  const integrityDot      = document.getElementById('integrity-dot');
  const integrityLabel    = document.getElementById('integrity-label');

  function recordViolation(type, details) {
    const v = { type, time: new Date().toISOString(), details };
    violations.push(v);
    violationsInput.value = JSON.stringify(violations);

    // Update integrity indicator
    if (integrityDot)   integrityDot.classList.add('violated');
    if (integrityLabel) integrityLabel.textContent = 'Violation detected';

    // Show styled overlay panel instead of alert()
    if (violationOverlay) {
      if (violationCountEl) {
        const remaining = config.maxViolations > 0
          ? config.maxViolations - violations.length
          : null;
        violationCountEl.textContent = remaining !== null
          ? `Violation ${violations.length} of ${config.maxViolations} recorded. ${remaining > 0 ? remaining + ' remaining.' : 'Auto-submitting.'}`
          : `Violation recorded (${violations.length} total).`;
      }
      violationOverlay.classList.add('visible');
    }

    // Emit to teacher dashboard
    if (socket) {
      socket.emit('cheat-violation', {
        examId: config.examId,
        studentId: config.studentId,
        studentName: config.studentName,
        violation: v
      });
    }

    // Auto-submit if max violations reached
    if (config.maxViolations > 0 && violations.length >= config.maxViolations) {
      if (violationCountEl) violationCountEl.textContent = 'Maximum violations reached. Submitting your exam now.';
      setTimeout(() => { examForm.submit(); }, 2500);
    }
  }

  // 1. Tab blur / visibility change
  window.addEventListener('blur', () => {
    recordViolation('blur', 'Switched tab or window');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      recordViolation('visibility_hidden', 'Tab was hidden');
    }
  });

  // 2. Fullscreen monitor
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      recordViolation('fullscreen_exit', 'Exited fullscreen mode');
    }
  });

  // 3. Block Copy/Paste/Cut
  document.addEventListener('copy', (e) => {
    e.preventDefault();
    recordViolation('copy', 'Attempted to copy content');
  });
  
  document.addEventListener('cut', (e) => {
    e.preventDefault();
    recordViolation('cut', 'Attempted to cut content');
  });
  
  document.addEventListener('paste', (e) => {
    e.preventDefault();
    recordViolation('paste', 'Attempted to paste content');
  });

  // 4. Block Right Click
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    recordViolation('right_click', 'Attempted to right click');
  });

  // Pre-exam gate and violation overlay are handled in the Pug template.
  // This script only handles event detection and violation recording.
});

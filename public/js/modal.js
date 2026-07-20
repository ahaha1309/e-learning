/* global-modal.js — drives the existing .modal-backdrop.open CSS classes.
 *
 * Two trigger patterns:
 *   [data-confirm="Prompt text"]
 *     data-confirm-title="Delete user"
 *     data-confirm-body="This cannot be undone."
 *     data-confirm-label="Delete"
 *     data-confirm-cancel="Cancel"
 *     → returns a Promise<boolean> via a custom event, OR gates a form submit.
 *     Usage for links/buttons that need confirmation before navigation:
 *       <a href="/admin/users/1/delete" data-confirm data-confirm-title="Delete user" data-confirm-body="This permanently removes the account.">Delete</a>
 *     For form submits, set data-confirm on the submit button.
 *
 *   [data-modal-open="#selector-or-js"]
 *     data-modal-title="Details"
 *     → opens an info modal; body = the referenced element's innerHTML or a raw string.
 *
 * Accessibility: focus trap, Escape, restore focus to trigger, aria-labelledby.
 */
(function () {
  var backdrop = document.getElementById('global-modal');
  if (!backdrop) return; // partial not included on this page

  var titleEl = document.getElementById('global-modal-title');
  var bodyEl = document.getElementById('global-modal-body');
  var cancelBtn = document.getElementById('global-modal-cancel');
  var confirmBtn = document.getElementById('global-modal-confirm');
  var closeBtn = document.getElementById('global-modal-close');
  if (!titleEl || !bodyEl || !cancelBtn || !confirmBtn || !closeBtn) return;

  var lastTrigger = null;
  var isOpen = false;
  var resolveConfirm = null;

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function open(opts) {
    lastTrigger = document.activeElement;
    titleEl.textContent = opts.title || 'Are you sure?';
    bodyEl.innerHTML = opts.body || '';
    if (opts.isConfirm) {
      cancelBtn.style.display = '';
      confirmBtn.style.display = '';
      confirmBtn.textContent = opts.confirmLabel || 'Confirm';
      cancelBtn.textContent = opts.cancelLabel || 'Cancel';
      if (opts.danger !== false) confirmBtn.className = 'btn btn-danger';
      else confirmBtn.className = 'btn btn-primary';
    } else {
      // info-only modal — single dismiss button
      cancelBtn.style.display = '';
      confirmBtn.style.display = 'none';
      cancelBtn.textContent = opts.cancelLabel || 'Close';
    }
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    isOpen = true;
    setTimeout(function () {
      var first = backdrop.querySelector(FOCUSABLE);
      if (first) first.focus();
      else backdrop.focus();
    }, 50);
  }

  function close(result) {
    if (!isOpen) return;
    backdrop.classList.remove('open');
    document.body.style.overflow = '';
    isOpen = false;
    if (resolveConfirm) { resolveConfirm(!!result); resolveConfirm = null; }
    if (lastTrigger && typeof lastTrigger.focus === 'function') {
      try { lastTrigger.focus(); } catch (e) {}
      lastTrigger = null;
    }
  }

  function trapKey(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
    if (e.key !== 'Tab') return;
    var nodes = backdrop.querySelectorAll(FOCUSABLE);
    var visible = Array.prototype.filter.call(nodes, function (n) {
      return n.offsetParent !== null || n === document.activeElement;
    });
    if (!visible.length) { e.preventDefault(); return; }
    var first = visible[0], last = visible[visible.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // --- wire triggers ---
  document.addEventListener('click', function (e) {
    var confirmEl = e.target.closest('[data-confirm]');
    if (confirmEl) {
      e.preventDefault();
      open({
        isConfirm: true,
        title: confirmEl.getAttribute('data-confirm-title') || 'Confirm action',
        body: confirmEl.getAttribute('data-confirm-body') || confirmEl.getAttribute('data-confirm') || 'Are you sure you want to continue?',
        confirmLabel: confirmEl.getAttribute('data-confirm-label') || 'Confirm',
        cancelLabel: confirmEl.getAttribute('data-confirm-cancel') || 'Cancel',
        danger: confirmEl.getAttribute('data-confirm-danger') !== 'false'
      });
      resolveConfirm = function (ok) {
        if (!ok) return;
        // navigate or submit the original element
        var href = confirmEl.getAttribute('href');
        if (href && href !== '#') { window.location.href = href; return; }
        if (confirmEl.type === 'submit' && confirmEl.form) { confirmEl.form.submit(); return; }
      };
      return;
    }

    var infoEl = e.target.closest('[data-modal-open]');
    if (infoEl) {
      e.preventDefault();
      var sel = infoEl.getAttribute('data-modal-open');
      var body = infoEl.getAttribute('data-modal-body') || '';
      if (!body && sel) {
        var src = /^[#\.\[]/.test(sel) ? document.querySelector(sel) : null;
        if (src) {
          // JSON pretty-print if it looks like JSON
          try {
            var parsed = JSON.parse(src.textContent);
            body = '<pre style="white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono,monospace);font-size:0.8125rem;background:hsl(var(--muted)/0.5);border:1px solid hsl(var(--border));border-radius:0.5rem;padding:0.75rem">' +
              JSON.stringify(parsed, null, 2).replace(/</g, '<') + '</pre>';
          } catch (err) {
            body = '<div>' + (src.innerHTML || src.textContent || '') + '</div>';
          }
        } else {
          body = sel;
        }
      }
      open({
        isConfirm: false,
        title: infoEl.getAttribute('data-modal-title') || 'Details',
        body: body,
        cancelLabel: 'Close'
      });
    }
  });

  cancelBtn.addEventListener('click', function () { close(false); });
  confirmBtn.addEventListener('click', function () { close(true); });
  closeBtn.addEventListener('click', function () { close(false); });
  backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(false); });
  document.addEventListener('keydown', trapKey);

  // expose for ad-hoc callers
  window.openGlobalModal = open;
  window.closeGlobalModal = function (r) { close(r); };
})();

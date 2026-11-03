/* ai-question-gen.js
 * Client-side controller for the 4-step AI question generation wizard.
 * Uses the existing /teacher/.../ai-generate API endpoint (multipart upload).
 * Reuses the existing /import-questions endpoint for saving (same as exam-import.js).
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  var generatedQuestions = []; // Array of { id, content, type, options, explanation }
  var selectedFile = null;

  // ── Meta ───────────────────────────────────────────────────────────────────
  var meta = document.getElementById('ai-generate-meta');
  var EXAM_ID       = meta.dataset.examId;
  var CLASSROOM_ID  = meta.dataset.classroomId;
  var CSRF_TOKEN    = meta.dataset.csrf;
  var IMPORT_URL    = meta.dataset.importUrl;
  var GENERATE_URL  = meta.dataset.generateUrl;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var dropZone          = document.getElementById('ai-drop-zone');
  var fileInput         = document.getElementById('ai-file-input');
  var fileInfo          = document.getElementById('ai-file-info');
  var fileName          = document.getElementById('ai-file-name');
  var fileSize          = document.getElementById('ai-file-size');
  var removeFileBtn     = document.getElementById('ai-remove-file');
  var uploadError       = document.getElementById('ai-upload-error');
  var aiSpinner         = document.getElementById('ai-spinner');
  var dropText          = document.getElementById('ai-drop-text');
  var dropIcon          = document.getElementById('ai-drop-icon');

  var stepUpload        = document.getElementById('step-upload');
  var stepConfig        = document.getElementById('step-config');
  var stepPreview       = document.getElementById('step-preview');
  var stepConfirm       = document.getElementById('step-confirm');

  var stepUploadInd     = document.getElementById('step-upload-indicator');
  var stepConfigInd     = document.getElementById('step-config-indicator');
  var stepPreviewInd    = document.getElementById('step-preview-indicator');
  var stepConfirmInd    = document.getElementById('step-confirm-indicator');

  var proceedToConfig   = document.getElementById('proceed-to-config');
  var backToUpload      = document.getElementById('back-to-upload');
  var startGenerate     = document.getElementById('start-generate');
  var generateSpinner   = document.getElementById('generate-spinner');
  var backToConfig      = document.getElementById('back-to-config');
  var proceedToConfirm  = document.getElementById('proceed-to-confirm');
  var regenerateBtn     = document.getElementById('regenerate-btn');
  var backToPreview     = document.getElementById('back-to-preview');
  var saveBtn           = document.getElementById('save-btn');
  var saveSpinner       = document.getElementById('save-spinner');

  var previewList       = document.getElementById('preview-list');
  var previewCount      = document.getElementById('preview-count');
  var previewWarnings   = document.getElementById('preview-warnings');
  var previewError      = document.getElementById('preview-error');
  var confirmCount      = document.getElementById('confirm-count');
  var saveError         = document.getElementById('save-error');

  // ── Step Navigation ────────────────────────────────────────────────────────
  function showStep(name) {
    stepUpload.hidden  = name !== 'upload';
    stepConfig.hidden  = name !== 'config';
    stepPreview.hidden = name !== 'preview';
    stepConfirm.hidden = name !== 'confirm';

    stepUploadInd.setAttribute('data-active',  name === 'upload'  ? 'true' : 'false');
    stepConfigInd.setAttribute('data-active',  name === 'config'  ? 'true' : 'false');
    stepPreviewInd.setAttribute('data-active', name === 'preview' ? 'true' : 'false');
    stepConfirmInd.setAttribute('data-active', name === 'confirm' ? 'true' : 'false');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── File handling ─────────────────────────────────────────────────────────
  var ALLOWED_EXTS = ['.pdf', '.docx', '.txt', '.pptx'];
  var MAX_SIZE     = 30 * 1024 * 1024; // 30 MB

  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('import-drop-active');
  });
  dropZone.addEventListener('dragleave', function () {
    dropZone.classList.remove('import-drop-active');
  });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('import-drop-active');
    if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
  });
  dropZone.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    if (fileInput.files[0]) selectFile(fileInput.files[0]);
  });

  removeFileBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    clearFile();
  });

  function selectFile(file) {
    clearUploadError();
    var ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

    if (!ALLOWED_EXTS.includes(ext)) {
      showUploadError('Định dạng tệp không được hỗ trợ. Vui lòng dùng PDF, DOCX, TXT, hoặc PPTX.');
      return;
    }
    if (file.size > MAX_SIZE) {
      showUploadError('Tệp vượt quá giới hạn 30 MB.');
      return;
    }
    if (file.size === 0) {
      showUploadError('Tệp rỗng. Vui lòng chọn tệp khác.');
      return;
    }

    selectedFile = file;

    // Show file info
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    fileInfo.classList.remove('hidden');

    // Update drop zone appearance
    if (dropIcon) dropIcon.style.display = 'none';
    if (dropText) dropText.textContent = 'Đã chọn tệp (nhấp để thay đổi)';

    proceedToConfig.disabled = false;
  }

  function clearFile() {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.classList.add('hidden');
    proceedToConfig.disabled = true;
    if (dropIcon) dropIcon.style.display = '';
    if (dropText) dropText.textContent = 'Thả tệp của bạn vào đây';
    clearUploadError();
  }

  // ── Upload & Config ───────────────────────────────────────────────────────
  proceedToConfig.addEventListener('click', function () {
    if (!selectedFile) return;
    showStep('config');
  });

  backToUpload.addEventListener('click', function () {
    showStep('upload');
  });

  // ── Generate ──────────────────────────────────────────────────────────────
  startGenerate.addEventListener('click', function () {
    callGenerateApi();
  });

  regenerateBtn.addEventListener('click', function () {
    showStep('config');
  });

  function callGenerateApi() {
    if (!selectedFile) {
      showStep('upload');
      return;
    }

    setGenerateLoading(true);
    clearPreviewErrors();

    var formData = new FormData();
    formData.append('document', selectedFile);
    formData.append('numQuestions', document.getElementById('ai-num-questions').value);
    formData.append('difficulty',   document.getElementById('ai-difficulty').value);
    formData.append('language',     document.getElementById('ai-language').value);
    formData.append('numOptions',   document.getElementById('ai-num-options').value);
    formData.append('focusTopic',   document.getElementById('ai-focus-topic').value);
    var explCheck = document.getElementById('ai-include-explanation');
    formData.append('includeExplanation', explCheck && explCheck.checked ? 'true' : 'false');

    fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'CSRF-Token': CSRF_TOKEN },
      body: formData,
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        setGenerateLoading(false);
        if (!data.success) {
          showPreviewError(data.message || 'Đã xảy ra lỗi khi tạo câu hỏi.');
          showStep('preview');
          return;
        }

        generatedQuestions = (data.questions || []).map(function (q, idx) {
          return Object.assign({ id: idx }, q);
        });

        renderPreview(data.warnings || []);
        showStep('preview');
      })
      .catch(function (err) {
        setGenerateLoading(false);
        showPreviewError('Lỗi kết nối mạng: ' + err.message);
        showStep('preview');
      });
  }

  function setGenerateLoading(active) {
    startGenerate.disabled = active;
    if (generateSpinner) generateSpinner.classList.toggle('hidden', !active);
    if (active) showStep('preview');
  }

  // ── Preview Rendering ──────────────────────────────────────────────────────
  function renderPreview(warnings) {
    previewList.innerHTML = '';

    var validCount = generatedQuestions.length;

    previewCount.textContent = validCount + ' câu hỏi được tạo bởi AI';

    if (warnings && warnings.length > 0) {
      previewWarnings.textContent = warnings.length + ' cảnh báo: ' + warnings.join('; ');
      previewWarnings.hidden = false;
    } else {
      previewWarnings.hidden = true;
    }

    previewError.hidden = true;

    if (validCount === 0) {
      previewList.innerHTML = '<p class="text-center text-muted-foreground py-8">Không có câu hỏi nào được tạo. Vui lòng thử lại với tài liệu khác hoặc điều chỉnh cấu hình.</p>';
      proceedToConfirm.disabled = true;
      return;
    }

    generatedQuestions.forEach(function (q, idx) {
      previewList.appendChild(buildQuestionCard(q, idx));
    });

    proceedToConfirm.disabled = false;
  }

  function buildQuestionCard(q, idx) {
    var card = document.createElement('article');
    card.className = 'import-q-card';
    card.dataset.id = q.id;

    var labels = ['A', 'B', 'C', 'D', 'E', 'F'];

    var optionsHtml = '';
    if (q.options && q.options.length > 0) {
      optionsHtml = '<div class="import-q-opts">';
      q.options.forEach(function (opt, oi) {
        optionsHtml += '<label class="import-q-opt">'
          + '<input type="radio" name="correct_opt_' + q.id + '" data-opt="' + oi + '" data-qid="' + q.id + '"' + (opt.isCorrect ? ' checked' : '') + '>'
          + '<span class="import-q-opt-label">' + (labels[oi] || (oi + 1)) + '.</span>'
          + '<input type="text" class="import-q-opt-text flex-1" data-opt="' + oi + '" data-qid="' + q.id + '" value="' + escHtml(opt.text) + '">'
          + '</label>';
      });
      optionsHtml += '</div>';
    }

    var explanationHtml = '';
    if (q.explanation) {
      explanationHtml = '<details class="mt-3">'
        + '<summary class="text-xs text-muted-foreground cursor-pointer hover:text-foreground">'
        + '<i class="ph-bold ph-lightbulb mr-1" aria-hidden="true"></i>Xem giải thích</summary>'
        + '<p class="text-xs text-muted-foreground mt-2 pl-4 border-l-2 border-primary">' + escHtml(q.explanation) + '</p>'
        + '</details>';
    }

    card.innerHTML = '<div class="import-q-header">'
      + '<span class="import-q-num">AI ' + (idx + 1) + '</span>'
      + '<div class="import-q-actions">'
      + '<span class="badge-muted text-xs">Trắc nghiệm</span>'
      + '<button class="btn-ghost btn-sm btn-icon import-q-delete" data-qid="' + q.id + '" aria-label="Xóa câu hỏi" type="button">'
      + '<i class="ph-bold ph-trash" aria-hidden="true"></i>'
      + '</button>'
      + '</div>'
      + '</div>'
      + '<textarea class="import-q-content" data-qid="' + q.id + '" rows="3" aria-label="Nội dung câu hỏi">' + escHtml(q.content) + '</textarea>'
      + optionsHtml
      + explanationHtml;

    // Wire events
    card.querySelector('.import-q-content').addEventListener('input', function () {
      updateQuestion(q.id, 'content', this.value);
    });

    card.querySelector('.import-q-delete').addEventListener('click', function () {
      deleteQuestion(q.id);
    });

    var optTexts = card.querySelectorAll('.import-q-opt-text');
    optTexts.forEach(function (input) {
      input.addEventListener('input', function () {
        var oi = Number(this.dataset.opt);
        updateOption(q.id, oi, 'text', this.value);
      });
    });

    var radios = card.querySelectorAll('input[type="radio"]');
    radios.forEach(function (radio) {
      radio.addEventListener('change', function () {
        var oi = Number(this.dataset.opt);
        var target = generatedQuestions.find(function (x) { return x.id === q.id; });
        if (target) {
          target.options.forEach(function (o, i) { o.isCorrect = (i === oi); });
        }
      });
    });

    return card;
  }

  // ── State Mutations ────────────────────────────────────────────────────────
  function updateQuestion(qid, field, value) {
    var q = generatedQuestions.find(function (x) { return x.id === qid; });
    if (q) q[field] = value;
  }

  function updateOption(qid, optIdx, field, value) {
    var q = generatedQuestions.find(function (x) { return x.id === qid; });
    if (q && q.options[optIdx]) q.options[optIdx][field] = value;
  }

  function deleteQuestion(qid) {
    generatedQuestions = generatedQuestions.filter(function (q) { return q.id !== qid; });
    renderPreview([]);
    if (generatedQuestions.length === 0) {
      proceedToConfirm.disabled = true;
    }
  }

  // ── Proceed to Confirm ────────────────────────────────────────────────────
  proceedToConfirm.addEventListener('click', function () {
    if (generatedQuestions.length === 0) return;
    confirmCount.textContent = generatedQuestions.length;
    showStep('confirm');
  });

  backToPreview.addEventListener('click', function () {
    showStep('preview');
  });

  backToConfig.addEventListener('click', function () {
    showStep('config');
  });

  // ── Save Questions ────────────────────────────────────────────────────────
  saveBtn.addEventListener('click', function () {
    if (generatedQuestions.length === 0) return;

    saveBtn.disabled = true;
    if (saveSpinner) saveSpinner.hidden = false;
    if (saveError) saveError.hidden = true;

    var payload = {
      questions: generatedQuestions.map(function (q) {
        return {
          content: q.content,
          type: 'multiple_choice',
          options: q.options,
        };
      }),
    };

    fetch(IMPORT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (saveSpinner) saveSpinner.hidden = true;
        saveBtn.disabled = false;
        if (data.success) {
          window.location.href = data.redirectUrl;
        } else {
          showSaveError(data.message || 'Không thể lưu câu hỏi. Vui lòng thử lại.');
        }
      })
      .catch(function (err) {
        if (saveSpinner) saveSpinner.hidden = true;
        saveBtn.disabled = false;
        showSaveError('Lỗi kết nối mạng: ' + err.message);
      });
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function showUploadError(msg) {
    uploadError.textContent = msg;
    uploadError.hidden = false;
  }

  function clearUploadError() {
    uploadError.hidden = true;
    uploadError.textContent = '';
  }

  function showPreviewError(msg) {
    if (previewError) { previewError.textContent = msg; previewError.hidden = false; }
  }

  function clearPreviewErrors() {
    if (previewError) { previewError.hidden = true; previewError.textContent = ''; }
    if (previewWarnings) { previewWarnings.hidden = true; previewWarnings.textContent = ''; }
  }

  function showSaveError(msg) {
    if (saveError) { saveError.textContent = msg; saveError.hidden = false; }
  }

})();

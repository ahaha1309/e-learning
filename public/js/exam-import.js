/* exam-import.js — Client-side PDF/DOCX parsing + preview/edit flow
 * Dependencies loaded via CDN in import.pug:
 *   - mammoth.js   (DOCX → text)
 *   - PDF.js       (PDF  → text)
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  var parsedQuestions = []; // { id, content, type, options:[{text,isCorrect}], warnings:[] }

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var dropZone       = document.getElementById('import-drop-zone');
  var fileInput      = document.getElementById('import-file-input');
  var uploadStep     = document.getElementById('step-upload');
  var previewStep    = document.getElementById('step-preview');
  var confirmStep    = document.getElementById('step-confirm');
  var stepUploadBtn  = document.getElementById('step-upload-indicator');
  var stepPreviewBtn = document.getElementById('step-preview-indicator');
  var stepConfirmBtn = document.getElementById('step-confirm-indicator');
  var previewList    = document.getElementById('preview-list');
  var previewCount   = document.getElementById('preview-count');
  var previewErrors  = document.getElementById('preview-errors');
  var parseSpinner   = document.getElementById('parse-spinner');
  var generateBtn    = document.getElementById('generate-btn');
  var generateSpinner = document.getElementById('generate-spinner');
  var importMeta     = document.getElementById('import-meta');
  var TARGET_ID      = importMeta.dataset.targetId || importMeta.dataset.examId;
  var TARGET_TYPE    = importMeta.dataset.targetType || 'exams';
  var CLASSROOM_ID   = importMeta.dataset.classroomId;
  var CSRF_TOKEN     = importMeta.dataset.csrf;

  // ── Step Navigation ────────────────────────────────────────────────────────
  function showStep(name) {
    uploadStep.hidden  = name !== 'upload';
    previewStep.hidden = name !== 'preview';
    confirmStep.hidden = name !== 'confirm';
    stepUploadBtn.setAttribute('data-active', name === 'upload' ? 'true' : 'false');
    stepPreviewBtn.setAttribute('data-active', name === 'preview' ? 'true' : 'false');
    stepConfirmBtn.setAttribute('data-active', name === 'confirm' ? 'true' : 'false');
  }

  // ── File Drop / Select ─────────────────────────────────────────────────────
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
    var file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  dropZone.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  function handleFile(file) {
    var name = file.name.toLowerCase();
    if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
      showUploadError('Only PDF and DOCX files are supported.');
      return;
    }
    clearUploadError();
    setSpinner(true);

    var reader = new FileReader();
    reader.onload = function (e) {
      var arrayBuffer = e.target.result;
      if (name.endsWith('.docx')) {
        parseDocx(arrayBuffer);
      } else {
        parsePdf(arrayBuffer);
      }
    };
    reader.onerror = function () {
      setSpinner(false);
      showUploadError('Could not read the file. Please try again.');
    };
    reader.readAsArrayBuffer(file);
  }

  // ── DOCX Parsing via mammoth.js ────────────────────────────────────────────
  function parseDocx(arrayBuffer) {
    if (typeof mammoth === 'undefined') {
      setSpinner(false);
      showUploadError('mammoth.js failed to load. Check your internet connection and reload.');
      return;
    }
    mammoth.extractRawText({ arrayBuffer: arrayBuffer })
      .then(function (result) {
        setSpinner(false);
        processRawText(result.value);
      })
      .catch(function (err) {
        setSpinner(false);
        showUploadError('Could not parse DOCX: ' + err.message);
      });
  }

  // ── PDF Parsing via PDF.js ────────────────────────────────────────────────
  function parsePdf(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') {
      setSpinner(false);
      showUploadError('PDF.js failed to load. Check your internet connection and reload.');
      return;
    }
    var loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    loadingTask.promise.then(function (pdf) {
      var pagePromises = [];
      for (var i = 1; i <= pdf.numPages; i++) {
        pagePromises.push(
          pdf.getPage(i).then(function (page) {
              var lastY = null;
              var text = '';
              content.items.forEach(function (item) {
                if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                  text += '\n';
                }
                text += item.str;
                lastY = item.transform[5];
              });
              return text;
          })
        );
      }
      return Promise.all(pagePromises);
    }).then(function (pages) {
      setSpinner(false);
      processRawText(pages.join('\n'));
    }).catch(function (err) {
      setSpinner(false);
      showUploadError('Could not parse PDF: ' + err.message);
    });
  }

  // ── Question Parser ────────────────────────────────────────────────────────
  /**
   * Supported question starters:
   *   "Question 1.", "Q1.", "Câu 1.", "1.", "1)"
   * Supported option starters:
   *   "A.", "B.", "C.", "D." (case-insensitive, followed by space or newline)
   */
  function processRawText(text) {
    // Normalise line endings and inject newlines for squashed text
    var normalised = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/([^\n])([A-D][.)]\s+)/g, '$1\n$2')
      .replace(/([^\n])((?:Câu\s+\d+|Question\s+\d+|Q\s*\d+|\d+)[.)]\s+)/gi, '$1\n$2');

    // Split into lines, trim
    var lines = normalised.split('\n').map(function (l) { return l.trim(); });

    // Merge into blocks separated by question starts
    var qStartRe = /^(?:question\s+\d+|câu\s+\d+|q\s*\d+|\d+)[.)]\s*/i;
    var optRe    = /^([A-D])[.)]\s+(.+)/i;

    var questions = [];
    var current = null;
    var currentOpt = null; // tracking multi-line option

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line) { currentOpt = null; continue; }

      // Skip obvious page numbers (lone number)
      if (/^\d+$/.test(line) && Number(line) < 1000) continue;

      if (qStartRe.test(line)) {
        // New question
        if (current) questions.push(current);
        var content = line.replace(qStartRe, '').trim();
        current = { content: content, options: [], type: 'multiple_choice' };
        currentOpt = null;
        continue;
      }

      var optMatch = optRe.exec(line);
      if (optMatch && current) {
        currentOpt = { text: optMatch[2].trim(), isCorrect: false };
        current.options.push(currentOpt);
        continue;
      }

      // Continuation line — attach to current option or question content
      if (currentOpt) {
        currentOpt.text += ' ' + line;
      } else if (current) {
        current.content += ' ' + line;
      }
    }
    if (current) questions.push(current);

    if (questions.length === 0) {
      showUploadError('No questions were detected. Make sure the file uses a supported format (Question 1. / Câu 1. / 1.).');
      return;
    }

    // Assign IDs, detect issues
    parsedQuestions = questions.map(function (q, idx) {
      var warnings = [];
      if (!q.content.trim()) warnings.push('Question content appears empty.');
      if (q.options.length > 0 && q.options.length < 2) warnings.push('Fewer than 2 options detected.');
      if (q.options.length > 0 && q.options.length < 4) warnings.push('Fewer than 4 options — check for missing options.');
      return {
        id: idx,
        content: q.content.trim(),
        type: q.options.length > 0 ? 'multiple_choice' : 'essay',
        options: q.options,
        warnings: warnings,
      };
    });

    renderPreview();
    showStep('preview');
  }

  // ── Preview Render ────────────────────────────────────────────────────────
  function renderPreview() {
    previewCount.textContent = parsedQuestions.length + ' question(s) parsed';

    var warningCount = parsedQuestions.filter(function (q) { return q.warnings.length > 0; }).length;
    if (warningCount > 0) {
      previewErrors.textContent = warningCount + ' question(s) have warnings — review them below.';
      previewErrors.hidden = false;
    } else {
      previewErrors.hidden = true;
    }

    previewList.innerHTML = '';
    parsedQuestions.forEach(function (q, idx) {
      previewList.appendChild(buildQuestionCard(q, idx));
    });
  }

  function buildQuestionCard(q, idx) {
    var card = document.createElement('article');
    card.className = 'import-q-card' + (q.warnings.length > 0 ? ' import-q-card--warn' : '');
    card.dataset.id = q.id;

    var hasOptions = q.type !== 'essay' && q.options.length > 0;

    var optionsHtml = '';
    if (hasOptions) {
      var labels = ['A', 'B', 'C', 'D'];
      var inputType = q.type === 'multiple_choice' ? 'radio' : 'checkbox';
      optionsHtml = '<div class="import-q-opts">';
      q.options.forEach(function (opt, oi) {
        optionsHtml += '<label class="import-q-opt">'
          + '<input type="' + inputType + '" name="correct_opt_' + q.id + '" data-opt="' + oi + '" data-qid="' + q.id + '"' + (opt.isCorrect ? ' checked' : '') + '>'
          + '<span class="import-q-opt-label">' + (labels[oi] || oi + 1) + '.</span>'
          + '<input type="text" class="import-q-opt-text" data-opt="' + oi + '" data-qid="' + q.id + '" value="' + escHtml(opt.text) + '">'
          + '</label>';
      });
      optionsHtml += '</div>';
    }

    var warningsHtml = '';
    if (q.warnings.length > 0) {
      warningsHtml = '<div class="import-q-warnings">'
        + q.warnings.map(function (w) { return '<span><i class="ph-bold ph-warning" aria-hidden="true"></i> ' + escHtml(w) + '</span>'; }).join('')
        + '</div>';
    }

    card.innerHTML = '<div class="import-q-header">'
      + '<span class="import-q-num">Q' + (idx + 1) + '</span>'
      + '<div class="import-q-actions">'
      + '<select class="import-q-type" data-qid="' + q.id + '" aria-label="Question type">'
      + '<option value="multiple_choice"' + (q.type === 'multiple_choice' ? ' selected' : '') + '>1 đáp án</option>'
      + '<option value="multiple_answer"' + (q.type === 'multiple_answer' ? ' selected' : '') + '>Nhiều đáp án</option>'
      + '<option value="essay"' + (q.type === 'essay' ? ' selected' : '') + '>Tự luận</option>'
      + '</select>'
      + '<button class="btn-ghost btn-sm btn-icon import-q-delete" data-qid="' + q.id + '" aria-label="Delete question">'
      + '<i class="ph-bold ph-trash" aria-hidden="true"></i>'
      + '</button>'
      + '</div>'
      + '</div>'
      + warningsHtml
      + '<textarea class="import-q-content" data-qid="' + q.id + '" rows="3" aria-label="Question content">' + escHtml(q.content) + '</textarea>'
      + optionsHtml;

    // Wire events
    card.querySelector('.import-q-content').addEventListener('input', function () {
      updateQuestion(q.id, 'content', this.value);
    });
    card.querySelector('.import-q-type').addEventListener('change', function () {
      var newType = this.value;
      updateQuestion(q.id, 'type', newType);
      
      var qToUpdate = parsedQuestions.find(function(x) { return x.id === q.id; });
      if (qToUpdate && (newType === 'multiple_choice' || newType === 'multiple_answer') && qToUpdate.options.length === 0) {
        qToUpdate.options = [
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false }
        ];
      } else if (qToUpdate && newType === 'essay') {
        qToUpdate.options = [];
      }
      
      var newCard = buildQuestionCard(qToUpdate, idx);
      card.parentNode.replaceChild(newCard, card);
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

    var optChecks = card.querySelectorAll('input[type="checkbox"], input[type="radio"]');
    optChecks.forEach(function (chk) {
      chk.addEventListener('change', function () {
        var oi = Number(this.dataset.opt);
        if (q.type === 'multiple_choice') {
          q.options.forEach(function(o, i) { o.isCorrect = (i === oi); });
        } else {
          updateOption(q.id, oi, 'isCorrect', this.checked);
        }
      });
    });

    return card;
  }

  // ── State Mutations ───────────────────────────────────────────────────────
  function updateQuestion(qid, field, value) {
    var q = parsedQuestions.find(function (x) { return x.id === qid; });
    if (q) q[field] = value;
  }

  function updateOption(qid, optIdx, field, value) {
    var q = parsedQuestions.find(function (x) { return x.id === qid; });
    if (q && q.options[optIdx]) q.options[optIdx][field] = value;
  }

  function deleteQuestion(qid) {
    parsedQuestions = parsedQuestions.filter(function (q) { return q.id !== qid; });
    renderPreview();
    if (parsedQuestions.length === 0) showStep('upload');
  }

  // ── Proceed to Confirm ────────────────────────────────────────────────────
  document.getElementById('proceed-to-confirm').addEventListener('click', function () {
    if (parsedQuestions.length === 0) return;
    document.getElementById('confirm-count').textContent = parsedQuestions.length;
    showStep('confirm');
  });

  document.getElementById('back-to-preview').addEventListener('click', function () {
    showStep('preview');
  });

  document.getElementById('back-to-upload').addEventListener('click', function () {
    parsedQuestions = [];
    showStep('upload');
  });


  // ── Generate Exam (POST) ──────────────────────────────────────────────────
  generateBtn.addEventListener('click', function () {
    if (parsedQuestions.length === 0) return;
    generateBtn.disabled = true;
    generateSpinner.hidden = false;

    var payload = {
      questions: parsedQuestions.map(function (q) {
        return {
          content: q.content,
          type: q.type,
          options: q.options,
        };
      }),
    };

    fetch('/teacher/classrooms/' + CLASSROOM_ID + '/' + TARGET_TYPE + '/' + TARGET_ID + '/import-questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CSRF-Token': CSRF_TOKEN,
      },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        generateSpinner.hidden = true;
        generateBtn.disabled = false;
        if (data.success) {
          window.location.href = data.redirectUrl;
        } else {
          showGenerateError(data.message || 'Import failed. Please try again.');
        }
      })
      .catch(function (err) {
        generateSpinner.hidden = true;
        generateBtn.disabled = false;
        showGenerateError('Network error: ' + err.message);
      });
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setSpinner(active) {
    if (parseSpinner) parseSpinner.hidden = !active;
    dropZone.style.pointerEvents = active ? 'none' : '';
  }

  function showUploadError(msg) {
    var el = document.getElementById('upload-error');
    if (el) { el.textContent = msg; el.hidden = false; }
    setSpinner(false);
  }

  function clearUploadError() {
    var el = document.getElementById('upload-error');
    if (el) { el.hidden = true; el.textContent = ''; }
  }

  function showGenerateError(msg) {
    var el = document.getElementById('generate-error');
    if (el) { el.textContent = msg; el.hidden = false; }
  }
})();

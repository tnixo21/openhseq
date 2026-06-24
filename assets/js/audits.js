/* ==========================================================================
   OpenHSEQ — audits.js
   Custom audit builder with multiple question types, scheduling, run + record.

   Question types:
     passfail  Pass / Fail / N·A           (scored: Pass good, Fail bad)
     yesno     Yes / No (+ N·A)            (scored: builder sets the good answer)
     select    Dropdown, pick one          (scored if "acceptable answers" set)
     multi     Checkboxes, pick many       (informational)
     number    Numeric entry               (scored if min/max range set)
     rating    1–5 rating                  (scored if pass threshold set)
     text      Free text                   (informational)
   Pass-rate % counts only scored answers (Pass / (Pass+Fail)); N·A excluded.
   ========================================================================== */
(function (global) {
  'use strict';
  var S = window.HSEQStore;
  var UI = window.HSEQUI;
  function esc(s) { return UI.esc(s); }
  function $(sel, root) { return (root || document).querySelector(sel); }

  var QTYPES = [
    { id: 'passfail', label: 'Pass / Fail / N·A' },
    { id: 'yesno', label: 'Yes / No' },
    { id: 'select', label: 'Dropdown (pick one)' },
    { id: 'multi', label: 'Checkboxes (pick many)' },
    { id: 'number', label: 'Number' },
    { id: 'rating', label: 'Rating 1–5' },
    { id: 'text', label: 'Text' }
  ];
  var SCORED = { passfail: 1, yesno: 1, select: 1, number: 1, rating: 1 };

  var root;
  var builderItems = [];
  var editingId = null;
  var editingSchedule = { frequency: 'None', nextDue: '' };
  var running = null;

  function typeOf(it) { return it.type || 'passfail'; }
  function parseList(str) { return String(str || '').split(/[,\n]/).map(function (s) { return s.trim(); }).filter(Boolean); }

  /* -------------------------------- views --------------------------------- */
  function render() { root = document.getElementById('auditsRoot'); if (running) return renderRun(); renderList(); }

  function renderList() {
    var tpls = S.auditTemplates(), done = S.completedAudits(), todayStr = S.today();
    var tplCards = tpls.length ? tpls.map(function (t) {
      var sched = t.schedule && t.schedule.frequency && t.schedule.frequency !== 'None';
      var due = sched && t.schedule.nextDue && t.schedule.nextDue <= todayStr;
      var schedLine = sched ? '<div class="muted">🔁 ' + esc(t.schedule.frequency) + ' · next: ' + esc(t.schedule.nextDue || '—') + (due ? ' <span class="badge badge-overdue">DUE</span>' : '') + '</div>' : '';
      return '<div class="audit-card' + (due ? ' is-due' : '') + '">' +
        '<div><strong>' + esc(t.title) + '</strong> <span class="badge type">' + esc(t.category) + '</span>' +
        '<div class="muted">' + t.items.length + ' question' + (t.items.length === 1 ? '' : 's') + '</div>' + schedLine + '</div>' +
        '<div class="audit-card-actions">' +
        '<button type="button" class="btn small primary" data-run="' + t.id + '">Run</button>' +
        '<button type="button" class="btn small" data-edit="' + t.id + '">Edit</button>' +
        '<button type="button" class="btn small danger" data-deltpl="' + t.id + '">Delete</button>' +
        '</div></div>';
    }).join('') : '<p class="empty">No audit types yet — create one.</p>';

    var doneRows = done.length ? done.map(function (a) {
      return '<tr><td><strong>' + esc(a.templateTitle) + '</strong></td><td>' + esc(a.date) + '</td><td>' + esc(a.auditor || '—') +
        '</td><td>' + esc(a.location || '—') + '</td><td>' + scoreBadge(a.passRate) + '</td>' +
        '<td><button type="button" class="btn link" data-viewaud="' + a.id + '">View</button>' +
        '<button type="button" class="btn link" data-printaud="' + a.id + '">PDF</button>' +
        '<button type="button" class="btn link" data-delaud="' + a.id + '">Delete</button></td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty">No completed audits yet.</td></tr>';

    root.innerHTML =
      '<div class="card"><div class="audit-head"><h3>Audit types</h3>' +
      '<button type="button" class="btn primary" id="aud-new">+ New audit type</button></div>' +
      '<div class="audit-grid">' + tplCards + '</div></div>' +
      '<div class="card"><h3>Completed audits</h3>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Audit</th><th>Date</th><th>Auditor</th><th>Location</th><th>Score</th><th>Actions</th>' +
      '</tr></thead><tbody>' + doneRows + '</tbody></table></div></div>';
  }
  function scoreBadge(p) { if (p == null) return '—'; var cls = p >= 90 ? 'risk-low' : p >= 70 ? 'risk-medium' : 'risk-high'; return '<span class="badge ' + cls + '">' + p + '%</span>'; }

  /* ------------------------------- builder -------------------------------- */
  function renderBuilder(tpl) {
    editingId = tpl ? tpl.id : null;
    editingSchedule = tpl && tpl.schedule ? tpl.schedule : { frequency: 'None', nextDue: '' };
    builderItems = tpl ? tpl.items.map(function (i) {
      return { id: i.id, text: i.text, type: i.type || 'passfail', requireComment: !!i.requireComment,
        options: (i.options || []).slice(), good: i.good || 'Yes', acceptable: (i.acceptable || []).slice(),
        min: i.min == null ? '' : i.min, max: i.max == null ? '' : i.max, threshold: i.threshold == null ? '' : i.threshold };
    }) : [newItem()];
    var freqs = ['None'].concat(Object.keys(S.FREQ_DAYS));
    root.innerHTML =
      '<div class="card"><h3>' + (tpl ? 'Edit' : 'New') + ' audit type</h3>' +
      '<div class="form-grid">' +
      '<label>Audit title *<input type="text" id="bld-title" value="' + esc(tpl ? tpl.title : '') + '" placeholder="e.g. Loading Dock Safety Inspection" /></label>' +
      '<label>Category<select id="bld-category">' + S.CATEGORIES.map(function (c) { return '<option' + (tpl && tpl.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
      '<label>Recurs<select id="bld-freq">' + freqs.map(function (f) { return '<option' + (editingSchedule.frequency === f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></label>' +
      '<label>Next due<input type="date" id="bld-nextdue" value="' + esc(editingSchedule.nextDue || '') + '" /></label>' +
      '</div><h4>Questions</h4><div id="bld-items"></div>' +
      '<button type="button" class="btn small" id="bld-add">+ Add question</button>' +
      '<div class="form-actions"><button type="button" class="btn primary" id="bld-save">Save audit type</button>' +
      '<button type="button" class="btn" id="bld-cancel">Cancel</button></div></div>';
    renderBuilderItems();
  }
  function newItem() { return { id: S.uid('q'), text: '', type: 'passfail', requireComment: false, options: [], good: 'Yes', acceptable: [], min: '', max: '', threshold: '' }; }

  function builderConfig(it, i) {
    var ty = typeOf(it);
    if (ty === 'yesno') {
      return '<div class="bld-config"><label class="cfg-lbl">Acceptable answer ' +
        '<select class="cfg-good"><option' + (it.good !== 'No' ? ' selected' : '') + '>Yes</option><option' + (it.good === 'No' ? ' selected' : '') + '>No</option></select></label></div>';
    }
    if (ty === 'select' || ty === 'multi') {
      return '<div class="bld-config">' +
        '<label class="cfg-lbl">Options (comma-separated)<input type="text" class="cfg-options" value="' + esc((it.options || []).join(', ')) + '" placeholder="Good, Fair, Poor" /></label>' +
        (ty === 'select' ? '<label class="cfg-lbl">Acceptable answers (optional, for scoring)<input type="text" class="cfg-acceptable" value="' + esc((it.acceptable || []).join(', ')) + '" placeholder="Good, Fair" /></label>' : '') +
        '</div>';
    }
    if (ty === 'number') {
      return '<div class="bld-config"><label class="cfg-lbl">Pass min<input type="number" class="cfg-min" value="' + esc(it.min) + '" /></label>' +
        '<label class="cfg-lbl">Pass max<input type="number" class="cfg-max" value="' + esc(it.max) + '" /></label><span class="muted cfg-note">Leave blank = not scored</span></div>';
    }
    if (ty === 'rating') {
      return '<div class="bld-config"><label class="cfg-lbl">Pass if rating ≥<input type="number" class="cfg-threshold" min="1" max="5" value="' + esc(it.threshold) + '" /></label><span class="muted cfg-note">Leave blank = not scored</span></div>';
    }
    return '';
  }

  function renderBuilderItems() {
    $('#bld-items').innerHTML = builderItems.map(function (it, i) {
      return '<div class="bld-row" data-i="' + i + '">' +
        '<span class="bld-num">' + (i + 1) + '</span>' +
        '<input type="text" class="bld-text" value="' + esc(it.text) + '" placeholder="Question / check" aria-label="Question ' + (i + 1) + '" />' +
        '<select class="bld-type" aria-label="Answer type">' + QTYPES.map(function (q) { return '<option value="' + q.id + '"' + (typeOf(it) === q.id ? ' selected' : '') + '>' + q.label + '</option>'; }).join('') + '</select>' +
        '<label class="bld-req"><input type="checkbox" class="bld-cmt"' + (it.requireComment ? ' checked' : '') + ' /> comment</label>' +
        '<button type="button" class="btn small danger bld-del" aria-label="Remove">×</button>' +
        builderConfig(it, i) +
        '</div>';
    }).join('');
  }

  function syncBuilderFromDom() {
    if (!$('#bld-items')) return;
    Array.prototype.forEach.call(document.querySelectorAll('#bld-items .bld-row'), function (row) {
      var i = Number(row.dataset.i), it = builderItems[i];
      it.text = row.querySelector('.bld-text').value;
      it.type = row.querySelector('.bld-type').value;
      it.requireComment = row.querySelector('.bld-cmt').checked;
      var g = row.querySelector('.cfg-good'); if (g) it.good = g.value;
      var o = row.querySelector('.cfg-options'); if (o) it.options = parseList(o.value);
      var a = row.querySelector('.cfg-acceptable'); if (a) it.acceptable = parseList(a.value);
      var mn = row.querySelector('.cfg-min'); if (mn) it.min = mn.value;
      var mx = row.querySelector('.cfg-max'); if (mx) it.max = mx.value;
      var th = row.querySelector('.cfg-threshold'); if (th) it.threshold = th.value;
    });
  }

  /* --------------------------------- run ---------------------------------- */
  function runInput(it, i) {
    var ty = typeOf(it), name = 'q' + i;
    function radios(opts) {
      return '<div class="run-opts">' + opts.map(function (o) {
        return '<label class="run-opt opt-' + String(o).replace(/[^A-Za-z0-9]/g, '') + '"><input type="radio" name="' + name + '" value="' + esc(o) + '" /> ' + esc(o) + '</label>';
      }).join('') + '</div>';
    }
    if (ty === 'passfail') return radios(['Pass', 'Fail', 'N/A']);
    if (ty === 'yesno') return radios(['Yes', 'No', 'N/A']);
    if (ty === 'rating') return radios(['1', '2', '3', '4', '5']);
    if (ty === 'select') return '<select class="run-select"><option value="">— select —</option>' + (it.options || []).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>';
    if (ty === 'multi') return '<div class="run-opts">' + (it.options || []).map(function (o) { return '<label class="run-opt"><input type="checkbox" class="run-multi" value="' + esc(o) + '" /> ' + esc(o) + '</label>'; }).join('') + '</div>';
    if (ty === 'number') return '<input type="number" class="run-number" placeholder="Enter a number" />';
    return '<input type="text" class="run-text" placeholder="Answer" />';
  }

  function renderRun() {
    var tpl = running.tpl;
    root.innerHTML =
      '<div class="card"><h3>Run audit: ' + esc(tpl.title) + '</h3>' +
      '<div class="form-grid">' +
      '<label>Auditor<input type="text" id="run-auditor" list="people" /></label>' +
      '<label>Location<input type="text" id="run-location" list="locations" /></label>' +
      '<label>Date<input type="date" id="run-date" value="' + S.today() + '" /></label></div>' +
      '<div class="run-items">' + tpl.items.map(function (it, i) {
        return '<div class="run-row" data-i="' + i + '">' +
          '<div class="run-q">' + (i + 1) + '. ' + esc(it.text) +
          ' <span class="qtype-tag">' + esc((QTYPES.filter(function (q) { return q.id === typeOf(it); })[0] || {}).label || '') + '</span>' +
          (it.requireComment ? ' <span class="muted">(comment required)</span>' : '') + '</div>' +
          runInput(it, i) +
          '<input type="text" class="run-comment" placeholder="Comment" aria-label="Comment ' + (i + 1) + '" /></div>';
      }).join('') + '</div>' +
      '<div class="form-actions"><button type="button" class="btn primary" id="run-save">Save audit</button>' +
      '<button type="button" class="btn" id="run-cancel">Cancel</button></div></div>';
  }

  function rawValue(it, i) {
    var ty = typeOf(it), row = document.querySelector('.run-row[data-i="' + i + '"]');
    if (ty === 'select') return row.querySelector('.run-select').value;
    if (ty === 'multi') return Array.prototype.slice.call(row.querySelectorAll('.run-multi:checked')).map(function (c) { return c.value; });
    if (ty === 'number') return row.querySelector('.run-number').value;
    if (ty === 'text') return row.querySelector('.run-text').value.trim();
    var sel = document.querySelector('input[name="q' + i + '"]:checked');
    return sel ? sel.value : '';
  }
  function resultOf(it, value) {
    var ty = typeOf(it);
    if (ty === 'passfail') return value || '';
    if (ty === 'yesno') { if (value === 'N/A') return 'N/A'; if (!value) return ''; return value === (it.good || 'Yes') ? 'Pass' : 'Fail'; }
    if (ty === 'select') { if (!it.acceptable || !it.acceptable.length || !value) return ''; return it.acceptable.indexOf(value) > -1 ? 'Pass' : 'Fail'; }
    if (ty === 'number') { if ((it.min === '' && it.max === '') || value === '') return ''; var n = Number(value); var okMin = it.min === '' || n >= Number(it.min); var okMax = it.max === '' || n <= Number(it.max); return okMin && okMax ? 'Pass' : 'Fail'; }
    if (ty === 'rating') { if (it.threshold === '' || !value) return ''; return Number(value) >= Number(it.threshold) ? 'Pass' : 'Fail'; }
    return '';
  }
  function isAnswered(it, value) {
    var ty = typeOf(it);
    if (ty === 'multi' || ty === 'text') return true; // optional
    if (ty === 'select' || ty === 'number') return value !== '';
    return !!value; // radio-based
  }

  function collectRun() {
    var tpl = running.tpl, ok = true, missing = false;
    var responses = tpl.items.map(function (it, i) {
      var value = rawValue(it, i);
      var display = Array.isArray(value) ? value.join(', ') : String(value);
      var result = resultOf(it, value);
      var comment = document.querySelector('.run-row[data-i="' + i + '"] .run-comment').value.trim();
      if (!isAnswered(it, value)) missing = true;
      if (it.requireComment && result && result !== 'N/A' && !comment) ok = false;
      return { text: it.text, type: typeOf(it), value: display, result: result, comment: comment };
    });
    if (missing) { alert('Please answer every scored question.'); return null; }
    if (!ok) { alert('Some questions need a comment.'); return null; }
    var pass = responses.filter(function (r) { return r.result === 'Pass'; }).length;
    var fail = responses.filter(function (r) { return r.result === 'Fail'; }).length;
    var denom = pass + fail;
    return {
      templateId: tpl.id, templateTitle: tpl.title, category: tpl.category,
      auditor: $('#run-auditor').value.trim(), location: $('#run-location').value.trim(),
      date: $('#run-date').value || S.today(), responses: responses,
      passRate: denom ? Math.round(pass / denom * 100) : 100
    };
  }

  /* ------------------------------ view/print ------------------------------ */
  function auditDocHTML(a) {
    var rows = a.responses.map(function (r, i) {
      var cls = r.result === 'Pass' ? 'risk-low' : r.result === 'Fail' ? 'risk-high' : '';
      var resCell = cls ? '<span class="badge ' + cls + '">' + esc(r.result) + '</span>' : (r.result ? esc(r.result) : '—');
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.text) + '</td><td>' + esc(r.value || '—') + '</td><td>' + resCell + '</td><td>' + esc(r.comment || '—') + '</td></tr>';
    }).join('');
    return '<div class="print-report"><h1>Audit — ' + esc(a.templateTitle) + '</h1>' +
      '<p>' + esc(a.category || '') + ' · ' + esc(a.date) + ' · Auditor: ' + esc(a.auditor || '—') +
      ' · Location: ' + esc(a.location || '—') + ' · Score: <strong>' + a.passRate + '%</strong></p>' +
      '<table class="print-table"><thead><tr><th>#</th><th>Question</th><th>Answer</th><th>Result</th><th>Comment</th></tr></thead><tbody>' +
      rows + '</tbody></table><p class="print-foot">Generated by OpenHSEQ · ' + new Date().toLocaleString() + '</p></div>';
  }
  function viewAudit(a) {
    $('#modalBody').innerHTML = auditDocHTML(a) + '<div class="form-actions"><button type="button" class="btn" id="modal-print-audit">⬇ Download / Print PDF</button></div>';
    $('#modalBody').removeAttribute('data-id'); $('#modal').hidden = false;
    var pb = document.getElementById('modal-print-audit'); if (pb) pb.onclick = function () { UI.printDoc(auditDocHTML(a)); };
  }

  /* ------------------------------- events --------------------------------- */
  document.addEventListener('change', function (e) {
    if (e.target.classList && e.target.classList.contains('bld-type')) { syncBuilderFromDom(); renderBuilderItems(); }
  });

  document.addEventListener('click', function (e) {
    if (!root) root = document.getElementById('auditsRoot');
    var t = e.target;
    if (t.id === 'aud-new') return renderBuilder(null);
    var run = t.closest('[data-run]'); if (run) { running = { tpl: S.getAuditTemplate(run.dataset.run) }; return renderRun(); }
    var ed = t.closest('[data-edit]'); if (ed) return renderBuilder(S.getAuditTemplate(ed.dataset.edit));
    var dt = t.closest('[data-deltpl]'); if (dt) { if (confirm('Delete this audit type?')) { S.removeAuditTemplate(dt.dataset.deltpl); renderList(); } return; }
    var va = t.closest('[data-viewaud]'); if (va) return viewAudit(S.getCompletedAudit(va.dataset.viewaud));
    var pa = t.closest('[data-printaud]'); if (pa) return UI.printDoc(auditDocHTML(S.getCompletedAudit(pa.dataset.printaud)));
    var da = t.closest('[data-delaud]'); if (da) { if (confirm('Delete this audit record?')) { S.removeCompletedAudit(da.dataset.delaud); renderList(); } return; }

    if (t.id === 'bld-add') { syncBuilderFromDom(); builderItems.push(newItem()); renderBuilderItems(); return; }
    if (t.classList && t.classList.contains('bld-del')) {
      syncBuilderFromDom(); builderItems.splice(Number(t.closest('.bld-row').dataset.i), 1);
      if (!builderItems.length) builderItems.push(newItem());
      renderBuilderItems(); return;
    }
    if (t.id === 'bld-cancel') { editingId = null; return renderList(); }
    if (t.id === 'bld-save') {
      syncBuilderFromDom();
      var title = $('#bld-title').value.trim();
      var items = builderItems.filter(function (it) { return it.text.trim(); });
      if (!title) { alert('Give the audit a title.'); return; }
      if (!items.length) { alert('Add at least one question.'); return; }
      var freq = $('#bld-freq').value, nextDue = $('#bld-nextdue').value;
      if (freq !== 'None' && !nextDue) nextDue = S.today();
      S.saveAuditTemplate({ id: editingId, title: title, category: $('#bld-category').value, items: items, schedule: { frequency: freq, nextDue: nextDue } });
      editingId = null; UI.toast('Audit type saved'); return renderList();
    }

    if (t.id === 'run-save') {
      var data = collectRun(); if (!data) return;
      var tplId = running.tpl.id;
      S.saveCompletedAudit(data); S.advanceSchedule(tplId); running = null;
      UI.toast('Audit saved (' + data.passRate + '%)'); maybeRaiseNCR(data); return renderList();
    }
    if (t.id === 'run-cancel') { running = null; return renderList(); }
  });

  function maybeRaiseNCR(data) {
    var fails = data.responses.filter(function (r) { return r.result === 'Fail'; });
    if (!fails.length) return;
    if (!confirm(fails.length + ' item(s) failed. Create a Non-Conformance report to track the fix?')) return;
    var types = S.reportTypes();
    var ncr = types.filter(function (t) { return /non-?conformance/i.test(t.id); })[0] || types[0];
    var desc = 'Raised from audit “' + data.templateTitle + '” (' + data.date + ').\nFailed checks:\n' +
      fails.map(function (f) { return '• ' + f.text + (f.value ? ' [' + f.value + ']' : '') + (f.comment ? ' — ' + f.comment : ''); }).join('\n');
    var rec = S.add({ type: ncr.id, category: data.category || 'Quality', title: 'Audit failures: ' + data.templateTitle,
      description: desc, location: data.location || '', reporter: data.auditor || 'Audit', severity: 3, dateOccurred: data.date, dateReported: data.date });
    S.logHistory(rec.id, 'Created from audit', data.templateTitle);
    UI.toast('Created ' + rec.refNo);
    if (UI.openCase) UI.openCase(rec.id);
  }

  function startRun(id) { var tpl = S.getAuditTemplate(id); if (tpl) running = { tpl: tpl }; }

  global.HSEQAudits = { render: render, startRun: startRun };
})(window);

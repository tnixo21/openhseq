/* ==========================================================================
   OpenHSEQ — audits.js
   Custom audit builder: define audit/inspection types, run them, keep records.
   ========================================================================== */
(function (global) {
  'use strict';
  var S = window.HSEQStore;
  var UI = window.HSEQUI;
  function esc(s) { return UI.esc(s); }
  function $(sel, root) { return (root || document).querySelector(sel); }

  var root;                 // #auditsRoot
  var builderItems = [];    // questions while building a template
  var editingId = null;     // template being edited
  var editingSchedule = { frequency: 'None', nextDue: '' };
  var running = null;       // { tpl, responses }

  /* -------------------------------- views --------------------------------- */
  function render() {
    root = document.getElementById('auditsRoot');
    if (running) return renderRun();
    renderList();
  }

  function renderList() {
    var tpls = S.auditTemplates();
    var done = S.completedAudits();

    var todayStr = S.today();
    var tplCards = tpls.length ? tpls.map(function (t) {
      var sched = t.schedule && t.schedule.frequency && t.schedule.frequency !== 'None';
      var due = sched && t.schedule.nextDue && t.schedule.nextDue <= todayStr;
      var schedLine = sched
        ? '<div class="muted">🔁 ' + esc(t.schedule.frequency) + ' · next: ' + esc(t.schedule.nextDue || '—') +
          (due ? ' <span class="badge badge-overdue">DUE</span>' : '') + '</div>'
        : '';
      return '<div class="audit-card' + (due ? ' is-due' : '') + '">' +
        '<div><strong>' + esc(t.title) + '</strong> <span class="badge type">' + esc(t.category) + '</span>' +
        '<div class="muted">' + t.items.length + ' check' + (t.items.length === 1 ? '' : 's') + '</div>' + schedLine + '</div>' +
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
      '<div class="card">' +
        '<div class="audit-head"><h3>Audit types</h3>' +
        '<button type="button" class="btn primary" id="aud-new">+ New audit type</button></div>' +
        '<div class="audit-grid">' + tplCards + '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h3>Completed audits</h3>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr>' +
        '<th>Audit</th><th>Date</th><th>Auditor</th><th>Location</th><th>Score</th><th>Actions</th>' +
        '</tr></thead><tbody>' + doneRows + '</tbody></table></div>' +
      '</div>';
  }

  function scoreBadge(p) {
    if (p == null) return '—';
    var cls = p >= 90 ? 'risk-low' : p >= 70 ? 'risk-medium' : 'risk-high';
    return '<span class="badge ' + cls + '">' + p + '%</span>';
  }

  /* ------------------------------- builder -------------------------------- */
  function renderBuilder(tpl) {
    editingId = tpl ? tpl.id : null;
    editingSchedule = tpl && tpl.schedule ? tpl.schedule : { frequency: 'None', nextDue: '' };
    builderItems = tpl ? tpl.items.map(function (i) { return { id: i.id, text: i.text, requireComment: !!i.requireComment }; }) : [{ id: S.uid('q'), text: '', requireComment: false }];
    var freqs = ['None'].concat(Object.keys(S.FREQ_DAYS));
    root.innerHTML =
      '<div class="card">' +
      '<h3>' + (tpl ? 'Edit' : 'New') + ' audit type</h3>' +
      '<div class="form-grid">' +
      '<label>Audit title *<input type="text" id="bld-title" value="' + esc(tpl ? tpl.title : '') + '" placeholder="e.g. Loading Dock Safety Inspection" /></label>' +
      '<label>Category<select id="bld-category">' + S.CATEGORIES.map(function (c) {
        return '<option' + (tpl && tpl.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('') + '</select></label>' +
      '<label>Recurs<select id="bld-freq">' + freqs.map(function (f) { return '<option' + (editingSchedule.frequency === f ? ' selected' : '') + '>' + f + '</option>'; }).join('') + '</select></label>' +
      '<label>Next due<input type="date" id="bld-nextdue" value="' + esc(editingSchedule.nextDue || '') + '" /></label>' +
      '</div>' +
      '<h4>Checklist questions</h4>' +
      '<div id="bld-items"></div>' +
      '<button type="button" class="btn small" id="bld-add">+ Add question</button>' +
      '<div class="form-actions"><button type="button" class="btn primary" id="bld-save">Save audit type</button>' +
      '<button type="button" class="btn" id="bld-cancel">Cancel</button></div>' +
      '</div>';
    renderBuilderItems();
  }

  function renderBuilderItems() {
    $('#bld-items').innerHTML = builderItems.map(function (it, i) {
      return '<div class="bld-row" data-i="' + i + '">' +
        '<span class="bld-num">' + (i + 1) + '</span>' +
        '<input type="text" class="bld-text" value="' + esc(it.text) + '" placeholder="Question / check" aria-label="Question ' + (i + 1) + '" />' +
        '<label class="bld-req"><input type="checkbox" class="bld-cmt"' + (it.requireComment ? ' checked' : '') + ' /> comment</label>' +
        '<button type="button" class="btn small danger bld-del" aria-label="Remove">×</button>' +
        '</div>';
    }).join('');
  }

  function syncBuilderFromDom() {
    $('#bld-items') && Array.prototype.forEach.call(document.querySelectorAll('#bld-items .bld-row'), function (row) {
      var i = Number(row.dataset.i);
      builderItems[i].text = row.querySelector('.bld-text').value;
      builderItems[i].requireComment = row.querySelector('.bld-cmt').checked;
    });
  }

  /* --------------------------------- run ---------------------------------- */
  function renderRun() {
    var tpl = running.tpl;
    root.innerHTML =
      '<div class="card">' +
      '<h3>Run audit: ' + esc(tpl.title) + '</h3>' +
      '<div class="form-grid">' +
      '<label>Auditor<input type="text" id="run-auditor" list="people" /></label>' +
      '<label>Location<input type="text" id="run-location" list="locations" /></label>' +
      '<label>Date<input type="date" id="run-date" value="' + new Date().toISOString().slice(0, 10) + '" /></label>' +
      '</div>' +
      '<div class="run-items">' + tpl.items.map(function (it, i) {
        return '<div class="run-row" data-i="' + i + '">' +
          '<div class="run-q">' + (i + 1) + '. ' + esc(it.text) + (it.requireComment ? ' <span class="muted">(comment required)</span>' : '') + '</div>' +
          '<div class="run-opts">' +
          ['Pass', 'Fail', 'N/A'].map(function (opt) {
            return '<label class="run-opt opt-' + opt.replace('/', '') + '"><input type="radio" name="q' + i + '" value="' + opt + '" /> ' + opt + '</label>';
          }).join('') +
          '</div>' +
          '<input type="text" class="run-comment" placeholder="Comment" aria-label="Comment ' + (i + 1) + '" />' +
          '</div>';
      }).join('') + '</div>' +
      '<div class="form-actions"><button type="button" class="btn primary" id="run-save">Save audit</button>' +
      '<button type="button" class="btn" id="run-cancel">Cancel</button></div>' +
      '</div>';
  }

  function collectRun() {
    var tpl = running.tpl, ok = true;
    var responses = tpl.items.map(function (it, i) {
      var sel = document.querySelector('input[name="q' + i + '"]:checked');
      var row = document.querySelector('.run-row[data-i="' + i + '"]');
      var comment = row.querySelector('.run-comment').value.trim();
      var result = sel ? sel.value : '';
      if (it.requireComment && result && result !== 'N/A' && !comment) ok = false;
      return { text: it.text, result: result, comment: comment };
    });
    var answered = responses.filter(function (r) { return r.result; }).length;
    if (answered < tpl.items.length) { alert('Please answer every question.'); return null; }
    if (!ok) { alert('Some questions need a comment.'); return null; }
    var pass = responses.filter(function (r) { return r.result === 'Pass'; }).length;
    var fail = responses.filter(function (r) { return r.result === 'Fail'; }).length;
    var denom = pass + fail;
    return {
      templateId: tpl.id, templateTitle: tpl.title, category: tpl.category,
      auditor: $('#run-auditor').value.trim(), location: $('#run-location').value.trim(),
      date: $('#run-date').value || new Date().toISOString().slice(0, 10),
      responses: responses, passRate: denom ? Math.round(pass / denom * 100) : 100
    };
  }

  /* ------------------------------ view/print ------------------------------ */
  function auditDocHTML(a) {
    var rows = a.responses.map(function (r, i) {
      var cls = r.result === 'Pass' ? 'risk-low' : r.result === 'Fail' ? 'risk-high' : '';
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.text) + '</td><td>' +
        (cls ? '<span class="badge ' + cls + '">' + esc(r.result) + '</span>' : esc(r.result)) +
        '</td><td>' + esc(r.comment || '—') + '</td></tr>';
    }).join('');
    return '<div class="print-report"><h1>Audit — ' + esc(a.templateTitle) + '</h1>' +
      '<p>' + esc(a.category || '') + ' · ' + esc(a.date) + ' · Auditor: ' + esc(a.auditor || '—') +
      ' · Location: ' + esc(a.location || '—') + ' · Score: <strong>' + a.passRate + '%</strong></p>' +
      '<table class="print-table"><thead><tr><th>#</th><th>Check</th><th>Result</th><th>Comment</th></tr></thead><tbody>' +
      rows + '</tbody></table>' +
      '<p class="print-foot">Generated by OpenHSEQ · ' + new Date().toLocaleString() + '</p></div>';
  }

  function viewAudit(a) {
    $('#modalBody').innerHTML = auditDocHTML(a) +
      '<div class="form-actions"><button type="button" class="btn" id="modal-print-audit">⬇ Download / Print PDF</button></div>';
    $('#modalBody').removeAttribute('data-id');
    $('#modal').hidden = false;
    var pb = document.getElementById('modal-print-audit');
    if (pb) pb.onclick = function () { UI.printDoc(auditDocHTML(a)); };
  }

  /* ------------------------------- events --------------------------------- */
  document.addEventListener('click', function (e) {
    if (!root) root = document.getElementById('auditsRoot');
    var t = e.target;

    // list actions
    if (t.id === 'aud-new') return renderBuilder(null);
    var run = t.closest('[data-run]'); if (run) { running = { tpl: S.getAuditTemplate(run.dataset.run) }; return renderRun(); }
    var ed = t.closest('[data-edit]'); if (ed) return renderBuilder(S.getAuditTemplate(ed.dataset.edit));
    var dt = t.closest('[data-deltpl]'); if (dt) { if (confirm('Delete this audit type?')) { S.removeAuditTemplate(dt.dataset.deltpl); renderList(); } return; }
    var va = t.closest('[data-viewaud]'); if (va) return viewAudit(S.getCompletedAudit(va.dataset.viewaud));
    var pa = t.closest('[data-printaud]'); if (pa) return UI.printDoc(auditDocHTML(S.getCompletedAudit(pa.dataset.printaud)));
    var da = t.closest('[data-delaud]'); if (da) { if (confirm('Delete this audit record?')) { S.removeCompletedAudit(da.dataset.delaud); renderList(); } return; }

    // builder actions
    if (t.id === 'bld-add') { syncBuilderFromDom(); builderItems.push({ id: S.uid('q'), text: '', requireComment: false }); renderBuilderItems(); return; }
    if (t.classList && t.classList.contains('bld-del')) {
      syncBuilderFromDom();
      var i = Number(t.closest('.bld-row').dataset.i);
      builderItems.splice(i, 1);
      if (!builderItems.length) builderItems.push({ id: S.uid('q'), text: '', requireComment: false });
      renderBuilderItems();
      return;
    }
    if (t.id === 'bld-cancel') { editingId = null; return renderList(); }
    if (t.id === 'bld-save') {
      syncBuilderFromDom();
      var title = $('#bld-title').value.trim();
      var items = builderItems.filter(function (it) { return it.text.trim(); });
      if (!title) { alert('Give the audit a title.'); return; }
      if (!items.length) { alert('Add at least one question.'); return; }
      var freq = $('#bld-freq').value;
      var nextDue = $('#bld-nextdue').value;
      if (freq !== 'None' && !nextDue) nextDue = S.today();
      S.saveAuditTemplate({ id: editingId, title: title, category: $('#bld-category').value, items: items,
        schedule: { frequency: freq, nextDue: nextDue } });
      editingId = null;
      UI.toast('Audit type saved');
      return renderList();
    }

    // run actions
    if (t.id === 'run-save') {
      var data = collectRun();
      if (!data) return;
      var tplId = running.tpl.id;
      S.saveCompletedAudit(data);
      S.advanceSchedule(tplId);             // move recurring schedule forward
      running = null;
      UI.toast('Audit saved (' + data.passRate + '%)');
      maybeRaiseNCR(data);                  // offer to log failures as a report
      return renderList();
    }
    if (t.id === 'run-cancel') { running = null; return renderList(); }
  });

  /* If an audit has failures, offer to log them as a Non-Conformance report. */
  function maybeRaiseNCR(data) {
    var fails = data.responses.filter(function (r) { return r.result === 'Fail'; });
    if (!fails.length) return;
    if (!confirm(fails.length + ' item(s) failed. Create a Non-Conformance report to track the fix?')) return;
    var types = S.reportTypes();
    var ncr = types.filter(function (t) { return /non-?conformance/i.test(t.id); })[0] || types[0];
    var desc = 'Raised from audit “' + data.templateTitle + '” (' + data.date + ').\nFailed checks:\n' +
      fails.map(function (f) { return '• ' + f.text + (f.comment ? ' — ' + f.comment : ''); }).join('\n');
    var rec = S.add({
      type: ncr.id, category: data.category || 'Quality',
      title: 'Audit failures: ' + data.templateTitle,
      description: desc, location: data.location || '', reporter: data.auditor || 'Audit',
      severity: 3, dateOccurred: data.date, dateReported: data.date
    });
    S.logHistory(rec.id, 'Created from audit', data.templateTitle);
    UI.toast('Created ' + rec.refNo);
    if (UI.openCase) UI.openCase(rec.id);
  }

  /* let the Quick Hub launch a run directly; show('audits') then renders it */
  function startRun(id) { var tpl = S.getAuditTemplate(id); if (tpl) running = { tpl: tpl }; }

  global.HSEQAudits = { render: render, startRun: startRun };
})(window);

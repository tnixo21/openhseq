/* ==========================================================================
   OpenHSEQ — app.js
   Routing, staged reporting, cases, risk matrix, report builder, data tools.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.HSEQStore, C = window.HSEQCharts;

  /* ------------------------------- helpers -------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function statusClass(s) { return 'status-' + String(s).replace(/\s+/g, ''); }
  function riskLabel(r) {
    if (r.riskScore == null) return '<span class="badge risk-untriaged">Untriaged · sev ' + (r.severity || '?') + '</span>';
    var b = S.riskBand(r.riskScore);
    return '<span class="badge ' + b.cls + '">' + r.riskScore + ' ' + b.label + '</span>';
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2400);
  }

  /* print any HTML doc as a standalone page (single report / audit) */
  function printDoc(html) {
    $('#printRoot').innerHTML = html;
    document.body.classList.add('print-single');
    window.onafterprint = function () {
      document.body.classList.remove('print-single');
      $('#printRoot').innerHTML = '';
      window.onafterprint = null;
    };
    window.print();
  }

  /* ------------------------------- routing -------------------------------- */
  function show(view) {
    $all('.view').forEach(function (v) { v.classList.remove('active'); });
    var target = $('#view-' + view);
    if (target) target.classList.add('active');
    $all('.nav-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    if (view === 'dashboard') renderDashboard();
    if (view === 'cases') renderCases();
    if (view === 'risk') renderMatrix();
    if (view === 'audits' && window.HSEQAudits) window.HSEQAudits.render();
    if (view === 'new' && !$('#f-id').value) resetForm();
    window.scrollTo(0, 0);
  }
  $('#nav').addEventListener('click', function (e) {
    var btn = e.target.closest('.nav-btn');
    if (btn) show(btn.dataset.view);
  });

  /* --------------------------- populate selects --------------------------- */
  function fillOptions(sel, values, opts) {
    opts = opts || {};
    var html = (opts.placeholder ? '<option value="">' + opts.placeholder + '</option>' : '');
    html += values.map(function (v) {
      return '<option value="' + esc(v) + '"' + (opts.selected === v ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
    sel.innerHTML = html;
  }
  function dataListHTML(values) { return values.map(function (v) { return '<option value="' + esc(v) + '">'; }).join(''); }

  function initSelects() {
    var types = S.REPORT_TYPES.map(function (t) { return t.id; });
    fillOptions($('#f-type'), types);
    fillOptions($('#f-category'), S.CATEGORIES);
    fillOptions($('#flt-type'), types, { placeholder: 'All types' });
    fillOptions($('#flt-status'), S.STATUSES, { placeholder: 'All statuses' });
    fillOptions($('#rep-type'), types, { placeholder: 'All types' });
    fillOptions($('#rep-status'), S.STATUSES, { placeholder: 'All statuses' });
    $('#locations').innerHTML = dataListHTML(S.DEMO_LOCATIONS);
    $('#people').innerHTML = dataListHTML(S.DEMO_PEOPLE);
    $('#customers').innerHTML = dataListHTML(S.DEMO_CUSTOMERS.filter(Boolean));
    refreshDynamicFilters();
  }

  function refreshDynamicFilters() {
    var locs = {}, custs = {};
    S.all().forEach(function (r) { if (r.location) locs[r.location] = 1; if (r.customer) custs[r.customer] = 1; });
    fillOptions($('#flt-location'), Object.keys(locs).sort(), { placeholder: 'All locations' });
    fillOptions($('#rep-location'), Object.keys(locs).sort(), { placeholder: 'All locations' });
    $('#customers').innerHTML = dataListHTML(Object.keys(custs).concat(S.DEMO_CUSTOMERS.filter(Boolean)).filter(function (v, i, a) { return a.indexOf(v) === i; }));
  }

  /* ------------------------------ Dashboard ------------------------------- */
  function renderDashboard() {
    var list = S.all();
    renderKPIs(list);
    renderDaysSince(list);
    C.renderAll(list);
  }

  function renderKPIs(list) {
    var open = list.filter(function (r) { return r.status === 'Open'; }).length;
    var inProg = list.filter(function (r) { return r.status === 'In Progress'; }).length;
    var closed = list.filter(function (r) { return r.status === 'Closed'; }).length;
    var highRiskOpen = list.filter(function (r) { return r.status !== 'Closed' && r.riskScore >= 10; }).length;
    var untriaged = list.filter(function (r) { return r.status !== 'Closed' && r.riskScore == null; }).length;
    var accidents = list.filter(function (r) { return r.type === 'Accident'; }).length;
    var nearMiss = list.filter(function (r) { return r.type === 'Near Miss'; }).length;
    var nmRatio = accidents ? (nearMiss / accidents).toFixed(1) : nearMiss ? '∞' : '—';
    var closedRecs = list.filter(function (r) { return r.status === 'Closed' && r.dateClosed; });
    var avgClose = closedRecs.length
      ? Math.round(closedRecs.reduce(function (a, r) { return a + Math.max(0, S.daysBetween(r.dateReported, r.dateClosed)); }, 0) / closedRecs.length)
      : '—';

    var cards = [
      { v: list.length, l: 'Total reports', cls: 'accent' },
      { v: open, l: 'Open', cls: 'danger' },
      { v: inProg, l: 'In progress', cls: 'warn' },
      { v: closed, l: 'Closed', cls: 'ok' },
      { v: untriaged, l: 'Awaiting triage', cls: 'warn' },
      { v: highRiskOpen, l: 'High/Extreme open', cls: 'danger' },
      { v: nmRatio, l: 'Near-miss : accident', sub: 'leading indicator', cls: '' },
      { v: avgClose, l: 'Avg days to close', cls: '' }
    ];
    $('#kpiGrid').innerHTML = cards.map(function (c) {
      return '<div class="kpi ' + c.cls + '"><div class="kpi-val">' + c.v + '</div>' +
        '<div class="kpi-lbl">' + c.l + '</div>' + (c.sub ? '<div class="kpi-sub muted">' + c.sub + '</div>' : '') + '</div>';
    }).join('');
  }

  function renderDaysSince(list) {
    var rec = list.filter(function (r) { return S.typeMeta(r.type).recordable; })
      .sort(function (a, b) { return new Date(b.dateOccurred) - new Date(a.dateOccurred); });
    $('#daysSinceIncident').textContent = rec.length
      ? Math.max(0, S.daysBetween(rec[0].dateOccurred, new Date().toISOString().slice(0, 10))) : '—';
  }

  /* --------------------------- Raise report ------------------------------- */
  var form = $('#reportForm');
  var pendingAttachments = [];

  function resetForm() {
    form.reset();
    $('#f-id').value = '';
    $('#f-dateOccurred').value = new Date().toISOString().slice(0, 10);
    $('#f-severity').value = '3';
    $('#formTitle').textContent = 'Raise a Report';
    pendingAttachments = [];
    renderAttachStaging();
  }

  function loadForEdit(rec) {
    $('#f-id').value = rec.id;
    $('#f-type').value = rec.type;
    $('#f-category').value = rec.category;
    $('#f-title').value = rec.title;
    $('#f-description').value = rec.description || '';
    $('#f-customer').value = rec.customer || '';
    $('#f-severity').value = rec.severity || rec.consequence || 3;
    $('#f-location').value = rec.location;
    $('#f-department').value = rec.department || '';
    $('#f-dateOccurred').value = rec.dateOccurred;
    $('#f-reporter').value = rec.reporter;
    $('#f-assignedTo').value = rec.assignedTo || '';
    $('#f-notifyEmail').value = rec.notifyEmail || '';
    $('#formTitle').textContent = 'Edit ' + rec.refNo;
    pendingAttachments = (rec.attachments || []).slice();
    renderAttachStaging();
    show('new');
  }

  function renderAttachStaging() {
    $('#attachList').innerHTML = pendingAttachments.map(function (a, i) {
      return '<span class="attach-chip">' + esc(a.name) +
        ' <button type="button" class="attach-x" data-i="' + i + '" aria-label="Remove">×</button></span>';
    }).join('');
  }
  $('#attachList').addEventListener('click', function (e) {
    var b = e.target.closest('.attach-x');
    if (b) { pendingAttachments.splice(Number(b.dataset.i), 1); renderAttachStaging(); }
  });

  $('#f-attachments').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files);
    files.forEach(function (file) {
      if (file.size > 2 * 1024 * 1024) { alert('“' + file.name + '” is over 2 MB — skipped. Keep attachments small (no server to store them).'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        pendingAttachments.push({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
        renderAttachStaging();
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {
      type: $('#f-type').value,
      category: $('#f-category').value,
      title: $('#f-title').value.trim(),
      description: $('#f-description').value.trim(),
      customer: $('#f-customer').value.trim(),
      severity: Number($('#f-severity').value),
      location: $('#f-location').value.trim(),
      department: $('#f-department').value.trim(),
      dateOccurred: $('#f-dateOccurred').value,
      dateReported: $('#f-dateOccurred').value,
      reporter: $('#f-reporter').value.trim(),
      assignedTo: $('#f-assignedTo').value.trim(),
      notifyEmail: $('#f-notifyEmail').value.trim(),
      attachments: pendingAttachments.slice()
    };
    var id = $('#f-id').value;
    if (id) { S.update(id, data); toast('Report updated'); }
    else { var rec = S.add(data); toast('Submitted ' + rec.refNo + (data.notifyEmail ? ' (email queued for when live)' : '')); }
    refreshDynamicFilters();
    resetForm();
    show('cases');
  });
  $('#formReset').addEventListener('click', resetForm);

  /* -------------------------------- Cases --------------------------------- */
  function currentFilters() {
    return {
      q: $('#flt-search').value.toLowerCase().trim(),
      type: $('#flt-type').value, status: $('#flt-status').value,
      location: $('#flt-location').value, risk: $('#flt-risk').value
    };
  }
  function applyFilters(list, f) {
    return list.filter(function (r) {
      if (f.type && r.type !== f.type) return false;
      if (f.status && r.status !== f.status) return false;
      if (f.location && r.location !== f.location) return false;
      if (f.risk) {
        var label = r.riskScore == null ? 'Untriaged' : S.riskBand(r.riskScore).label;
        if (label !== f.risk) return false;
      }
      if (f.q) {
        var hay = (r.refNo + ' ' + r.title + ' ' + r.reporter + ' ' + (r.customer || '') + ' ' + r.location).toLowerCase();
        if (hay.indexOf(f.q) === -1) return false;
      }
      return true;
    });
  }

  function renderCases() {
    var rows = applyFilters(S.all(), currentFilters());
    var tbody = $('#casesTable tbody');
    $('#casesCount').textContent = rows.length + ' of ' + S.all().length + ' reports';
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">No reports match. Try “Load demo data” under Data, or Raise a Report.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      return '<tr data-id="' + r.id + '">' +
        '<td><strong>' + esc(r.refNo) + '</strong></td>' +
        '<td><span class="badge type">' + esc(r.type) + '</span></td>' +
        '<td class="wrap">' + esc(r.title) + (r.attachments && r.attachments.length ? ' 📎' : '') + '</td>' +
        '<td>' + esc(r.customer || '—') + '</td>' +
        '<td>' + esc(r.location) + '</td>' +
        '<td>' + esc(r.dateReported) + '</td>' +
        '<td>' + riskLabel(r) + '</td>' +
        '<td><span class="badge ' + statusClass(r.status) + '">' + esc(r.status) + '</span></td>' +
        '<td><button type="button" class="btn link" data-act="view">View</button></td>' +
        '</tr>';
    }).join('');
  }

  $('#casesTable').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-id]');
    if (tr) openDetail(tr.dataset.id);
  });
  ['flt-search', 'flt-type', 'flt-status', 'flt-location', 'flt-risk'].forEach(function (id) {
    $('#' + id).addEventListener('input', renderCases);
  });
  $('#flt-clear').addEventListener('click', function () {
    ['flt-search', 'flt-type', 'flt-status', 'flt-location', 'flt-risk'].forEach(function (id) { $('#' + id).value = ''; });
    renderCases();
  });

  /* ----------------------------- Detail modal ----------------------------- */
  function field(k, v) { return '<div class="field"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }

  function attachmentsHTML(rec) {
    if (!rec.attachments || !rec.attachments.length) return '';
    var items = rec.attachments.map(function (a, i) {
      var thumb = /^image\//.test(a.type)
        ? '<img src="' + a.dataUrl + '" alt="' + esc(a.name) + '" />'
        : '<span class="file-ico">📄</span>';
      return '<a class="attach-item" href="' + a.dataUrl + '" download="' + esc(a.name) + '" title="Download ' + esc(a.name) + '">' +
        thumb + '<span>' + esc(a.name) + '</span></a>';
    }).join('');
    return '<div class="field span2"><div class="k">Attachments (' + rec.attachments.length + ')</div><div class="attach-gallery">' + items + '</div></div>';
  }

  function processingPanel(r) {
    // Stage-specific data entry that gates the status transition.
    if (r.status === 'Open') {
      return '<div class="stage-box" data-stage="triage">' +
        '<h3>Triage → move to In Progress</h3>' +
        '<p class="muted">Add the assessment detail to start working the case.</p>' +
        '<div class="form-grid">' +
        '<label>Likelihood (1–5) *<select id="p-likelihood">' +
          [1,2,3,4,5].map(function (n) { return '<option value="' + n + '"' + (n === 3 ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
        '</select></label>' +
        '<label>Root cause<select id="p-rootCause"><option value="">—</option>' +
          S.ROOT_CAUSES.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="span2">Immediate action taken<textarea id="p-immediate" rows="2"></textarea></label>' +
        '</div>' +
        '<button type="button" class="btn primary" data-act="save-triage">Save &amp; move to In Progress</button>' +
        '</div>';
    }
    if (r.status === 'In Progress') {
      return '<div class="stage-box" data-stage="close">' +
        '<h3>Close out → add corrective action</h3>' +
        '<div class="form-grid">' +
        '<label class="span2">Corrective action *<textarea id="p-corrective" rows="3">' + esc(r.correctiveAction || '') + '</textarea></label>' +
        '</div>' +
        '<button type="button" class="btn primary" data-act="save-close">Save &amp; close case</button> ' +
        '<button type="button" class="btn" data-act="reopen-open">↩ Back to Open</button>' +
        '</div>';
    }
    return '<div class="stage-box"><button type="button" class="btn" data-act="reopen-progress">↩ Re-open case</button></div>';
  }

  function openDetail(id) {
    var r = S.get(id);
    if (!r) return;
    var body = '<h2>' + esc(r.refNo) + ' <span class="badge type">' + esc(r.type) + '</span> ' +
      '<span class="badge ' + statusClass(r.status) + '">' + esc(r.status) + '</span></h2>' +
      '<p class="muted">' + esc(r.title) + '</p>' +
      '<div class="detail-grid">' +
      field('Risk', riskLabel(r) + (r.likelihood ? ' (L' + r.likelihood + '×C' + r.consequence + ')' : '')) +
      field('How bad (severity)', (r.severity || r.consequence || '?') + ' — ' + (S.SEVERITY_LABELS[r.severity || r.consequence] || '')) +
      field('Category', esc(r.category)) +
      field('Customer', esc(r.customer || '—')) +
      field('Location', esc(r.location)) +
      field('Department', esc(r.department || '—')) +
      field('Reported by', esc(r.reporter)) +
      field('Assigned to', esc(r.assignedTo || '—')) +
      field('Date occurred', esc(r.dateOccurred)) +
      field('Email copy to', esc(r.notifyEmail || '—')) +
      field('Root cause', esc(r.rootCause || '—')) +
      (r.dateClosed ? field('Date closed', esc(r.dateClosed)) : '') +
      '<div class="field span2"><div class="k">Description</div><div class="v">' + esc(r.description || '—') + '</div></div>' +
      (r.immediateAction ? '<div class="field span2"><div class="k">Immediate action</div><div class="v">' + esc(r.immediateAction) + '</div></div>' : '') +
      (r.correctiveAction ? '<div class="field span2"><div class="k">Corrective action</div><div class="v">' + esc(r.correctiveAction) + '</div></div>' : '') +
      attachmentsHTML(r) +
      '</div>' +
      processingPanel(r) +
      '<div class="form-actions">' +
      '<button type="button" class="btn" data-act="print">⬇ Download / Print PDF</button>' +
      '<button type="button" class="btn" data-act="edit">Edit details</button>' +
      '<button type="button" class="btn danger" data-act="delete">Delete</button>' +
      '</div>';
    $('#modalBody').innerHTML = body;
    $('#modalBody').dataset.id = id;
    $('#modal').hidden = false;
  }

  $('#modalBody').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var id = $('#modalBody').dataset.id;
    var act = btn.dataset.act;
    if (act === 'edit') { closeModal(); loadForEdit(S.get(id)); }
    else if (act === 'delete') {
      if (confirm('Delete this report permanently?')) { S.remove(id); closeModal(); refreshDynamicFilters(); renderCases(); toast('Deleted'); }
    } else if (act === 'print') { printSingle(S.get(id)); }
    else if (act === 'save-triage') {
      var lk = Number($('#p-likelihood').value);
      S.update(id, { likelihood: lk, rootCause: $('#p-rootCause').value, immediateAction: $('#p-immediate').value.trim(), status: 'In Progress' });
      openDetail(id); renderCases(); toast('Moved to In Progress');
    } else if (act === 'save-close') {
      var ca = $('#p-corrective').value.trim();
      if (!ca) { alert('Add a corrective action before closing.'); return; }
      S.update(id, { correctiveAction: ca, status: 'Closed' });
      openDetail(id); renderCases(); toast('Case closed');
    } else if (act === 'reopen-open') { S.update(id, { status: 'Open' }); openDetail(id); renderCases(); toast('Back to Open'); }
    else if (act === 'reopen-progress') { S.update(id, { status: 'In Progress' }); openDetail(id); renderCases(); toast('Re-opened'); }
  });
  function closeModal() { $('#modal').hidden = true; }
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', function (e) { if (e.target === $('#modal')) closeModal(); });

  /* ---------------------- single-record print / PDF ----------------------- */
  function printSingle(r) {
    if (!r) return;
    function row(k, v) { return '<tr><th>' + k + '</th><td>' + esc(v == null || v === '' ? '—' : v) + '</td></tr>'; }
    var imgs = (r.attachments || []).filter(function (a) { return /^image\//.test(a.type); })
      .map(function (a) { return '<img src="' + a.dataUrl + '" style="max-width:240px;margin:6px;border:1px solid #ccc"/>'; }).join('');
    var html = '<div class="print-report">' +
      '<h1>HSEQ Report ' + esc(r.refNo) + '</h1>' +
      '<p><strong>' + esc(r.type) + '</strong> · ' + esc(r.status) + '</p>' +
      '<h2>' + esc(r.title) + '</h2>' +
      '<table class="print-table">' +
      row('Reference', r.refNo) + row('Type', r.type) + row('Category', r.category) +
      row('Customer', r.customer) + row('Location', r.location) + row('Department', r.department) +
      row('Reported by', r.reporter) + row('Assigned to', r.assignedTo) +
      row('Date occurred', r.dateOccurred) + row('Severity', (r.severity || r.consequence || '') + ' ' + (S.SEVERITY_LABELS[r.severity || r.consequence] || '')) +
      row('Risk score', r.riskScore == null ? 'Untriaged' : r.riskScore + ' (' + S.riskBand(r.riskScore).label + ')') +
      row('Root cause', r.rootCause) + row('Status', r.status) + row('Date closed', r.dateClosed) +
      '</table>' +
      '<h3>Description</h3><p>' + esc(r.description || '—') + '</p>' +
      '<h3>Immediate action</h3><p>' + esc(r.immediateAction || '—') + '</p>' +
      '<h3>Corrective action</h3><p>' + esc(r.correctiveAction || '—') + '</p>' +
      (imgs ? '<h3>Attachments</h3>' + imgs : '') +
      '<p class="print-foot">Generated by OpenHSEQ · ' + new Date().toLocaleString() + '</p>' +
      '</div>';
    printDoc(html);
  }

  /* ----------------------------- Risk matrix ------------------------------ */
  function renderMatrix() {
    var open = S.all().filter(function (r) { return r.status !== 'Closed' && r.likelihood && r.consequence; });
    var untriaged = S.all().filter(function (r) { return r.status !== 'Closed' && r.riskScore == null; }).length;
    var grid = $('#riskMatrix');
    var html = '<div class="axis corner"></div>';
    for (var l = 1; l <= 5; l++) html += '<div class="axis">L' + l + '</div>';
    for (var c = 5; c >= 1; c--) {
      html += '<div class="axis">C' + c + '</div>';
      for (var lk = 1; lk <= 5; lk++) {
        var score = lk * c, band = S.riskBand(score);
        var n = open.filter(function (r) { return Number(r.likelihood) === lk && Number(r.consequence) === c; }).length;
        html += '<div class="cell ' + band.cls + '" data-l="' + lk + '" data-c="' + c + '">' + (n || '') + '<small>' + score + '</small></div>';
      }
    }
    grid.innerHTML = html;
    $('#untriagedNote').textContent = untriaged ? (untriaged + ' open report(s) awaiting triage — not yet plotted') : '';
  }
  $('#riskMatrix').addEventListener('click', function (e) {
    var cell = e.target.closest('.cell');
    if (!cell) return;
    var l = cell.dataset.l, c = cell.dataset.c;
    var matches = S.all().filter(function (r) {
      return r.status !== 'Closed' && String(r.likelihood) === l && String(r.consequence) === c;
    });
    if (!matches.length) { toast('No open reports in that cell'); return; }
    $('#modalBody').innerHTML = '<h2>Open reports — L' + l + ' × C' + c + '</h2><ul class="ref-list">' +
      matches.map(function (r) {
        return '<li><button type="button" class="btn link" data-open="' + r.id + '"><strong>' + esc(r.refNo) + '</strong></button> ' + esc(r.title) + '</li>';
      }).join('') + '</ul>';
    $('#modalBody').removeAttribute('data-id');
    $('#modal').hidden = false;
  });
  $('#modalBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]');
    if (b) openDetail(b.dataset.open);
  });

  /* ---------------------------- Report builder ---------------------------- */
  function reportFilteredList() {
    var from = $('#rep-from').value, to = $('#rep-to').value;
    var type = $('#rep-type').value, status = $('#rep-status').value, loc = $('#rep-location').value;
    return S.all().filter(function (r) {
      if (from && r.dateReported < from) return false;
      if (to && r.dateReported > to) return false;
      if (type && r.type !== type) return false;
      if (status && r.status !== status) return false;
      if (loc && r.location !== loc) return false;
      return true;
    });
  }
  function sItem(v, l) { return '<div class="s-item"><div class="s-val">' + v + '</div><div class="s-lbl">' + l + '</div></div>'; }

  function runReport() {
    var list = reportFilteredList();
    var out = $('#reportOutput');
    if (!list.length) { out.innerHTML = '<div class="card empty">No reports in this range.</div>'; return; }
    var open = list.filter(function (r) { return r.status === 'Open'; }).length;
    var closed = list.filter(function (r) { return r.status === 'Closed'; }).length;
    var highRisk = list.filter(function (r) { return r.riskScore >= 10; }).length;
    var from = $('#rep-from').value || 'start', to = $('#rep-to').value || 'today';
    var byType = {};
    list.forEach(function (r) { byType[r.type] = (byType[r.type] || 0) + 1; });

    var rowsHtml = list.map(function (r) {
      var band = r.riskScore == null ? { cls: 'risk-untriaged', label: 'Untriaged' } : S.riskBand(r.riskScore);
      return '<tr><td>' + esc(r.refNo) + '</td><td>' + esc(r.type) + '</td><td>' + esc(r.title) +
        '</td><td>' + esc(r.customer || '—') + '</td><td>' + esc(r.location) + '</td><td>' + esc(r.dateReported) +
        '</td><td><span class="badge ' + band.cls + '">' + band.label + '</span></td><td>' + esc(r.status) + '</td></tr>';
    }).join('');

    out.innerHTML = '<div class="report-doc">' +
      '<h2>HSEQ Summary Report</h2>' +
      '<p class="muted">Period: ' + esc(from) + ' → ' + esc(to) +
      ($('#rep-type').value ? ' · Type: ' + esc($('#rep-type').value) : '') +
      ($('#rep-status').value ? ' · Status: ' + esc($('#rep-status').value) : '') +
      ($('#rep-location').value ? ' · Location: ' + esc($('#rep-location').value) : '') + '</p>' +
      '<div class="report-summary">' + sItem(list.length, 'Total') + sItem(open, 'Open') + sItem(closed, 'Closed') + sItem(highRisk, 'High/Extreme') + '</div>' +
      '<h3>Breakdown by type</h3><ul>' + Object.keys(byType).map(function (t) { return '<li>' + esc(t) + ': <strong>' + byType[t] + '</strong></li>'; }).join('') + '</ul>' +
      '<h3>Detail</h3><div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Ref</th><th>Type</th><th>Title</th><th>Customer</th><th>Location</th><th>Reported</th><th>Risk</th><th>Status</th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div></div>';
  }
  $('#rep-run').addEventListener('click', runReport);
  $('#rep-print').addEventListener('click', function () { runReport(); window.print(); });
  $('#rep-csv').addEventListener('click', function () { exportCSV(reportFilteredList()); });

  function exportCSV(list) {
    if (!list.length) { toast('Nothing to export'); return; }
    var cols = ['refNo', 'type', 'category', 'title', 'customer', 'location', 'department', 'reporter', 'assignedTo',
      'dateOccurred', 'dateReported', 'severity', 'likelihood', 'consequence', 'riskScore', 'rootCause',
      'status', 'dateClosed', 'correctiveAction'];
    var rows = [cols.join(',')];
    list.forEach(function (r) {
      rows.push(cols.map(function (c) {
        var v = r[c] == null ? '' : String(r[c]).replace(/"/g, '""');
        return /[",\n]/.test(v) ? '"' + v + '"' : v;
      }).join(','));
    });
    download('hseq-report.csv', rows.join('\n'), 'text/csv');
    toast('CSV exported (' + list.length + ' rows)');
  }
  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain' });
    var a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* -------------------------------- Data ---------------------------------- */
  $('#data-seed').addEventListener('click', function () {
    if (S.all().length && !confirm('This adds demo data on top of existing reports. Continue?')) return;
    var n = S.seedDemo(42); initSelects(); toast('Loaded ' + n + ' demo reports'); show('dashboard');
  });
  $('#data-clear').addEventListener('click', function () {
    if (!confirm('Delete ALL reports? This cannot be undone.')) return;
    S.clear(); initSelects(); toast('All data cleared'); renderDashboard();
  });
  $('#data-export').addEventListener('click', function () { download('openhseq-backup.json', S.exportJSON(), 'application/json'); toast('Backup exported'); });
  $('#data-import').addEventListener('click', function () { $('#importFile').click(); });
  $('#importFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var n = S.importJSON(reader.result, confirm('OK = replace all data, Cancel = merge with existing.'));
        initSelects(); toast('Imported — ' + n + ' total reports'); show('dashboard');
      } catch (err) { alert('Import failed: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* shared helpers for the audits module */
  window.HSEQUI = { toast: toast, printDoc: printDoc, esc: esc };

  /* -------------------------------- Boot ---------------------------------- */
  function boot() {
    S.seedAuditTemplates();
    initSelects();
    resetForm();
    if (!S.all().length) { S.seedDemo(42); initSelects(); }
    show('dashboard');
  }
  boot();
})();

/* ==========================================================================
   OpenHSEQ — app.js  (core hub)
   Routing, staged reporting, cases (saved filters + bulk), CAPA action
   register, risk matrix, report builder, change history, sign-off, PWA,
   branding, deep-link prefill. Settings/Docs/Audits live in their modules.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.HSEQStore, C = window.HSEQCharts, A = window.HSEQAuth;

  /* ---- access helpers: scope report data to what the user may see -------- */
  function visible() { return A ? A.scope(S.all()) : S.all(); }
  function visibleActions() { var ids = {}; visible().forEach(function (r) { ids[r.id] = 1; }); return S.allActions().filter(function (a) { return ids[a.reportId]; }); }
  function myCaps() { return A ? A.myCaps() : { raiseReports: true, audits: true, viewReports: true, dashboards: true, canHide: false, manageUsers: false, reportsScope: 'all' }; }
  function canView(view) {
    var c = myCaps();
    switch (view) {
      case 'dashboard': case 'reports': case 'risk': return c.dashboards;
      case 'cases': case 'actions': return c.viewReports;
      case 'audits': return c.audits;
      case 'documents': return true;
      case 'new': return c.raiseReports;
      case 'qr': return c.qrCodes;
      case 'settings': return c.settings;
      case 'hub': return true;
      default: return true;
    }
  }
  function defaultView() {
    var order = ['dashboard', 'cases', 'audits', 'new'];
    for (var i = 0; i < order.length; i++) if (canView(order[i])) return order[i];
    return 'new';
  }

  /* ------------------------------- helpers -------------------------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, attrs) { var n = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function statusClass(s) { return 'status-' + String(s).replace(/\s+/g, ''); }
  function fmtTs(ts) { try { return new Date(ts).toLocaleString(); } catch (e) { return ts; } }

  function riskLabel(r) {
    if (r.riskScore == null) return '<span class="badge risk-untriaged">Untriaged · sev ' + (r.severity || '?') + '</span>';
    var b = S.riskBand(r.riskScore);
    return '<span class="badge ' + b.cls + '">' + r.riskScore + ' ' + b.label + '</span>';
  }
  function overdueBadge(r) { return S.caseOverdue(r) ? ' <span class="badge badge-overdue">⏰ overdue</span>' : ''; }

  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2400); }

  function printDoc(html) {
    $('#printRoot').innerHTML = html;
    document.body.classList.add('print-single');
    window.onafterprint = function () { document.body.classList.remove('print-single'); $('#printRoot').innerHTML = ''; window.onafterprint = null; };
    window.print();
  }

  /* ------------------------------- routing -------------------------------- */
  function show(view) {
    if (!canView(view)) { view = defaultView(); }        // block direct access to gated views
    $all('.view').forEach(function (v) { v.classList.remove('active'); });
    var target = $('#view-' + view);
    if (target) target.classList.add('active');
    $all('.nav-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    if (view === 'dashboard') renderDashboard();
    if (view === 'cases') renderCases();
    if (view === 'actions') renderActions();
    if (view === 'risk') renderMatrix();
    if (view === 'audits' && window.HSEQAudits) window.HSEQAudits.render();
    if (view === 'documents' && window.HSEQDocs) window.HSEQDocs.render();
    if (view === 'qr') renderQRView();
    if (view === 'settings' && window.HSEQSettings) window.HSEQSettings.render();
    if (view === 'new' && !$('#f-id').value) resetForm();
    if (window.HSEQI18n) window.HSEQI18n.apply();
    window.scrollTo(0, 0);
  }
  $('#nav').addEventListener('click', function (e) { var b = e.target.closest('.nav-btn'); if (b) show(b.dataset.view); });

  /* ---- apply the current user's access to the chrome (nav, user box, form) */
  function applyAccess() {
    var u = A ? A.currentUser() : null;
    var box = $('#userBox');
    if (A && !u) {                                    // logged out — hide chrome (gate overlays anyway)
      $all('.nav-btn').forEach(function (b) { b.hidden = true; });
      if (box) box.hidden = true;
      return;
    }
    var c = myCaps();
    // show/hide nav items per capability
    $all('.nav-btn').forEach(function (b) { b.hidden = !canView(b.dataset.view); });
    // hide-report option only for level 5+
    var hr = $('#hideReportRow'); if (hr) hr.hidden = !c.canHide;
    if (!c.canHide) { var hc = $('#f-hidden'); if (hc) hc.checked = false; }
    // user box in the sidebar
    if (box && u) {
      box.hidden = false;
      $('#userName').textContent = u.name || u.email;
      $('#userLevel').textContent = 'Level ' + u.level + (A.isOwner(u) ? ' · owner' : '');
    }
  }
  var logoutBtn = $('#btnLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', function () { if (A) A.logout(); });

  /* --------------------------- populate selects --------------------------- */
  function fillOptions(sel, values, opts) {
    opts = opts || {};
    var html = (opts.placeholder ? '<option value="">' + opts.placeholder + '</option>' : '');
    html += values.map(function (v) { return '<option value="' + esc(v) + '"' + (opts.selected === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
    sel.innerHTML = html;
  }
  function dl(values) { return values.map(function (v) { return '<option value="' + esc(v) + '">'; }).join(''); }

  function initSelects() {
    var types = S.reportTypes().map(function (t) { return t.id; });
    fillOptions($('#f-type'), types);
    fillOptions($('#f-category'), S.CATEGORIES);
    fillOptions($('#flt-type'), types, { placeholder: 'All types' });
    fillOptions($('#flt-status'), S.STATUSES, { placeholder: 'All statuses' });
    fillOptions($('#rep-type'), types, { placeholder: 'All types' });
    fillOptions($('#rep-status'), S.STATUSES, { placeholder: 'All statuses' });
    $('#locations').innerHTML = dl(S.locations());
    $('#people').innerHTML = dl(S.people());
    $('#customers').innerHTML = dl(S.customers());
    refreshDynamicFilters();
  }
  function refreshDynamicFilters() {
    var locs = {};
    visible().forEach(function (r) { if (r.location) locs[r.location] = 1; });
    S.locations().forEach(function (l) { locs[l] = 1; });
    fillOptions($('#flt-location'), Object.keys(locs).sort(), { placeholder: 'All locations' });
    fillOptions($('#rep-location'), Object.keys(locs).sort(), { placeholder: 'All locations' });
    renderSavedFilters();
  }

  /* re-apply everything after settings change */
  function refreshAll() { initSelects(); applyBranding(); var active = $('.nav-btn.active'); if (active) show(active.dataset.view); }
  function applyBranding() {
    var o = S.org();
    if ($('#brandName')) $('#brandName').textContent = o.name || 'OpenHSEQ';
    var logo = $('#brandLogo');
    if (logo) { if (o.logo) { logo.src = o.logo; logo.hidden = false; $('#brandMark').hidden = true; } else { logo.hidden = true; $('#brandMark').hidden = false; } }
  }

  /* ------------------------------ Dashboard ------------------------------- */
  function renderDashboard() { var list = visible(); renderKPIs(list); renderDaysSince(list); C.renderAll(list); }

  function renderKPIs(list) {
    var open = list.filter(function (r) { return r.status === 'Open'; }).length;
    var inProg = list.filter(function (r) { return r.status === 'In Progress'; }).length;
    var closed = list.filter(function (r) { return r.status === 'Closed'; }).length;
    var untriaged = list.filter(function (r) { return r.status !== 'Closed' && r.riskScore == null; }).length;
    var overdue = list.filter(function (r) { return S.caseOverdue(r); }).length;
    var highRiskOpen = list.filter(function (r) { return r.status !== 'Closed' && r.riskScore >= 10; }).length;
    var actions = visibleActions();
    var openActions = actions.filter(function (a) { return a.status !== 'Done'; }).length;
    var overdueActions = actions.filter(function (a) { return S.actionOverdue(a); }).length;
    var dueAudits = S.dueAudits().length;
    var closedRecs = list.filter(function (r) { return r.status === 'Closed' && r.dateClosed; });
    var avgClose = closedRecs.length ? Math.round(closedRecs.reduce(function (a, r) { return a + Math.max(0, S.daysBetween(r.dateReported, r.dateClosed)); }, 0) / closedRecs.length) : '—';

    var cards = [
      { v: list.length, l: 'Total reports', cls: 'accent' },
      { v: open, l: 'Open', cls: 'danger' },
      { v: inProg, l: 'In progress', cls: 'warn' },
      { v: closed, l: 'Closed', cls: 'ok' },
      { v: untriaged, l: 'Awaiting triage', cls: 'warn' },
      { v: overdue, l: 'Overdue cases', cls: 'danger' },
      { v: highRiskOpen, l: 'High/Extreme open', cls: 'danger' },
      { v: openActions, l: 'Open actions', cls: '', sub: overdueActions + ' overdue' },
      { v: dueAudits, l: 'Audits due', cls: dueAudits ? 'warn' : '' },
      { v: avgClose, l: 'Avg days to close', cls: '' }
    ];
    $('#kpiGrid').innerHTML = cards.map(function (c) {
      return '<div class="kpi ' + c.cls + '"><div class="kpi-val">' + c.v + '</div><div class="kpi-lbl">' + c.l + '</div>' + (c.sub ? '<div class="kpi-sub muted">' + c.sub + '</div>' : '') + '</div>';
    }).join('');
  }
  function renderDaysSince(list) {
    var rec = list.filter(function (r) { return S.typeMeta(r.type).recordable; }).sort(function (a, b) { return new Date(b.dateOccurred) - new Date(a.dateOccurred); });
    $('#daysSinceIncident').textContent = rec.length ? Math.max(0, S.daysBetween(rec[0].dateOccurred, S.today())) : '—';
  }

  /* --------------------------- Raise report ------------------------------- */
  var form = $('#reportForm');
  var pendingAttachments = [];

  function resetForm() {
    form.reset(); $('#f-id').value = ''; $('#f-dateOccurred').value = S.today(); $('#f-severity').value = '3';
    $('#formTitle').textContent = 'Raise a Report';
    pendingAttachments = []; renderAttachStaging();
  }
  function loadForEdit(rec) {
    $('#f-id').value = rec.id; $('#f-type').value = rec.type; $('#f-category').value = rec.category;
    $('#f-title').value = rec.title; $('#f-description').value = rec.description || ''; $('#f-customer').value = rec.customer || '';
    $('#f-severity').value = rec.severity || rec.consequence || 3; $('#f-location').value = rec.location;
    $('#f-department').value = rec.department || ''; $('#f-dateOccurred').value = rec.dateOccurred;
    $('#f-reporter').value = rec.reporter; $('#f-assignedTo').value = rec.assignedTo || ''; $('#f-notifyEmail').value = rec.notifyEmail || '';
    if ($('#f-hidden')) $('#f-hidden').checked = !!rec.hidden;
    $('#formTitle').textContent = 'Edit ' + rec.refNo;
    pendingAttachments = (rec.attachments || []).slice(); renderAttachStaging();
    show('new');
  }
  function renderAttachStaging() {
    $('#attachList').innerHTML = pendingAttachments.map(function (a, i) {
      return '<span class="attach-chip">' + esc(a.name) + ' <button type="button" class="attach-x" data-i="' + i + '" aria-label="Remove">×</button></span>';
    }).join('');
  }
  $('#attachList').addEventListener('click', function (e) { var b = e.target.closest('.attach-x'); if (b) { pendingAttachments.splice(Number(b.dataset.i), 1); renderAttachStaging(); } });

  function ingestFiles(fileList) {
    Array.prototype.slice.call(fileList).forEach(function (file) {
      if (file.size > 2 * 1024 * 1024) { alert('“' + file.name + '” is over 2 MB — skipped. Keep attachments small (no server to store them).'); return; }
      var reader = new FileReader();
      reader.onload = function () { pendingAttachments.push({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result }); renderAttachStaging(); };
      reader.readAsDataURL(file);
    });
  }
  $('#f-attachments').addEventListener('change', function (e) { ingestFiles(e.target.files); e.target.value = ''; });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {
      type: $('#f-type').value, category: $('#f-category').value, title: $('#f-title').value.trim(),
      description: $('#f-description').value.trim(), customer: $('#f-customer').value.trim(),
      severity: Number($('#f-severity').value), location: $('#f-location').value.trim(),
      department: $('#f-department').value.trim(), dateOccurred: $('#f-dateOccurred').value,
      dateReported: $('#f-dateOccurred').value, reporter: $('#f-reporter').value.trim(),
      assignedTo: $('#f-assignedTo').value.trim(), notifyEmail: $('#f-notifyEmail').value.trim(),
      attachments: pendingAttachments.slice()
    };
    var c = myCaps();
    var id = $('#f-id').value;
    if (id) {
      if (c.canHide) data.hidden = $('#f-hidden').checked;   // only hide-capable users may change this
      S.update(id, data); S.logHistory(id, 'Edited', 'Details updated'); toast('Report updated');
    } else {
      data.hidden = c.canHide ? $('#f-hidden').checked : false;
      var me = A ? A.currentUser() : null; if (me) data.raisedByEmail = me.email;
      var rec = S.add(data); toast('Submitted ' + rec.refNo + (data.hidden ? ' 🔒 (hidden)' : '') + (data.notifyEmail ? ' (email queued for when live)' : ''));
    }
    refreshDynamicFilters(); resetForm(); show('cases');
  });
  $('#formReset').addEventListener('click', resetForm);

  /* -------------------------------- Cases --------------------------------- */
  function currentFilters() {
    return { q: $('#flt-search').value.toLowerCase().trim(), type: $('#flt-type').value, status: $('#flt-status').value,
      location: $('#flt-location').value, risk: $('#flt-risk').value };
  }
  function applyFilters(list, f) {
    return list.filter(function (r) {
      if (f.type && r.type !== f.type) return false;
      if (f.status && r.status !== f.status) return false;
      if (f.location && r.location !== f.location) return false;
      if (f.risk === 'Overdue') { if (!S.caseOverdue(r)) return false; }
      else if (f.risk) { var label = r.riskScore == null ? 'Untriaged' : S.riskBand(r.riskScore).label; if (label !== f.risk) return false; }
      if (f.q) { var hay = (r.refNo + ' ' + r.title + ' ' + r.reporter + ' ' + (r.customer || '') + ' ' + r.location).toLowerCase(); if (hay.indexOf(f.q) === -1) return false; }
      return true;
    });
  }
  function renderCases() {
    var pool = visible();
    var rows = applyFilters(pool, currentFilters());
    var tbody = $('#casesTable tbody');
    $('#casesCount').textContent = rows.length + ' of ' + pool.length + ' reports';
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="10" class="empty">No reports match. Try “Load demo data” under Settings, or Raise a Report.</td></tr>'; updateBulkBar(); return; }
    tbody.innerHTML = rows.map(function (r) {
      return '<tr data-id="' + r.id + '">' +
        '<td><input type="checkbox" class="row-check" aria-label="Select ' + esc(r.refNo) + '" /></td>' +
        '<td><strong>' + esc(r.refNo) + '</strong></td>' +
        '<td><span class="badge type">' + esc(r.type) + '</span></td>' +
        '<td class="wrap">' + (r.hidden ? '🔒 ' : '') + esc(r.title) + (r.attachments && r.attachments.length ? ' 📎' : '') + (r.actions && r.actions.length ? ' <span class="mini">✔' + r.actions.length + '</span>' : '') + '</td>' +
        '<td>' + esc(r.customer || '—') + '</td>' +
        '<td>' + esc(r.location) + '</td>' +
        '<td>' + esc(r.dateReported) + '</td>' +
        '<td>' + riskLabel(r) + '</td>' +
        '<td><span class="badge ' + statusClass(r.status) + '">' + esc(r.status) + '</span>' + overdueBadge(r) + '</td>' +
        '<td><button type="button" class="btn link" data-act="view">View</button></td>' +
        '</tr>';
    }).join('');
    updateBulkBar();
  }
  $('#casesTable').addEventListener('click', function (e) {
    if (e.target.classList.contains('row-check')) { updateBulkBar(); return; }
    var tr = e.target.closest('tr[data-id]'); if (tr && e.target.closest('[data-act="view"]')) openDetail(tr.dataset.id);
  });
  ['flt-search', 'flt-type', 'flt-status', 'flt-location', 'flt-risk'].forEach(function (id) { $('#' + id).addEventListener('input', renderCases); });
  $('#flt-clear').addEventListener('click', function () { ['flt-search', 'flt-type', 'flt-status', 'flt-location', 'flt-risk'].forEach(function (id) { $('#' + id).value = ''; }); renderCases(); });

  /* saved filters */
  function renderSavedFilters() {
    var saved = S.getSettings().savedFilters || [];
    $('#savedFilters').innerHTML = '<option value="">Saved filters…</option>' + saved.map(function (s, i) { return '<option value="' + i + '">' + esc(s.name) + '</option>'; }).join('');
  }
  $('#savedFilters').addEventListener('change', function (e) {
    var saved = S.getSettings().savedFilters || []; var s = saved[Number(e.target.value)];
    if (!s) return;
    $('#flt-search').value = s.filters.q || ''; $('#flt-type').value = s.filters.type || ''; $('#flt-status').value = s.filters.status || '';
    $('#flt-location').value = s.filters.location || ''; $('#flt-risk').value = s.filters.risk || '';
    renderCases();
  });
  $('#saveFilter').addEventListener('click', function () {
    var name = prompt('Name this filter:'); if (!name) return;
    var saved = S.getSettings().savedFilters || []; saved.push({ name: name, filters: currentFilters() });
    S.saveSettings({ savedFilters: saved }); renderSavedFilters(); toast('Filter saved');
  });
  $('#delFilter').addEventListener('click', function () {
    var i = Number($('#savedFilters').value); var saved = S.getSettings().savedFilters || [];
    if (isNaN(i) || !saved[i]) { toast('Pick a saved filter first'); return; }
    saved.splice(i, 1); S.saveSettings({ savedFilters: saved }); renderSavedFilters(); toast('Filter removed');
  });

  /* bulk actions */
  function checkedIds() { return $all('#casesTable tbody .row-check:checked').map(function (c) { return c.closest('tr').dataset.id; }); }
  function updateBulkBar() { var n = checkedIds().length; $('#bulkBar').hidden = n === 0; $('#bulkCount').textContent = n + ' selected'; }
  $('#bulk-progress').addEventListener('click', function () { bulkStatus('In Progress'); });
  $('#bulk-close').addEventListener('click', function () { bulkStatus('Closed'); });
  $('#bulk-delete').addEventListener('click', function () {
    var ids = checkedIds(); if (!ids.length) return;
    if (!confirm('Delete ' + ids.length + ' report(s)?')) return;
    ids.forEach(function (id) { S.remove(id); }); renderCases(); refreshDynamicFilters(); toast('Deleted ' + ids.length);
  });
  $('#bulk-csv').addEventListener('click', function () { var ids = checkedIds(); exportCSV(visible().filter(function (r) { return ids.indexOf(r.id) > -1; })); });
  function bulkStatus(status) {
    var ids = checkedIds(); if (!ids.length) return;
    ids.forEach(function (id) { S.update(id, { status: status }); S.logHistory(id, 'Status → ' + status, 'bulk'); });
    renderCases(); toast(ids.length + ' → ' + status);
  }

  /* ----------------------------- Detail modal ----------------------------- */
  function field(k, v) { return '<div class="field"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }

  function attachmentsHTML(rec) {
    if (!rec.attachments || !rec.attachments.length) return '';
    var items = rec.attachments.map(function (a) {
      var thumb = /^image\//.test(a.type) ? '<img src="' + a.dataUrl + '" alt="' + esc(a.name) + '" />' : '<span class="file-ico">📄</span>';
      return '<a class="attach-item" href="' + a.dataUrl + '" download="' + esc(a.name) + '" title="Download ' + esc(a.name) + '">' + thumb + '<span>' + esc(a.name) + '</span></a>';
    }).join('');
    return '<div class="field span2"><div class="k">Attachments (' + rec.attachments.length + ')</div><div class="attach-gallery">' + items + '</div></div>';
  }

  function actionsHTML(r) {
    var rows = (r.actions || []).map(function (a) {
      var od = S.actionOverdue(a);
      return '<div class="capa-row' + (od ? ' overdue' : '') + '">' +
        '<div class="capa-main"><strong>' + esc(a.description) + '</strong>' +
        '<div class="muted">Owner: ' + esc(a.owner || '—') + ' · Due: ' + esc(a.dueDate || '—') + (od ? ' · <span class="overdue-text">OVERDUE</span>' : '') + '</div></div>' +
        '<div class="capa-actions">' +
        '<select class="capa-status" data-aid="' + a.id + '">' + S.ACTION_STATUSES.map(function (s) { return '<option' + (a.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="btn small danger" data-delact="' + a.id + '" aria-label="Remove action">×</button>' +
        '</div></div>';
    }).join('');
    return '<div class="capa-box"><h3>Actions / CAPA</h3>' + (rows || '<p class="muted">No actions yet.</p>') +
      '<div class="capa-add"><input type="text" id="capa-desc" placeholder="New corrective/preventive action" />' +
      '<input type="text" id="capa-owner" list="people" placeholder="Owner" />' +
      '<input type="date" id="capa-due" aria-label="Due date" />' +
      '<button type="button" class="btn small primary" data-act="add-action">Add</button></div></div>';
  }

  function historyHTML(r) {
    if (!r.history || !r.history.length) return '';
    var items = r.history.slice().reverse().map(function (h) { return '<li><span class="muted">' + fmtTs(h.ts) + '</span> — <strong>' + esc(h.action) + '</strong>' + (h.detail ? ' · ' + esc(h.detail) : '') + '</li>'; }).join('');
    return '<details class="history"><summary>Change history (' + r.history.length + ')</summary><ul>' + items + '</ul></details>';
  }

  function signOffHTML(r) {
    if (!r.signOff) return '';
    return '<div class="field span2"><div class="k">Signed off</div><div class="v">' + esc(r.signOff.name) + ' · ' + esc(r.signOff.date) +
      (r.signOff.signature ? '<br><img class="sig-img" src="' + r.signOff.signature + '" alt="signature"/>' : '') + '</div></div>';
  }

  function processingPanel(r) {
    if (r.status === 'Open') {
      return '<div class="stage-box"><h3>Triage → move to In Progress</h3><p class="muted">Add the assessment detail to start working the case.</p>' +
        '<div class="form-grid">' +
        '<label>Likelihood (1–5) *<select id="p-likelihood">' + [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (n === 3 ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>' +
        '<label>Root cause<select id="p-rootCause"><option value="">—</option>' + S.rootCauses().map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
        '<label class="span2">Immediate action taken<textarea id="p-immediate" rows="2"></textarea></label></div>' +
        '<button type="button" class="btn primary" data-act="save-triage">Save &amp; move to In Progress</button></div>';
    }
    if (r.status === 'In Progress') {
      return '<div class="stage-box"><h3>Close out</h3>' +
        '<div class="form-grid"><label class="span2">Corrective action *<textarea id="p-corrective" rows="3">' + esc(r.correctiveAction || '') + '</textarea></label>' +
        '<label>Manager sign-off (name)<input type="text" id="p-signname" list="people" /></label>' +
        '<label>Date<input type="date" id="p-signdate" value="' + S.today() + '" /></label></div>' +
        '<div class="sig-wrap"><div class="muted">Signature (draw below)</div>' +
        '<canvas id="sigPad" width="360" height="110" class="sig-pad"></canvas>' +
        '<button type="button" class="btn small" data-act="sig-clear">Clear signature</button></div>' +
        '<div class="form-actions"><button type="button" class="btn primary" data-act="save-close">Save &amp; close case</button>' +
        '<button type="button" class="btn" data-act="reopen-open">↩ Back to Open</button></div></div>';
    }
    return '<div class="stage-box"><button type="button" class="btn" data-act="reopen-progress">↩ Re-open case</button></div>';
  }

  function openDetail(id) {
    var r = S.get(id); if (!r) return;
    if (A && !A.canSee(r)) { toast('You don’t have access to that report'); return; }
    var body = '<h2>' + esc(r.refNo) + ' <span class="badge type">' + esc(r.type) + '</span> <span class="badge ' + statusClass(r.status) + '">' + esc(r.status) + '</span>' + overdueBadge(r) + '</h2>' +
      '<p class="muted">' + esc(r.title) + '</p><div class="detail-grid">' +
      field('Risk', riskLabel(r) + (r.likelihood ? ' (L' + r.likelihood + '×C' + r.consequence + ')' : '')) +
      field('How bad (severity)', (r.severity || r.consequence || '?') + ' — ' + (S.SEVERITY_LABELS[r.severity || r.consequence] || '')) +
      field('Category', esc(r.category)) + field('Customer', esc(r.customer || '—')) +
      field('Location', esc(r.location)) + field('Department', esc(r.department || '—')) +
      field('Reported by', esc(r.reporter)) + field('Assigned to', esc(r.assignedTo || '—')) +
      field('Date occurred', esc(r.dateOccurred)) + field('Target close', esc(r.targetCloseDate || '—')) +
      field('Email copy to', esc(r.notifyEmail || '—')) + field('Root cause', esc(r.rootCause || '—')) +
      (r.dateClosed ? field('Date closed', esc(r.dateClosed)) : '') +
      '<div class="field span2"><div class="k">Description</div><div class="v">' + esc(r.description || '—') + '</div></div>' +
      (r.immediateAction ? '<div class="field span2"><div class="k">Immediate action</div><div class="v">' + esc(r.immediateAction) + '</div></div>' : '') +
      (r.correctiveAction ? '<div class="field span2"><div class="k">Corrective action</div><div class="v">' + esc(r.correctiveAction) + '</div></div>' : '') +
      signOffHTML(r) + attachmentsHTML(r) + '</div>' +
      actionsHTML(r) + processingPanel(r) +
      (window.HSEQDocs ? window.HSEQDocs.relatedHTML(r.type) : '') + historyHTML(r) +
      '<div class="form-actions"><button type="button" class="btn" data-act="print">⬇ Download / Print PDF</button>' +
      '<button type="button" class="btn" data-act="edit">Edit details</button>' +
      '<button type="button" class="btn danger" data-act="delete">Delete</button></div>';
    $('#modalBody').innerHTML = body;
    $('#modalBody').dataset.id = id;
    $('#modal').hidden = false;
    var pad = $('#sigPad'); if (pad) initSignaturePad(pad);
  }

  /* signature pad */
  var sigState = { drawing: false, data: null };
  function initSignaturePad(canvas) {
    var ctx = canvas.getContext('2d'); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#0f172a';
    sigState.data = null;
    function pos(e) { var rect = canvas.getBoundingClientRect(); var t = e.touches ? e.touches[0] : e; return { x: t.clientX - rect.left, y: t.clientY - rect.top }; }
    function start(e) { sigState.drawing = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
    function move(e) { if (!sigState.drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); sigState.data = canvas.toDataURL('image/png'); e.preventDefault(); }
    function end() { sigState.drawing = false; }
    canvas.onmousedown = start; canvas.onmousemove = move; canvas.onmouseup = end; canvas.onmouseleave = end;
    canvas.ontouchstart = start; canvas.ontouchmove = move; canvas.ontouchend = end;
  }

  $('#modalBody').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act], [data-open], [data-delact]'); if (!btn) return;
    var id = $('#modalBody').dataset.id;
    if (btn.dataset.open) { openDetail(btn.dataset.open); return; }
    if (btn.dataset.delact) { S.removeAction(id, btn.dataset.delact); S.logHistory(id, 'Action removed', ''); openDetail(id); renderCases(); return; }
    var act = btn.dataset.act;
    if (act === 'edit') { closeModal(); loadForEdit(S.get(id)); }
    else if (act === 'delete') { if (confirm('Delete this report permanently?')) { S.remove(id); closeModal(); refreshDynamicFilters(); renderCases(); toast('Deleted'); } }
    else if (act === 'print') { printSingle(S.get(id)); }
    else if (act === 'add-action') {
      var desc = $('#capa-desc').value.trim(); if (!desc) { alert('Describe the action.'); return; }
      S.addAction(id, { description: desc, owner: $('#capa-owner').value.trim(), dueDate: $('#capa-due').value });
      S.logHistory(id, 'Action added', desc); openDetail(id); renderCases(); toast('Action added');
    }
    else if (act === 'sig-clear') { var p = $('#sigPad'); if (p) initSignaturePad(p); }
    else if (act === 'save-triage') {
      var lk = Number($('#p-likelihood').value);
      S.update(id, { likelihood: lk, rootCause: $('#p-rootCause').value, immediateAction: $('#p-immediate').value.trim(), status: 'In Progress' });
      S.logHistory(id, 'Triaged → In Progress', 'L' + lk); openDetail(id); renderCases(); toast('Moved to In Progress');
    }
    else if (act === 'save-close') {
      var ca = $('#p-corrective').value.trim(); if (!ca) { alert('Add a corrective action before closing.'); return; }
      var signName = $('#p-signname').value.trim();
      var patch = { correctiveAction: ca, status: 'Closed' };
      if (signName) patch.signOff = { name: signName, date: $('#p-signdate').value || S.today(), signature: sigState.data };
      S.update(id, patch); S.logHistory(id, 'Closed', signName ? 'Signed off by ' + signName : ''); openDetail(id); renderCases(); toast('Case closed');
    }
    else if (act === 'reopen-open') { S.update(id, { status: 'Open' }); S.logHistory(id, 'Re-opened (Open)', ''); openDetail(id); renderCases(); toast('Back to Open'); }
    else if (act === 'reopen-progress') { S.update(id, { status: 'In Progress' }); S.logHistory(id, 'Re-opened', ''); openDetail(id); renderCases(); toast('Re-opened'); }
  });
  $('#modalBody').addEventListener('change', function (e) {
    var sel = e.target.closest('.capa-status'); if (!sel) return;
    var id = $('#modalBody').dataset.id;
    S.updateAction(id, sel.dataset.aid, { status: sel.value }); S.logHistory(id, 'Action ' + sel.value, ''); renderCases();
  });
  function closeModal() { $('#modal').hidden = true; }
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', function (e) { if (e.target === $('#modal')) closeModal(); });

  /* ---------------------- single-record print / PDF ----------------------- */
  function printSingle(r) {
    if (!r) return;
    function row(k, v) { return '<tr><th>' + k + '</th><td>' + esc(v == null || v === '' ? '—' : v) + '</td></tr>'; }
    var imgs = (r.attachments || []).filter(function (a) { return /^image\//.test(a.type); }).map(function (a) { return '<img src="' + a.dataUrl + '" style="max-width:240px;margin:6px;border:1px solid #ccc"/>'; }).join('');
    var acts = (r.actions || []).map(function (a) { return '<li>' + esc(a.description) + ' — ' + esc(a.owner || '') + ' (due ' + esc(a.dueDate || '—') + ', ' + esc(a.status) + ')</li>'; }).join('');
    var html = '<div class="print-report"><h1>' + esc(S.org().name) + ' — Report ' + esc(r.refNo) + '</h1>' +
      '<p><strong>' + esc(r.type) + '</strong> · ' + esc(r.status) + '</p><h2>' + esc(r.title) + '</h2>' +
      '<table class="print-table">' + row('Reference', r.refNo) + row('Type', r.type) + row('Category', r.category) + row('Customer', r.customer) +
      row('Location', r.location) + row('Reported by', r.reporter) + row('Assigned to', r.assignedTo) + row('Date occurred', r.dateOccurred) +
      row('Severity', (r.severity || r.consequence || '') + ' ' + (S.SEVERITY_LABELS[r.severity || r.consequence] || '')) +
      row('Risk score', r.riskScore == null ? 'Untriaged' : r.riskScore + ' (' + S.riskBand(r.riskScore).label + ')') +
      row('Root cause', r.rootCause) + row('Status', r.status) + row('Target close', r.targetCloseDate) + row('Date closed', r.dateClosed) + '</table>' +
      '<h3>Description</h3><p>' + esc(r.description || '—') + '</p><h3>Immediate action</h3><p>' + esc(r.immediateAction || '—') + '</p>' +
      '<h3>Corrective action</h3><p>' + esc(r.correctiveAction || '—') + '</p>' +
      (acts ? '<h3>Actions</h3><ul>' + acts + '</ul>' : '') +
      (r.signOff ? '<h3>Sign-off</h3><p>' + esc(r.signOff.name) + ' · ' + esc(r.signOff.date) + '</p>' + (r.signOff.signature ? '<img src="' + r.signOff.signature + '" style="height:70px"/>' : '') : '') +
      (imgs ? '<h3>Attachments</h3>' + imgs : '') +
      '<p class="print-foot">Generated by OpenHSEQ · ' + new Date().toLocaleString() + '</p></div>';
    printDoc(html);
  }

  /* --------------------------- Action register ---------------------------- */
  function renderActions() {
    var statusF = $('#act-status') ? $('#act-status').value : '';
    var onlyOverdue = $('#act-overdue') ? $('#act-overdue').checked : false;
    var scoped = visibleActions();
    var list = scoped.filter(function (a) {
      if (statusF && a.status !== statusF) return false;
      if (onlyOverdue && !S.actionOverdue(a)) return false;
      return true;
    });
    var open = scoped.filter(function (a) { return a.status !== 'Done'; }).length;
    var od = scoped.filter(function (a) { return S.actionOverdue(a); }).length;
    $('#actionsMeta').innerHTML = list.length + ' action(s) · <strong>' + open + '</strong> open · <strong class="overdue-text">' + od + '</strong> overdue';
    var tbody = $('#actionsTable tbody');
    tbody.innerHTML = list.length ? list.map(function (a) {
      var ovd = S.actionOverdue(a);
      return '<tr class="' + (ovd ? 'overdue' : '') + '"><td class="wrap">' + esc(a.description) + '</td>' +
        '<td><button type="button" class="btn link" data-open="' + a.reportId + '">' + esc(a.refNo) + '</button></td>' +
        '<td>' + esc(a.owner || '—') + '</td><td>' + esc(a.dueDate || '—') + (ovd ? ' ⏰' : '') + '</td>' +
        '<td><span class="badge ' + (a.status === 'Done' ? 'status-Closed' : a.status === 'In Progress' ? 'status-InProgress' : 'status-Open') + '">' + esc(a.status) + '</span></td></tr>';
    }).join('') : '<tr><td colspan="5" class="empty">No actions match.</td></tr>';
  }
  if ($('#act-status')) $('#act-status').addEventListener('change', renderActions);
  if ($('#act-overdue')) $('#act-overdue').addEventListener('change', renderActions);
  $('#actionsTable').addEventListener('click', function (e) { var b = e.target.closest('[data-open]'); if (b) { show('cases'); openDetail(b.dataset.open); } });

  /* ----------------------------- Risk matrix ------------------------------ */
  function renderMatrix() {
    var pool = visible();
    var open = pool.filter(function (r) { return r.status !== 'Closed' && r.likelihood && r.consequence; });
    var untriaged = pool.filter(function (r) { return r.status !== 'Closed' && r.riskScore == null; }).length;
    var grid = $('#riskMatrix'), html = '<div class="axis corner"></div>';
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
    var cell = e.target.closest('.cell'); if (!cell) return;
    var l = cell.dataset.l, c = cell.dataset.c;
    var matches = visible().filter(function (r) { return r.status !== 'Closed' && String(r.likelihood) === l && String(r.consequence) === c; });
    if (!matches.length) { toast('No open reports in that cell'); return; }
    $('#modalBody').innerHTML = '<h2>Open reports — L' + l + ' × C' + c + '</h2><ul class="ref-list">' +
      matches.map(function (r) { return '<li><button type="button" class="btn link" data-open="' + r.id + '"><strong>' + esc(r.refNo) + '</strong></button> ' + esc(r.title) + '</li>'; }).join('') + '</ul>';
    $('#modalBody').removeAttribute('data-id'); $('#modal').hidden = false;
  });

  /* ---------------------------- Report builder ---------------------------- */
  function reportFilteredList() {
    var from = $('#rep-from').value, to = $('#rep-to').value, type = $('#rep-type').value, status = $('#rep-status').value, loc = $('#rep-location').value;
    return visible().filter(function (r) {
      if (from && r.dateReported < from) return false; if (to && r.dateReported > to) return false;
      if (type && r.type !== type) return false; if (status && r.status !== status) return false;
      if (loc && r.location !== loc) return false; return true;
    });
  }
  function sItem(v, l) { return '<div class="s-item"><div class="s-val">' + v + '</div><div class="s-lbl">' + l + '</div></div>'; }
  function runReport() {
    var list = reportFilteredList(), out = $('#reportOutput');
    if (!list.length) { out.innerHTML = '<div class="card empty">No reports in this range.</div>'; return; }
    var open = list.filter(function (r) { return r.status === 'Open'; }).length;
    var closed = list.filter(function (r) { return r.status === 'Closed'; }).length;
    var highRisk = list.filter(function (r) { return r.riskScore >= 10; }).length;
    var overdue = list.filter(function (r) { return S.caseOverdue(r); }).length;
    var from = $('#rep-from').value || 'start', to = $('#rep-to').value || 'today', byType = {};
    list.forEach(function (r) { byType[r.type] = (byType[r.type] || 0) + 1; });
    var rowsHtml = list.map(function (r) {
      var band = r.riskScore == null ? { cls: 'risk-untriaged', label: 'Untriaged' } : S.riskBand(r.riskScore);
      return '<tr><td>' + esc(r.refNo) + '</td><td>' + esc(r.type) + '</td><td>' + esc(r.title) + '</td><td>' + esc(r.customer || '—') + '</td><td>' + esc(r.location) + '</td><td>' + esc(r.dateReported) + '</td><td><span class="badge ' + band.cls + '">' + band.label + '</span></td><td>' + esc(r.status) + '</td></tr>';
    }).join('');
    out.innerHTML = '<div class="report-doc"><h2>' + esc(S.org().name) + ' — HSEQ Summary Report</h2>' +
      '<p class="muted">Period: ' + esc(from) + ' → ' + esc(to) + ($('#rep-type').value ? ' · Type: ' + esc($('#rep-type').value) : '') + ($('#rep-status').value ? ' · Status: ' + esc($('#rep-status').value) : '') + ($('#rep-location').value ? ' · Location: ' + esc($('#rep-location').value) : '') + '</p>' +
      '<div class="report-summary">' + sItem(list.length, 'Total') + sItem(open, 'Open') + sItem(closed, 'Closed') + sItem(highRisk, 'High/Extreme') + sItem(overdue, 'Overdue') + '</div>' +
      '<h3>Breakdown by type</h3><ul>' + Object.keys(byType).map(function (t) { return '<li>' + esc(t) + ': <strong>' + byType[t] + '</strong></li>'; }).join('') + '</ul>' +
      '<h3>Detail</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Ref</th><th>Type</th><th>Title</th><th>Customer</th><th>Location</th><th>Reported</th><th>Risk</th><th>Status</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div></div>';
  }
  $('#rep-run').addEventListener('click', runReport);
  $('#rep-print').addEventListener('click', function () { runReport(); window.print(); });
  $('#rep-csv').addEventListener('click', function () { exportCSV(reportFilteredList()); });

  function exportCSV(list) {
    if (!list.length) { toast('Nothing to export'); return; }
    var cols = ['refNo', 'type', 'category', 'title', 'customer', 'location', 'department', 'reporter', 'assignedTo', 'dateOccurred', 'dateReported', 'severity', 'likelihood', 'consequence', 'riskScore', 'rootCause', 'status', 'targetCloseDate', 'dateClosed', 'correctiveAction'];
    var rows = [cols.join(',')];
    list.forEach(function (r) { rows.push(cols.map(function (c) { var v = r[c] == null ? '' : String(r[c]).replace(/"/g, '""'); return /[",\n]/.test(v) ? '"' + v + '"' : v; }).join(',')); });
    download('hseq-report.csv', rows.join('\n'), 'text/csv'); toast('CSV exported (' + list.length + ' rows)');
  }
  function download(name, content, mime) { var blob = new Blob([content], { type: mime || 'text/plain' }); var a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click(); a.remove(); }

  /* ---------------------------- QR codes tab ------------------------------ */
  /* Print a code per location; scanning opens that location's Quick Hub. */
  function renderQRView() {
    var base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : location.href.split('?')[0];
    var cards = S.locations().map(function (loc) {
      var url = base + '?hub=1&location=' + encodeURIComponent(loc);
      var qr = 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=' + encodeURIComponent(url);
      return '<div class="qr-card"><img src="' + qr + '" alt="QR for ' + esc(loc) + '" loading="lazy" /><div class="qr-name">' + esc(loc) + '</div>' +
        '<button type="button" class="btn small qr-copy" data-url="' + esc(url) + '">Copy link</button> ' +
        '<a class="btn small" href="' + esc(url) + '" target="_blank" rel="noopener">Preview</a></div>';
    }).join('');
    $('#qrRoot').innerHTML = '<div class="card"><h3>Quick-access QR codes</h3>' +
      '<p class="muted">Print a code at each location. Scanning opens that location’s hub — a “Raise a Report” button plus the audits that need doing. ' +
      'Locations come from Settings. (QR images need internet.)</p>' +
      '<div class="qr-grid">' + (cards || '<p class="muted">No locations configured.</p>') + '</div></div>';
  }
  $('#qrRoot').addEventListener('click', function (e) {
    var c = e.target.closest('.qr-copy'); if (!c) return;
    var url = c.dataset.url;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast('Link copied'); }, function () { prompt('Copy this link:', url); });
    else prompt('Copy this link:', url);
  });

  /* ------------------------------- Quick Hub ------------------------------ */
  /* Landing page a QR code opens: raise a report + the audits that need doing. */
  function renderHub(loc) {
    var o = S.org();
    var dueIds = S.dueAudits().map(function (t) { return t.id; });
    var tpls = S.auditTemplates();
    var auditCards = tpls.length ? tpls.map(function (t) {
      var isDue = dueIds.indexOf(t.id) > -1;
      var sched = t.schedule && t.schedule.frequency && t.schedule.frequency !== 'None';
      return '<div class="hub-audit' + (isDue ? ' due' : '') + '">' +
        '<div><strong>' + esc(t.title) + '</strong>' + (isDue ? ' <span class="badge badge-overdue">DUE</span>' : '') +
        (sched ? '<div class="muted">🔁 ' + esc(t.schedule.frequency) + (t.schedule.nextDue ? ' · next ' + esc(t.schedule.nextDue) : '') + '</div>' : '') +
        '</div><button type="button" class="btn small primary" data-hub-audit="' + t.id + '">Start</button></div>';
    }).join('') : '<p class="muted">No audit types set up yet.</p>';

    $('#hubRoot').innerHTML =
      '<div class="hub">' +
        '<div class="hub-head">' +
          (o.logo ? '<img class="hub-logo" src="' + o.logo + '" alt="logo" />' : '<span class="hub-mark">◆</span>') +
          '<div><div class="hub-org">' + esc(o.name || 'OpenHSEQ') + '</div>' +
          (loc ? '<div class="hub-loc">📍 ' + esc(loc) + '</div>' : '') + '</div>' +
        '</div>' +
        '<button type="button" class="hub-btn" data-hub-raise="' + esc(loc || '') + '">➕ Raise a Report</button>' +
        '<h2 class="hub-h2">Audits to complete</h2>' +
        '<div class="hub-audits">' + auditCards + '</div>' +
        '<button type="button" class="hub-open">Open full app →</button>' +
      '</div>';
  }

  $('#hubRoot').addEventListener('click', function (e) {
    var raise = e.target.closest('[data-hub-raise]');
    if (raise) { resetForm(); if (raise.dataset.hubRaise) $('#f-location').value = raise.dataset.hubRaise; show('new'); return; }
    var aud = e.target.closest('[data-hub-audit]');
    if (aud) { if (window.HSEQAudits && window.HSEQAudits.startRun) { window.HSEQAudits.startRun(aud.dataset.hubAudit); } show('audits'); return; }
    if (e.target.closest('.hub-open')) { show('dashboard'); }
  });

  /* ----------------------------- deep link -------------------------------- */
  function handleDeepLink() {
    var q = {}; (location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    if (q.hub === '1' || q.hub === 'true') { renderHub(q.location || ''); show('hub'); return true; }
    if (q.raise === '1' || q.raise === 'true') {
      resetForm();
      if (q.type) $('#f-type').value = q.type;
      if (q.location) $('#f-location').value = q.location;
      if (q.customer) $('#f-customer').value = q.customer;
      show('new');
      return true;
    }
    return false;
  }

  /* ------------------------------- PWA ------------------------------------ */
  function registerSW() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.protocol === 'http:')) {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW registration failed', e); });
    }
  }

  /* shared helpers for other modules */
  window.HSEQUI = { toast: toast, printDoc: printDoc, esc: esc, refreshAll: refreshAll, showView: show, openCase: function (id) { show('cases'); openDetail(id); }, download: download };

  /* -------------------------------- Boot ---------------------------------- */
  function boot() {
    S.seedSettings(); S.seedAuditTemplates();
    if (window.HSEQI18n) window.HSEQI18n.init();
    initSelects(); applyBranding(); resetForm();
    if (!S.all().length) { S.seedDemo(42); initSelects(); }
    registerSW();
    if (A) {
      A.init({
        onGateChange: applyAccess,
        onAuthed: function () {
          applyAccess();
          refreshDynamicFilters();
          if (!handleDeepLink()) show(defaultView());
          if (window.HSEQI18n) window.HSEQI18n.apply();
        }
      });
    } else {
      if (!handleDeepLink()) show('dashboard');   // fallback if auth module absent
    }
  }
  boot();
})();

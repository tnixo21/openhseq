/* ==========================================================================
   OpenHSEQ — app.js
   Routing, forms, cases table, risk matrix, report builder, data tools.
   ========================================================================== */
(function () {
  'use strict';
  var S = window.HSEQStore, C = window.HSEQCharts;

  /* ------------------------------- helpers -------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function money(n) { return '$' + (Number(n) || 0).toLocaleString(); }
  function statusClass(s) { return 'status-' + String(s).replace(/\s+/g, ''); }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2400);
  }

  /* ------------------------------- routing -------------------------------- */
  function show(view) {
    $all('.view').forEach(function (v) { v.classList.remove('active'); });
    var target = $('#view-' + view);
    if (target) target.classList.add('active');
    $all('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view);
    });
    if (view === 'dashboard') renderDashboard();
    if (view === 'cases') renderCases();
    if (view === 'risk') renderMatrix();
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
      var selAttr = (opts.selected === v) ? ' selected' : '';
      return '<option value="' + esc(v) + '"' + selAttr + '>' + esc(v) + '</option>';
    }).join('');
    sel.innerHTML = html;
  }

  function initSelects() {
    var types = S.REPORT_TYPES.map(function (t) { return t.id; });
    fillOptions($('#f-type'), types);
    fillOptions($('#f-category'), S.CATEGORIES);
    fillOptions($('#f-rootCause'), S.ROOT_CAUSES, { placeholder: '—' });
    fillOptions($('#f-status'), S.STATUSES, { selected: 'Open' });
    fillOptions($('#flt-type'), types, { placeholder: 'All types' });
    fillOptions($('#flt-status'), S.STATUSES, { placeholder: 'All statuses' });
    fillOptions($('#rep-type'), types, { placeholder: 'All types' });
    // datalists
    $('#locations').innerHTML = S.DEMO_LOCATIONS.map(function (l) { return '<option value="' + esc(l) + '">'; }).join('');
    $('#people').innerHTML = S.DEMO_PEOPLE.map(function (p) { return '<option value="' + esc(p) + '">'; }).join('');
    refreshLocationFilters();
  }

  function refreshLocationFilters() {
    var locs = {};
    S.all().forEach(function (r) { if (r.location) locs[r.location] = 1; });
    var list = Object.keys(locs).sort();
    fillOptions($('#flt-location'), list, { placeholder: 'All locations' });
    fillOptions($('#rep-location'), list, { placeholder: 'All locations' });
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
    var cost = list.reduce(function (a, r) { return a + (Number(r.cost) || 0); }, 0);
    var accidents = list.filter(function (r) { return r.type === 'Accident'; }).length;
    var nearMiss = list.filter(function (r) { return r.type === 'Near Miss'; }).length;
    var nmRatio = accidents ? (nearMiss / accidents).toFixed(1) : nearMiss ? '∞' : '—';

    // avg days to close
    var closedRecs = list.filter(function (r) { return r.status === 'Closed' && r.dateClosed; });
    var avgClose = closedRecs.length
      ? Math.round(closedRecs.reduce(function (a, r) { return a + Math.max(0, S.daysBetween(r.dateReported, r.dateClosed)); }, 0) / closedRecs.length)
      : '—';

    var cards = [
      { v: list.length, l: 'Total reports', cls: 'accent' },
      { v: open, l: 'Open', cls: 'danger' },
      { v: inProg, l: 'In progress', cls: 'warn' },
      { v: closed, l: 'Closed', cls: 'ok' },
      { v: highRiskOpen, l: 'High/Extreme open', cls: 'danger' },
      { v: nmRatio, l: 'Near-miss : accident', sub: 'leading indicator', cls: '' },
      { v: avgClose, l: 'Avg days to close', cls: '' },
      { v: money(cost), l: 'Est. total cost', cls: 'warn' }
    ];
    $('#kpiGrid').innerHTML = cards.map(function (c) {
      return '<div class="kpi ' + c.cls + '"><div class="kpi-val">' + c.v + '</div>' +
        '<div class="kpi-lbl">' + c.l + '</div>' +
        (c.sub ? '<div class="kpi-sub muted">' + c.sub + '</div>' : '') + '</div>';
    }).join('');
  }

  function renderDaysSince(list) {
    var recordable = list.filter(function (r) { return S.typeMeta(r.type).recordable; })
      .sort(function (a, b) { return new Date(b.dateOccurred) - new Date(a.dateOccurred); });
    var node = $('#daysSinceIncident');
    if (!recordable.length) { node.textContent = '—'; return; }
    node.textContent = Math.max(0, S.daysBetween(recordable[0].dateOccurred, new Date().toISOString().slice(0, 10)));
  }

  /* ------------------------------ New / Edit ------------------------------ */
  var form = $('#reportForm');

  function recalcRisk() {
    var l = Number($('#f-likelihood').value), c = Number($('#f-consequence').value);
    var band = S.riskBand(l * c);
    $('#f-riskOut').value = (l * c) + ' — ' + band.label;
  }
  $('#f-likelihood').addEventListener('change', recalcRisk);
  $('#f-consequence').addEventListener('change', recalcRisk);

  function resetForm() {
    form.reset();
    $('#f-id').value = '';
    $('#f-dateOccurred').value = new Date().toISOString().slice(0, 10);
    $('#formTitle').textContent = 'New Report';
    fillOptions($('#f-status'), S.STATUSES, { selected: 'Open' });
    recalcRisk();
  }

  function loadForEdit(rec) {
    $('#f-id').value = rec.id;
    $('#f-type').value = rec.type;
    $('#f-category').value = rec.category;
    $('#f-title').value = rec.title;
    $('#f-description').value = rec.description || '';
    $('#f-location').value = rec.location;
    $('#f-department').value = rec.department || '';
    $('#f-dateOccurred').value = rec.dateOccurred;
    $('#f-reporter').value = rec.reporter;
    $('#f-likelihood').value = rec.likelihood;
    $('#f-consequence').value = rec.consequence;
    $('#f-rootCause').value = rec.rootCause || '';
    $('#f-assignedTo').value = rec.assignedTo || '';
    $('#f-status').value = rec.status;
    $('#f-cost').value = rec.cost || 0;
    $('#f-immediateAction').value = rec.immediateAction || '';
    $('#f-correctiveAction').value = rec.correctiveAction || '';
    $('#formTitle').textContent = 'Edit ' + rec.refNo;
    recalcRisk();
    show('new');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {
      type: $('#f-type').value,
      category: $('#f-category').value,
      title: $('#f-title').value.trim(),
      description: $('#f-description').value.trim(),
      location: $('#f-location').value.trim(),
      department: $('#f-department').value.trim(),
      dateOccurred: $('#f-dateOccurred').value,
      dateReported: $('#f-dateOccurred').value,
      reporter: $('#f-reporter').value.trim(),
      likelihood: Number($('#f-likelihood').value),
      consequence: Number($('#f-consequence').value),
      rootCause: $('#f-rootCause').value,
      assignedTo: $('#f-assignedTo').value.trim(),
      status: $('#f-status').value,
      cost: Number($('#f-cost').value) || 0,
      immediateAction: $('#f-immediateAction').value.trim(),
      correctiveAction: $('#f-correctiveAction').value.trim()
    };
    var id = $('#f-id').value;
    if (id) {
      S.update(id, data);
      toast('Report updated');
    } else {
      var rec = S.add(data);
      toast('Saved ' + rec.refNo);
    }
    refreshLocationFilters();
    resetForm();
    show('cases');
  });
  $('#formReset').addEventListener('click', resetForm);

  /* -------------------------------- Cases --------------------------------- */
  function currentFilters() {
    return {
      q: $('#flt-search').value.toLowerCase().trim(),
      type: $('#flt-type').value,
      status: $('#flt-status').value,
      location: $('#flt-location').value,
      risk: $('#flt-risk').value
    };
  }

  function applyFilters(list, f) {
    return list.filter(function (r) {
      if (f.type && r.type !== f.type) return false;
      if (f.status && r.status !== f.status) return false;
      if (f.location && r.location !== f.location) return false;
      if (f.risk && S.riskBand(r.riskScore).label !== f.risk) return false;
      if (f.q) {
        var hay = (r.refNo + ' ' + r.title + ' ' + r.reporter + ' ' + r.location).toLowerCase();
        if (hay.indexOf(f.q) === -1) return false;
      }
      return true;
    });
  }

  function renderCases() {
    var f = currentFilters();
    var rows = applyFilters(S.all(), f);
    var tbody = $('#casesTable tbody');
    $('#casesCount').textContent = rows.length + ' of ' + S.all().length + ' reports';
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">No reports match. Try “Load demo data” under Data.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r) {
      var band = S.riskBand(r.riskScore);
      return '<tr data-id="' + r.id + '">' +
        '<td><strong>' + esc(r.refNo) + '</strong></td>' +
        '<td><span class="badge type">' + esc(r.type) + '</span></td>' +
        '<td class="wrap">' + esc(r.title) + '</td>' +
        '<td>' + esc(r.location) + '</td>' +
        '<td>' + esc(r.dateReported) + '</td>' +
        '<td><span class="badge ' + band.cls + '">' + r.riskScore + ' ' + band.label + '</span></td>' +
        '<td><span class="badge ' + statusClass(r.status) + '">' + esc(r.status) + '</span></td>' +
        '<td>' + money(r.cost) + '</td>' +
        '<td><button class="btn link" data-act="view">View</button></td>' +
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

  function openDetail(id) {
    var r = S.get(id);
    if (!r) return;
    var band = S.riskBand(r.riskScore);
    var body = '<h2>' + esc(r.refNo) + ' <span class="badge type">' + esc(r.type) + '</span></h2>' +
      '<p class="muted">' + esc(r.title) + '</p>' +
      '<div class="detail-grid">' +
      field('Status', '<span class="badge ' + statusClass(r.status) + '">' + esc(r.status) + '</span>') +
      field('Risk', '<span class="badge ' + band.cls + '">' + r.riskScore + ' ' + band.label + '</span> (L' + r.likelihood + '×C' + r.consequence + ')') +
      field('Category', esc(r.category)) +
      field('Location', esc(r.location)) +
      field('Department', esc(r.department || '—')) +
      field('Reported by', esc(r.reporter)) +
      field('Assigned to', esc(r.assignedTo || '—')) +
      field('Date occurred', esc(r.dateOccurred)) +
      field('Root cause', esc(r.rootCause || '—')) +
      field('Est. cost', money(r.cost)) +
      '<div class="field span2"><div class="k">Description</div><div class="v">' + esc(r.description || '—') + '</div></div>' +
      '<div class="field span2"><div class="k">Immediate action</div><div class="v">' + esc(r.immediateAction || '—') + '</div></div>' +
      '<div class="field span2"><div class="k">Corrective action</div><div class="v">' + esc(r.correctiveAction || '—') + '</div></div>' +
      (r.dateClosed ? field('Date closed', esc(r.dateClosed)) : '') +
      '</div>' +
      '<div class="form-actions">' +
      statusButtons(r) +
      '<button class="btn" data-act="edit">Edit</button>' +
      '<button class="btn danger" data-act="delete">Delete</button>' +
      '</div>';
    $('#modalBody').innerHTML = body;
    $('#modalBody').dataset.id = id;
    $('#modal').hidden = false;
  }

  function statusButtons(r) {
    return S.STATUSES.filter(function (s) { return s !== r.status; }).map(function (s) {
      return '<button class="btn primary" data-act="status" data-status="' + s + '">→ ' + s + '</button>';
    }).join('');
  }

  $('#modalBody').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var id = $('#modalBody').dataset.id;
    var act = btn.dataset.act;
    if (act === 'edit') { closeModal(); loadForEdit(S.get(id)); }
    else if (act === 'delete') {
      if (confirm('Delete this report permanently?')) { S.remove(id); closeModal(); refreshLocationFilters(); renderCases(); toast('Deleted'); }
    } else if (act === 'status') {
      S.update(id, { status: btn.dataset.status });
      openDetail(id); renderCases(); toast('Status → ' + btn.dataset.status);
    }
  });
  function closeModal() { $('#modal').hidden = true; }
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', function (e) { if (e.target === $('#modal')) closeModal(); });

  /* ----------------------------- Risk matrix ------------------------------ */
  function renderMatrix() {
    var open = S.all().filter(function (r) { return r.status !== 'Closed'; });
    var grid = $('#riskMatrix');
    var html = '<div class="axis corner"></div>';
    for (var l = 1; l <= 5; l++) html += '<div class="axis">L' + l + '</div>';
    // rows: consequence 5 (top) down to 1
    for (var c = 5; c >= 1; c--) {
      html += '<div class="axis">C' + c + '</div>';
      for (var lk = 1; lk <= 5; lk++) {
        var score = lk * c;
        var band = S.riskBand(score);
        var n = open.filter(function (r) { return Number(r.likelihood) === lk && Number(r.consequence) === c; }).length;
        html += '<div class="cell ' + band.cls + '" data-l="' + lk + '" data-c="' + c + '">' +
          (n || '') + '<small>' + score + '</small></div>';
      }
    }
    grid.innerHTML = html;
  }

  $('#riskMatrix').addEventListener('click', function (e) {
    var cell = e.target.closest('.cell');
    if (!cell) return;
    var l = cell.dataset.l, c = cell.dataset.c;
    var matches = S.all().filter(function (r) {
      return r.status !== 'Closed' && String(r.likelihood) === l && String(r.consequence) === c;
    });
    if (!matches.length) { toast('No open reports in that cell'); return; }
    $('#modalBody').innerHTML = '<h2>Open reports — L' + l + ' × C' + c + '</h2>' +
      '<ul>' + matches.map(function (r) {
        return '<li><strong>' + esc(r.refNo) + '</strong> — ' + esc(r.title) +
          ' <span class="badge ' + statusClass(r.status) + '">' + esc(r.status) + '</span></li>';
      }).join('') + '</ul>';
    $('#modalBody').removeAttribute('data-id');
    $('#modal').hidden = false;
  });

  /* ---------------------------- Report builder ---------------------------- */
  function reportFilteredList() {
    var from = $('#rep-from').value, to = $('#rep-to').value;
    var type = $('#rep-type').value, loc = $('#rep-location').value;
    return S.all().filter(function (r) {
      if (from && r.dateReported < from) return false;
      if (to && r.dateReported > to) return false;
      if (type && r.type !== type) return false;
      if (loc && r.location !== loc) return false;
      return true;
    });
  }

  function runReport() {
    var list = reportFilteredList();
    var out = $('#reportOutput');
    if (!list.length) { out.innerHTML = '<div class="card empty">No reports in this range.</div>'; return; }

    var open = list.filter(function (r) { return r.status === 'Open'; }).length;
    var closed = list.filter(function (r) { return r.status === 'Closed'; }).length;
    var cost = list.reduce(function (a, r) { return a + (Number(r.cost) || 0); }, 0);
    var highRisk = list.filter(function (r) { return r.riskScore >= 10; }).length;
    var from = $('#rep-from').value || 'start', to = $('#rep-to').value || 'today';

    var byType = {};
    list.forEach(function (r) { byType[r.type] = (byType[r.type] || 0) + 1; });

    var summary =
      '<div class="report-summary">' +
      sItem(list.length, 'Total') + sItem(open, 'Open') + sItem(closed, 'Closed') +
      sItem(highRisk, 'High/Extreme') + sItem(money(cost), 'Est. cost') + '</div>';

    var typeBreak = '<h3>Breakdown by type</h3><ul>' +
      Object.keys(byType).map(function (t) { return '<li>' + esc(t) + ': <strong>' + byType[t] + '</strong></li>'; }).join('') + '</ul>';

    var rowsHtml = list.map(function (r) {
      var band = S.riskBand(r.riskScore);
      return '<tr><td>' + esc(r.refNo) + '</td><td>' + esc(r.type) + '</td><td>' + esc(r.title) +
        '</td><td>' + esc(r.location) + '</td><td>' + esc(r.dateReported) +
        '</td><td><span class="badge ' + band.cls + '">' + band.label + '</span></td><td>' + esc(r.status) +
        '</td><td>' + money(r.cost) + '</td></tr>';
    }).join('');

    out.innerHTML =
      '<div class="report-doc">' +
      '<h2>HSEQ Summary Report</h2>' +
      '<p class="muted">Period: ' + esc(from) + ' → ' + esc(to) +
      (($('#rep-type').value) ? ' · Type: ' + esc($('#rep-type').value) : '') +
      (($('#rep-location').value) ? ' · Location: ' + esc($('#rep-location').value) : '') + '</p>' +
      summary + typeBreak +
      '<h3>Detail</h3>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Ref</th><th>Type</th><th>Title</th><th>Location</th><th>Reported</th><th>Risk</th><th>Status</th><th>Cost</th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
      '</div>';
  }
  function sItem(v, l) { return '<div class="s-item"><div class="s-val">' + v + '</div><div class="s-lbl">' + l + '</div></div>'; }

  $('#rep-run').addEventListener('click', runReport);
  $('#rep-print').addEventListener('click', function () { runReport(); window.print(); });
  $('#rep-csv').addEventListener('click', function () { exportCSV(reportFilteredList()); });

  function exportCSV(list) {
    if (!list.length) { toast('Nothing to export'); return; }
    var cols = ['refNo', 'type', 'category', 'title', 'location', 'department', 'reporter', 'assignedTo',
      'dateOccurred', 'dateReported', 'likelihood', 'consequence', 'riskScore', 'rootCause',
      'status', 'cost', 'dateClosed'];
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
    var n = S.seedDemo(42);
    initSelects();
    toast('Loaded ' + n + ' demo reports');
    show('dashboard');
  });
  $('#data-clear').addEventListener('click', function () {
    if (!confirm('Delete ALL reports? This cannot be undone.')) return;
    S.clear(); initSelects(); toast('All data cleared'); renderDashboard();
  });
  $('#data-export').addEventListener('click', function () {
    download('openhseq-backup.json', S.exportJSON(), 'application/json');
    toast('Backup exported');
  });
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

  /* -------------------------------- Boot ---------------------------------- */
  function boot() {
    initSelects();
    resetForm();
    // first-run convenience: seed demo data so the dashboards aren't empty
    if (!S.all().length) { S.seedDemo(42); initSelects(); }
    show('dashboard');
  }
  boot();
})();

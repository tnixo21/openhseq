/* ==========================================================================
   OpenHSEQ — storage.js
   Data layer: localStorage CRUD, configurable settings, demo seeding,
   risk + CAPA (action register) + audit helpers. No backend, no API.

   Workflow model (staged):
     Open        -> raised on the floor (type, title, location, severity, …)
     In Progress -> HSEQ adds likelihood, root cause, immediate action (triage)
     Closed      -> HSEQ adds the corrective action
   CAPA actions hang off a report; each has an owner + due date + status.
   ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'openhseq.reports.v1';
  var SETTINGS_KEY = 'openhseq.settings.v2';
  var AUDIT_TPL_KEY = 'openhseq.auditTemplates.v1';
  var AUDIT_DONE_KEY = 'openhseq.auditsCompleted.v1';
  var DOCS_KEY = 'openhseq.documents.v1';

  /* ----- Fixed reference data (not user-editable) -------------------------- */
  var CATEGORIES = ['Health', 'Safety', 'Environment', 'Quality'];
  var STATUSES = ['Open', 'In Progress', 'Closed'];
  var ACTION_STATUSES = ['Open', 'In Progress', 'Done'];
  var SEVERITY_LABELS = { 1: 'Insignificant', 2: 'Minor', 3: 'Moderate', 4: 'Major', 5: 'Severe' };
  // target close days by severity (5 = most severe -> tightest SLA)
  var SLA_DAYS = { 5: 3, 4: 7, 3: 14, 2: 21, 1: 30 };

  /* ----- Editable defaults (seed the settings store on first run) ---------- */
  var DEFAULTS = {
    org: { name: 'OpenHSEQ', logo: '' },
    lang: 'en',
    savedFilters: [],
    reportTypes: [
      { id: 'Non-Conformance', prefix: 'NCR', recordable: true },
      { id: 'Accident',        prefix: 'ACC', recordable: true },
      { id: 'Near Miss',       prefix: 'NM',  recordable: false },
      { id: 'Observation',     prefix: 'OBS', recordable: false },
      { id: 'Improvement',     prefix: 'IMP', recordable: false },
      { id: 'Prevention',      prefix: 'PRV', recordable: false }
    ],
    rootCauses: ['Human error', 'Inadequate procedure', 'Equipment failure',
      'Lack of training', 'Poor communication', 'Environmental conditions',
      'Inadequate supervision', 'PPE not used', 'Housekeeping', 'Other'],
    locations: ['Brisbane Depot', 'Melbourne Yard', 'Sydney Wharf',
      'Warehouse A', 'Loading Dock 3', 'Workshop', 'Office', 'Container Park'],
    departments: ['Operations', 'Warehouse', 'Transport', 'Admin', 'Maintenance'],
    customers: ['Acme Freight', 'Santos', 'BlueScope', 'Origin Energy',
      'Rio Tinto', 'Coles DC', 'Incitec Pivot'],
    people: ['T. Nixon', 'A. Smith', 'J. Chen', 'M. Patel',
      'R. O\'Brien', 'S. Kowalski', 'L. Nguyen', 'D. Okafor']
  };

  /* --------------------------------- Utils -------------------------------- */
  function uid(p) { return (p || 'r') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function addDays(iso, days) { return new Date(new Date(iso).getTime() + days * 86400000).toISOString().slice(0, 10); }

  function read(key) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (e) { console.error('OpenHSEQ: failed to read ' + key, e); return null; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.error('OpenHSEQ: failed to write ' + key, e); alert('Could not save — browser storage may be full (large attachments?).'); return false; }
  }
  function readList(key) { var v = read(key); return Array.isArray(v) ? v : []; }

  /* ------------------------------- Settings ------------------------------- */
  function getSettings() {
    var s = read(SETTINGS_KEY);
    if (!s) { s = JSON.parse(JSON.stringify(DEFAULTS)); write(SETTINGS_KEY, s); }
    // backfill any missing keys (forward-compat)
    Object.keys(DEFAULTS).forEach(function (k) { if (s[k] == null) s[k] = JSON.parse(JSON.stringify(DEFAULTS[k])); });
    return s;
  }
  function saveSettings(patch) { var s = getSettings(); Object.assign(s, patch); write(SETTINGS_KEY, s); return s; }
  function seedSettings() { getSettings(); }

  function reportTypes() { return getSettings().reportTypes; }
  function rootCauses() { return getSettings().rootCauses; }
  function locations() { return getSettings().locations; }
  function departments() { return getSettings().departments; }
  function customers() { return getSettings().customers; }
  function people() { return getSettings().people; }
  function org() { return getSettings().org; }

  function typeMeta(typeId) {
    var t = reportTypes().filter(function (x) { return x.id === typeId; })[0];
    return t || { id: typeId, prefix: 'GEN', recordable: false };
  }

  /* --------------------------------- Risk --------------------------------- */
  function riskBand(score) {
    if (score == null) return { label: 'Untriaged', cls: 'risk-untriaged', rank: 0 };
    if (score >= 15) return { label: 'Extreme', cls: 'risk-extreme', rank: 4 };
    if (score >= 10) return { label: 'High',    cls: 'risk-high',    rank: 3 };
    if (score >= 5)  return { label: 'Medium',  cls: 'risk-medium',  rank: 2 };
    return { label: 'Low', cls: 'risk-low', rank: 1 };
  }
  function computeRisk(rec) {
    if (rec.likelihood == null || rec.consequence == null) return null;
    return Number(rec.likelihood) * Number(rec.consequence);
  }
  function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  function targetClose(rec) {
    var sev = Number(rec.severity) || Number(rec.consequence) || 3;
    return addDays(rec.dateReported || today(), SLA_DAYS[sev] || 14);
  }
  function caseOverdue(r) { return r.status !== 'Closed' && r.targetCloseDate && today() > r.targetCloseDate; }

  /* ------------------------------ Reports CRUD ---------------------------- */
  function all() { return readList(KEY).sort(function (a, b) { return new Date(b.dateReported) - new Date(a.dateReported); }); }
  function get(id) { return readList(KEY).filter(function (r) { return r.id === id; })[0] || null; }

  function nextRef(typeId, list) {
    var meta = typeMeta(typeId), year = new Date().getFullYear();
    var count = list.filter(function (r) {
      return typeMeta(r.type).prefix === meta.prefix && new Date(r.dateReported).getFullYear() === year;
    }).length + 1;
    return meta.prefix + '-' + year + '-' + String(count).padStart(3, '0');
  }

  function add(rec) {
    var list = readList(KEY);
    rec.id = uid('r');
    rec.refNo = nextRef(rec.type, list);
    rec.status = rec.status || 'Open';
    rec.consequence = Number(rec.severity) || Number(rec.consequence) || null;
    rec.likelihood = rec.likelihood != null ? Number(rec.likelihood) : null;
    rec.riskScore = computeRisk(rec);
    rec.attachments = rec.attachments || [];
    rec.actions = rec.actions || [];
    rec.history = rec.history || [{ ts: new Date().toISOString(), action: 'Raised', detail: rec.reporter || '' }];
    rec.targetCloseDate = targetClose(rec);
    rec.createdAt = new Date().toISOString();
    rec.updatedAt = rec.createdAt;
    list.push(rec);
    write(KEY, list);
    return rec;
  }

  function logHistory(reportId, action, detail) {
    var list = readList(KEY);
    var r = list.filter(function (x) { return x.id === reportId; })[0];
    if (!r) return;
    r.history = r.history || [];
    r.history.push({ ts: new Date().toISOString(), action: action, detail: detail || '' });
    write(KEY, list);
  }

  function update(id, patch) {
    var list = readList(KEY);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        Object.assign(list[i], patch);
        if (patch.severity != null) { list[i].consequence = Number(patch.severity); list[i].targetCloseDate = targetClose(list[i]); }
        list[i].riskScore = computeRisk(list[i]);
        if (patch.status === 'Closed' && !list[i].dateClosed) list[i].dateClosed = today();
        if (patch.status && patch.status !== 'Closed') list[i].dateClosed = null;
        list[i].updatedAt = new Date().toISOString();
        write(KEY, list);
        return list[i];
      }
    }
    return null;
  }

  function remove(id) { write(KEY, readList(KEY).filter(function (r) { return r.id !== id; })); }
  function clear() { write(KEY, []); }
  function exportJSON() { return JSON.stringify(readList(KEY), null, 2); }
  function importJSON(text, replace) {
    var incoming = JSON.parse(text);
    if (!Array.isArray(incoming)) throw new Error('Expected a JSON array of reports');
    var list = replace ? incoming : readList(KEY).concat(incoming);
    write(KEY, list);
    return list.length;
  }

  /* ------------------------- CAPA / action register ----------------------- */
  function addAction(reportId, action) {
    var list = readList(KEY);
    var r = list.filter(function (x) { return x.id === reportId; })[0];
    if (!r) return null;
    r.actions = r.actions || [];
    action.id = uid('act'); action.status = action.status || 'Open'; action.createdAt = new Date().toISOString();
    r.actions.push(action);
    write(KEY, list);
    return action;
  }
  function updateAction(reportId, actionId, patch) {
    var list = readList(KEY);
    var r = list.filter(function (x) { return x.id === reportId; })[0];
    if (!r || !r.actions) return null;
    var a = r.actions.filter(function (x) { return x.id === actionId; })[0];
    if (!a) return null;
    Object.assign(a, patch);
    if (patch.status === 'Done' && !a.completedAt) a.completedAt = today();
    if (patch.status && patch.status !== 'Done') a.completedAt = null;
    write(KEY, list);
    return a;
  }
  function removeAction(reportId, actionId) {
    var list = readList(KEY);
    var r = list.filter(function (x) { return x.id === reportId; })[0];
    if (!r || !r.actions) return;
    r.actions = r.actions.filter(function (x) { return x.id !== actionId; });
    write(KEY, list);
  }
  function actionOverdue(a) { return a.status !== 'Done' && a.dueDate && today() > a.dueDate; }
  function allActions() {
    var out = [];
    all().forEach(function (r) {
      (r.actions || []).forEach(function (a) {
        out.push(Object.assign({}, a, { reportId: r.id, refNo: r.refNo, reportTitle: r.title }));
      });
    });
    return out.sort(function (a, b) { return (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1; });
  }

  /* ------------------------------ Demo data ------------------------------- */
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function seedDemo(n) {
    n = n || 42;
    seedSettings();
    var TYPES = reportTypes(), LOCS = locations(), PEOPLE = people(), CUSTS = customers().concat(['']), CAUSES = rootCauses();
    var list = [], now = new Date();
    for (var i = 0; i < n; i++) {
      var t = pick(TYPES);
      var daysAgo = Math.floor(Math.pow(Math.random(), 1.4) * 330);
      var occurred = new Date(now.getTime() - daysAgo * 86400000);
      var occIso = occurred.toISOString().slice(0, 10);
      var severity = 1 + Math.floor(Math.random() * 5);
      var status = pick(STATUSES.concat(['Closed', 'Closed', 'In Progress']));
      var likelihood = status === 'Open' ? null : 1 + Math.floor(Math.random() * 5);
      var closed = status === 'Closed' ? addDays(occIso, 1 + Math.floor(Math.random() * 25)) : null;
      var rec = {
        id: uid('r'), type: t.id, title: demoTitle(t.id),
        description: 'Auto-generated demo record for ' + t.id + ' (placeholder, not real).',
        category: pick(CATEGORIES), customer: pick(CUSTS), location: pick(LOCS),
        department: pick(departments()), reporter: pick(PEOPLE),
        assignedTo: status === 'Open' ? '' : pick(PEOPLE), notifyEmail: '',
        dateOccurred: occIso, dateReported: occIso,
        severity: severity, consequence: severity, likelihood: likelihood,
        riskScore: likelihood ? likelihood * severity : null,
        rootCause: status === 'Open' ? '' : pick(CAUSES),
        immediateAction: status === 'Open' ? '' : 'Area made safe / supervisor notified.',
        correctiveAction: status === 'Closed' ? 'Procedure updated and team briefed.' : '',
        status: status, dateClosed: closed, attachments: [], actions: [],
        createdAt: occurred.toISOString(), updatedAt: (closed ? new Date(closed) : occurred).toISOString()
      };
      rec.targetCloseDate = targetClose(rec);
      // give some in-progress cases an open action so the CAPA register isn't empty
      if (status === 'In Progress' && Math.random() < 0.6) {
        rec.actions.push({ id: uid('act'), description: 'Follow up: ' + pick(CAUSES).toLowerCase(),
          owner: pick(PEOPLE), dueDate: addDays(occIso, 10 + Math.floor(Math.random() * 20)),
          status: pick(['Open', 'Open', 'In Progress']), createdAt: occurred.toISOString() });
      }
      list.push(rec);
    }
    list.sort(function (a, b) { return new Date(a.dateReported) - new Date(b.dateReported); });
    var counters = {};
    list.forEach(function (r) {
      var p = typeMeta(r.type).prefix, y = new Date(r.dateReported).getFullYear(), k = p + y;
      counters[k] = (counters[k] || 0) + 1;
      r.refNo = p + '-' + y + '-' + String(counters[k]).padStart(3, '0');
    });
    write(KEY, list);
    return list.length;
  }

  function demoTitle(type) {
    var map = {
      'Non-Conformance': ['Mislabelled pallet shipped', 'Documentation missing on outbound load', 'Wrong SKU picked'],
      'Accident': ['Forklift contact with racking', 'Slip on wet floor', 'Manual handling strain'],
      'Near Miss': ['Pedestrian in forklift lane', 'Load shifted on trailer', 'Unsecured ladder'],
      'Observation': ['Blocked fire exit observed', 'Good housekeeping in Bay 2', 'Faded floor markings'],
      'Improvement': ['Add mirror at blind corner', 'Relocate first-aid station', 'Better lighting in dock'],
      'Prevention': ['Scheduled racking inspection', 'Toolbox talk on PPE', 'Spill kit restocked']
    };
    return pick(map[type] || ['Report']);
  }

  /* =========================== AUDIT TEMPLATES ============================ */
  function auditTemplates() { return readList(AUDIT_TPL_KEY); }
  function getAuditTemplate(id) { return auditTemplates().filter(function (t) { return t.id === id; })[0] || null; }
  function saveAuditTemplate(tpl) {
    var list = readList(AUDIT_TPL_KEY);
    if (tpl.id) { for (var i = 0; i < list.length; i++) if (list[i].id === tpl.id) { list[i] = tpl; write(AUDIT_TPL_KEY, list); return tpl; } }
    tpl.id = uid('tpl'); tpl.createdAt = new Date().toISOString();
    list.push(tpl); write(AUDIT_TPL_KEY, list); return tpl;
  }
  function removeAuditTemplate(id) { write(AUDIT_TPL_KEY, readList(AUDIT_TPL_KEY).filter(function (t) { return t.id !== id; })); }
  function completedAudits() { return readList(AUDIT_DONE_KEY).sort(function (a, b) { return new Date(b.date) - new Date(a.date); }); }
  function getCompletedAudit(id) { return readList(AUDIT_DONE_KEY).filter(function (a) { return a.id === id; })[0] || null; }
  function saveCompletedAudit(a) { var list = readList(AUDIT_DONE_KEY); a.id = uid('aud'); a.createdAt = new Date().toISOString(); list.push(a); write(AUDIT_DONE_KEY, list); return a; }
  function removeCompletedAudit(id) { write(AUDIT_DONE_KEY, readList(AUDIT_DONE_KEY).filter(function (a) { return a.id !== id; })); }

  /* --------------------- Audit scheduling / recurrence -------------------- */
  var FREQ_DAYS = { Daily: 1, Weekly: 7, Fortnightly: 14, Monthly: 30, Quarterly: 91 };
  function advanceSchedule(templateId) {
    var list = readList(AUDIT_TPL_KEY);
    var t = list.filter(function (x) { return x.id === templateId; })[0];
    if (!t || !t.schedule || t.schedule.frequency === 'None' || !FREQ_DAYS[t.schedule.frequency]) return;
    var base = t.schedule.nextDue && t.schedule.nextDue > today() ? t.schedule.nextDue : today();
    t.schedule.nextDue = addDays(base, FREQ_DAYS[t.schedule.frequency]);
    write(AUDIT_TPL_KEY, list);
  }
  function dueAudits() {
    return auditTemplates().filter(function (t) {
      return t.schedule && t.schedule.frequency !== 'None' && t.schedule.nextDue && t.schedule.nextDue <= today();
    });
  }

  /* ----------------------------- Documents -------------------------------- */
  function documents() { return readList(DOCS_KEY).sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }); }
  function getDocument(id) { return readList(DOCS_KEY).filter(function (d) { return d.id === id; })[0] || null; }
  function addDocument(doc) { var list = readList(DOCS_KEY); doc.id = uid('doc'); doc.createdAt = new Date().toISOString(); list.push(doc); write(DOCS_KEY, list); return doc; }
  function removeDocument(id) { write(DOCS_KEY, readList(DOCS_KEY).filter(function (d) { return d.id !== id; })); }

  function seedAuditTemplates() {
    if (readList(AUDIT_TPL_KEY).length) return;
    var seeds = [
      { title: 'Forklift Pre-Start Inspection', category: 'Safety', items: [
        { text: 'Tyres in good condition' }, { text: 'Horn and lights working' }, { text: 'Forks / mast undamaged' },
        { text: 'Seatbelt functional' }, { text: 'No hydraulic leaks' }, { text: 'Brakes effective' } ] },
      { title: 'Warehouse Housekeeping (5S)', category: 'Quality', items: [
        { text: 'Walkways clear and marked' }, { text: 'Racking labelled correctly' }, { text: 'No damaged pallets in use' },
        { text: 'Waste segregated' }, { text: 'Spill kits stocked' } ] },
      { title: 'Fire & Emergency Readiness', category: 'Safety', items: [
        { text: 'Exits unobstructed' }, { text: 'Extinguishers tagged & in date' },
        { text: 'Assembly point signage visible' }, { text: 'Alarm test current', requireComment: true } ] },
      { title: 'Dock Condition Survey (mixed)', category: 'Quality', items: [
        { text: 'Any spills or leaks present?', type: 'yesno', good: 'No' },
        { text: 'Overall housekeeping rating', type: 'rating', threshold: 4 },
        { text: 'Dock door condition', type: 'select', options: ['Good', 'Fair', 'Poor'], acceptable: ['Good', 'Fair'] },
        { text: 'PPE observed in use', type: 'multi', options: ['Hi-vis', 'Steel caps', 'Gloves', 'Hearing'] },
        { text: 'Ambient temperature (°C)', type: 'number', min: 5, max: 35 },
        { text: 'Notes / observations', type: 'text' } ] }
    ];
    seeds.forEach(function (s) {
      s.items = s.items.map(function (it) {
        return { id: uid('q'), text: it.text, type: it.type || 'passfail', requireComment: !!it.requireComment,
          options: it.options || [], good: it.good || 'Yes', acceptable: it.acceptable || [],
          min: it.min == null ? '' : it.min, max: it.max == null ? '' : it.max, threshold: it.threshold == null ? '' : it.threshold };
      });
      saveAuditTemplate(s);
    });
  }

  /* ------------------------------- Export --------------------------------- */
  global.HSEQStore = {
    KEY: KEY, CATEGORIES: CATEGORIES, STATUSES: STATUSES, ACTION_STATUSES: ACTION_STATUSES,
    SEVERITY_LABELS: SEVERITY_LABELS, SLA_DAYS: SLA_DAYS, DEFAULTS: DEFAULTS,
    // settings
    getSettings: getSettings, saveSettings: saveSettings, seedSettings: seedSettings,
    reportTypes: reportTypes, rootCauses: rootCauses, locations: locations,
    departments: departments, customers: customers, people: people, org: org,
    // reports
    all: all, get: get, add: add, update: update, remove: remove, clear: clear,
    exportJSON: exportJSON, importJSON: importJSON, seedDemo: seedDemo,
    typeMeta: typeMeta, riskBand: riskBand, computeRisk: computeRisk, daysBetween: daysBetween,
    targetClose: targetClose, caseOverdue: caseOverdue, today: today, addDays: addDays, uid: uid,
    // CAPA + history
    addAction: addAction, updateAction: updateAction, removeAction: removeAction,
    actionOverdue: actionOverdue, allActions: allActions, logHistory: logHistory,
    // audits + scheduling
    auditTemplates: auditTemplates, getAuditTemplate: getAuditTemplate, saveAuditTemplate: saveAuditTemplate,
    removeAuditTemplate: removeAuditTemplate, completedAudits: completedAudits, getCompletedAudit: getCompletedAudit,
    saveCompletedAudit: saveCompletedAudit, removeCompletedAudit: removeCompletedAudit, seedAuditTemplates: seedAuditTemplates,
    FREQ_DAYS: FREQ_DAYS, advanceSchedule: advanceSchedule, dueAudits: dueAudits,
    // documents
    documents: documents, getDocument: getDocument, addDocument: addDocument, removeDocument: removeDocument
  };
})(window);

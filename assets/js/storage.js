/* ==========================================================================
   OpenHSEQ — storage.js
   Data layer: localStorage CRUD, demo seeding, risk + audit helpers.
   No backend, no API. Everything lives in the browser.

   Workflow model (staged):
     Open        -> raised on the floor: type, title, location, severity, etc.
     In Progress -> HSEQ adds likelihood, root cause, immediate action (triage)
     Closed      -> HSEQ adds the corrective action
   ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'openhseq.reports.v1';
  var AUDIT_TPL_KEY = 'openhseq.auditTemplates.v1';
  var AUDIT_DONE_KEY = 'openhseq.auditsCompleted.v1';

  /* ----- Reference data ---------------------------------------------------- */
  var REPORT_TYPES = [
    { id: 'Non-Conformance', prefix: 'NCR', recordable: true },
    { id: 'Accident',        prefix: 'ACC', recordable: true },
    { id: 'Near Miss',       prefix: 'NM',  recordable: false },
    { id: 'Observation',     prefix: 'OBS', recordable: false },
    { id: 'Improvement',     prefix: 'IMP', recordable: false },
    { id: 'Prevention',      prefix: 'PRV', recordable: false }
  ];

  var CATEGORIES = ['Health', 'Safety', 'Environment', 'Quality'];

  var ROOT_CAUSES = [
    'Human error', 'Inadequate procedure', 'Equipment failure',
    'Lack of training', 'Poor communication', 'Environmental conditions',
    'Inadequate supervision', 'PPE not used', 'Housekeeping', 'Other'
  ];

  var STATUSES = ['Open', 'In Progress', 'Closed'];

  var SEVERITY_LABELS = { 1: 'Insignificant', 2: 'Minor', 3: 'Moderate', 4: 'Major', 5: 'Severe' };

  var DEMO_LOCATIONS = [
    'Brisbane Depot', 'Melbourne Yard', 'Sydney Wharf',
    'Warehouse A', 'Loading Dock 3', 'Workshop', 'Office', 'Container Park'
  ];

  var DEMO_PEOPLE = [
    'T. Nixon', 'A. Smith', 'J. Chen', 'M. Patel',
    'R. O\'Brien', 'S. Kowalski', 'L. Nguyen', 'D. Okafor'
  ];

  var DEMO_CUSTOMERS = [
    'Acme Freight', 'Santos', 'BlueScope', 'Origin Energy',
    'Rio Tinto', 'Coles DC', 'Incitec Pivot', ''
  ];

  /* --------------------------------- Utils -------------------------------- */
  function uid(p) {
    return (p || 'r') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function read(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('OpenHSEQ: failed to read ' + key, e);
      return [];
    }
  }

  function write(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error('OpenHSEQ: failed to write ' + key, e);
      alert('Could not save — browser storage may be full (large attachments?).');
      return false;
    }
  }

  function typeMeta(typeId) {
    for (var i = 0; i < REPORT_TYPES.length; i++) {
      if (REPORT_TYPES[i].id === typeId) return REPORT_TYPES[i];
    }
    return { id: typeId, prefix: 'GEN', recordable: false };
  }

  function nextRef(typeId, list) {
    var meta = typeMeta(typeId);
    var year = new Date().getFullYear();
    var count = list.filter(function (r) {
      return typeMeta(r.type).prefix === meta.prefix &&
        new Date(r.dateReported).getFullYear() === year;
    }).length + 1;
    return meta.prefix + '-' + year + '-' + String(count).padStart(3, '0');
  }

  function riskBand(score) {
    if (!score && score !== 0) return { label: 'Untriaged', cls: 'risk-untriaged', rank: 0 };
    if (score >= 15) return { label: 'Extreme', cls: 'risk-extreme', rank: 4 };
    if (score >= 10) return { label: 'High',    cls: 'risk-high',    rank: 3 };
    if (score >= 5)  return { label: 'Medium',  cls: 'risk-medium',  rank: 2 };
    return { label: 'Low', cls: 'risk-low', rank: 1 };
  }

  function computeRisk(rec) {
    if (rec.likelihood == null || rec.consequence == null) return null;
    return Number(rec.likelihood) * Number(rec.consequence);
  }

  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  /* ------------------------------ Reports CRUD ---------------------------- */
  function all() {
    return read(KEY).sort(function (a, b) {
      return new Date(b.dateReported) - new Date(a.dateReported);
    });
  }
  function get(id) { return read(KEY).filter(function (r) { return r.id === id; })[0] || null; }

  function add(rec) {
    var list = read(KEY);
    rec.id = uid('r');
    rec.refNo = nextRef(rec.type, list);
    rec.status = rec.status || 'Open';
    // severity = "how bad" captured on the floor -> seeds the consequence axis
    rec.consequence = Number(rec.severity) || Number(rec.consequence) || null;
    rec.likelihood = rec.likelihood != null ? Number(rec.likelihood) : null;
    rec.riskScore = computeRisk(rec);
    rec.attachments = rec.attachments || [];
    rec.createdAt = new Date().toISOString();
    rec.updatedAt = rec.createdAt;
    list.push(rec);
    write(KEY, list);
    return rec;
  }

  function update(id, patch) {
    var list = read(KEY);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        Object.assign(list[i], patch);
        if (patch.severity != null) list[i].consequence = Number(patch.severity);
        list[i].riskScore = computeRisk(list[i]);
        if (patch.status === 'Closed' && !list[i].dateClosed) {
          list[i].dateClosed = new Date().toISOString().slice(0, 10);
        }
        if (patch.status && patch.status !== 'Closed') list[i].dateClosed = null;
        list[i].updatedAt = new Date().toISOString();
        write(KEY, list);
        return list[i];
      }
    }
    return null;
  }

  function remove(id) { write(KEY, read(KEY).filter(function (r) { return r.id !== id; })); }
  function clear() { write(KEY, []); }
  function exportJSON() { return JSON.stringify(read(KEY), null, 2); }
  function importJSON(text, replace) {
    var incoming = JSON.parse(text);
    if (!Array.isArray(incoming)) throw new Error('Expected a JSON array of reports');
    var list = replace ? incoming : read(KEY).concat(incoming);
    write(KEY, list);
    return list.length;
  }

  /* ------------------------------ Demo data ------------------------------- */
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function seedDemo(n) {
    n = n || 42;
    var list = [];
    var now = new Date();
    for (var i = 0; i < n; i++) {
      var t = pick(REPORT_TYPES);
      var daysAgo = Math.floor(Math.pow(Math.random(), 1.4) * 330);
      var occurred = new Date(now.getTime() - daysAgo * 86400000);
      var severity = 1 + Math.floor(Math.random() * 5);
      var status = pick(STATUSES.concat(['Closed', 'Closed', 'In Progress']));
      // likelihood is only known once a case is triaged (In Progress / Closed)
      var likelihood = status === 'Open' ? null : 1 + Math.floor(Math.random() * 5);
      var closed = status === 'Closed'
        ? new Date(occurred.getTime() + (1 + Math.floor(Math.random() * 25)) * 86400000)
        : null;
      var rec = {
        id: uid('r'),
        type: t.id,
        title: demoTitle(t.id),
        description: 'Auto-generated demo record for ' + t.id + ' (placeholder, not real).',
        category: pick(CATEGORIES),
        customer: pick(DEMO_CUSTOMERS),
        location: pick(DEMO_LOCATIONS),
        department: pick(['Operations', 'Warehouse', 'Transport', 'Admin', 'Maintenance']),
        reporter: pick(DEMO_PEOPLE),
        assignedTo: status === 'Open' ? '' : pick(DEMO_PEOPLE),
        notifyEmail: '',
        dateOccurred: occurred.toISOString().slice(0, 10),
        dateReported: occurred.toISOString().slice(0, 10),
        severity: severity,
        consequence: severity,
        likelihood: likelihood,
        riskScore: likelihood ? likelihood * severity : null,
        rootCause: status === 'Open' ? '' : pick(ROOT_CAUSES),
        immediateAction: status === 'Open' ? '' : 'Area made safe / supervisor notified.',
        correctiveAction: status === 'Closed' ? 'Procedure updated and team briefed.' : '',
        status: status,
        dateClosed: closed ? closed.toISOString().slice(0, 10) : null,
        attachments: [],
        createdAt: occurred.toISOString(),
        updatedAt: (closed || occurred).toISOString()
      };
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
  function auditTemplates() { return read(AUDIT_TPL_KEY); }
  function getAuditTemplate(id) { return auditTemplates().filter(function (t) { return t.id === id; })[0] || null; }
  function saveAuditTemplate(tpl) {
    var list = read(AUDIT_TPL_KEY);
    if (tpl.id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === tpl.id) { list[i] = tpl; write(AUDIT_TPL_KEY, list); return tpl; }
    }
    tpl.id = uid('tpl');
    tpl.createdAt = new Date().toISOString();
    list.push(tpl);
    write(AUDIT_TPL_KEY, list);
    return tpl;
  }
  function removeAuditTemplate(id) { write(AUDIT_TPL_KEY, read(AUDIT_TPL_KEY).filter(function (t) { return t.id !== id; })); }

  function completedAudits() {
    return read(AUDIT_DONE_KEY).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  }
  function getCompletedAudit(id) { return read(AUDIT_DONE_KEY).filter(function (a) { return a.id === id; })[0] || null; }
  function saveCompletedAudit(a) {
    var list = read(AUDIT_DONE_KEY);
    a.id = uid('aud');
    a.createdAt = new Date().toISOString();
    list.push(a);
    write(AUDIT_DONE_KEY, list);
    return a;
  }
  function removeCompletedAudit(id) { write(AUDIT_DONE_KEY, read(AUDIT_DONE_KEY).filter(function (a) { return a.id !== id; })); }

  function seedAuditTemplates() {
    if (read(AUDIT_TPL_KEY).length) return;
    var seeds = [
      { title: 'Forklift Pre-Start Inspection', category: 'Safety', items: [
        { text: 'Tyres in good condition' }, { text: 'Horn and lights working' },
        { text: 'Forks / mast undamaged' }, { text: 'Seatbelt functional' },
        { text: 'No hydraulic leaks' }, { text: 'Brakes effective' }
      ] },
      { title: 'Warehouse Housekeeping (5S)', category: 'Quality', items: [
        { text: 'Walkways clear and marked' }, { text: 'Racking labelled correctly' },
        { text: 'No damaged pallets in use' }, { text: 'Waste segregated' },
        { text: 'Spill kits stocked' }
      ] },
      { title: 'Fire & Emergency Readiness', category: 'Safety', items: [
        { text: 'Exits unobstructed' }, { text: 'Extinguishers tagged & in date' },
        { text: 'Assembly point signage visible' }, { text: 'Alarm test current', requireComment: true }
      ] }
    ];
    seeds.forEach(function (s) {
      s.items = s.items.map(function (it) { return { id: uid('q'), text: it.text, requireComment: !!it.requireComment }; });
      saveAuditTemplate(s);
    });
  }

  /* ------------------------------- Export --------------------------------- */
  global.HSEQStore = {
    KEY: KEY,
    REPORT_TYPES: REPORT_TYPES, CATEGORIES: CATEGORIES, ROOT_CAUSES: ROOT_CAUSES,
    STATUSES: STATUSES, SEVERITY_LABELS: SEVERITY_LABELS,
    DEMO_LOCATIONS: DEMO_LOCATIONS, DEMO_PEOPLE: DEMO_PEOPLE, DEMO_CUSTOMERS: DEMO_CUSTOMERS,
    all: all, get: get, add: add, update: update, remove: remove,
    clear: clear, seedDemo: seedDemo, exportJSON: exportJSON, importJSON: importJSON,
    typeMeta: typeMeta, riskBand: riskBand, computeRisk: computeRisk, daysBetween: daysBetween, uid: uid,
    // audits
    auditTemplates: auditTemplates, getAuditTemplate: getAuditTemplate,
    saveAuditTemplate: saveAuditTemplate, removeAuditTemplate: removeAuditTemplate,
    completedAudits: completedAudits, getCompletedAudit: getCompletedAudit,
    saveCompletedAudit: saveCompletedAudit, removeCompletedAudit: removeCompletedAudit,
    seedAuditTemplates: seedAuditTemplates
  };
})(window);

/* ==========================================================================
   OpenHSEQ — storage.js
   Data layer: localStorage CRUD, demo seeding, risk + reference helpers.
   No backend, no API. Everything lives in the browser.
   ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'openhseq.reports.v1';
  var SETTINGS_KEY = 'openhseq.settings.v1';

  /* ----- Reference data (mirrors HSEQ "Quick Report" types + adds metadata) - */
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

  var DEMO_LOCATIONS = [
    'Brisbane Depot', 'Melbourne Yard', 'Sydney Wharf',
    'Warehouse A', 'Loading Dock 3', 'Workshop', 'Office', 'Container Park'
  ];

  var DEMO_PEOPLE = [
    'T. Nixon', 'A. Smith', 'J. Chen', 'M. Patel',
    'R. O\'Brien', 'S. Kowalski', 'L. Nguyen', 'D. Okafor'
  ];

  /* --------------------------------- Utils -------------------------------- */
  function uid() {
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('OpenHSEQ: failed to read store', e);
      return [];
    }
  }

  function write(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  function typeMeta(typeId) {
    for (var i = 0; i < REPORT_TYPES.length; i++) {
      if (REPORT_TYPES[i].id === typeId) return REPORT_TYPES[i];
    }
    return { id: typeId, prefix: 'GEN', recordable: false };
  }

  /* Sequential reference number per type, e.g. NCR-2026-007 */
  function nextRef(typeId, list) {
    var meta = typeMeta(typeId);
    var year = new Date().getFullYear();
    var count = list.filter(function (r) {
      return typeMeta(r.type).prefix === meta.prefix &&
        new Date(r.dateReported).getFullYear() === year;
    }).length + 1;
    return meta.prefix + '-' + year + '-' + String(count).padStart(3, '0');
  }

  /* Risk = likelihood (1-5) x consequence (1-5) -> band */
  function riskBand(score) {
    if (score >= 15) return { label: 'Extreme', cls: 'risk-extreme', rank: 4 };
    if (score >= 10) return { label: 'High',    cls: 'risk-high',    rank: 3 };
    if (score >= 5)  return { label: 'Medium',  cls: 'risk-medium',  rank: 2 };
    return { label: 'Low', cls: 'risk-low', rank: 1 };
  }

  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  /* ------------------------------- CRUD API ------------------------------- */
  function all() {
    // newest first
    return read().sort(function (a, b) {
      return new Date(b.dateReported) - new Date(a.dateReported);
    });
  }

  function get(id) {
    return read().filter(function (r) { return r.id === id; })[0] || null;
  }

  function add(rec) {
    var list = read();
    rec.id = uid();
    rec.refNo = nextRef(rec.type, list);
    rec.createdAt = new Date().toISOString();
    rec.updatedAt = rec.createdAt;
    rec.riskScore = (Number(rec.likelihood) || 1) * (Number(rec.consequence) || 1);
    list.push(rec);
    write(list);
    return rec;
  }

  function update(id, patch) {
    var list = read();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        Object.assign(list[i], patch);
        list[i].updatedAt = new Date().toISOString();
        if (patch.likelihood || patch.consequence) {
          list[i].riskScore = (Number(list[i].likelihood) || 1) * (Number(list[i].consequence) || 1);
        }
        if (patch.status === 'Closed' && !list[i].dateClosed) {
          list[i].dateClosed = new Date().toISOString().slice(0, 10);
        }
        if (patch.status && patch.status !== 'Closed') {
          list[i].dateClosed = null;
        }
        write(list);
        return list[i];
      }
    }
    return null;
  }

  function remove(id) {
    write(read().filter(function (r) { return r.id !== id; }));
  }

  function clear() { write([]); }

  function exportJSON() {
    return JSON.stringify(read(), null, 2);
  }

  function importJSON(text, replace) {
    var incoming = JSON.parse(text);
    if (!Array.isArray(incoming)) throw new Error('Expected a JSON array of reports');
    var list = replace ? incoming : read().concat(incoming);
    write(list);
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
      // spread reports across the last ~11 months, weighted to recent
      var daysAgo = Math.floor(Math.pow(Math.random(), 1.4) * 330);
      var occurred = new Date(now.getTime() - daysAgo * 86400000);
      var likelihood = 1 + Math.floor(Math.random() * 5);
      var consequence = 1 + Math.floor(Math.random() * 5);
      var status = pick(STATUSES.concat(['Closed', 'Closed'])); // bias to closed
      var closed = status === 'Closed'
        ? new Date(occurred.getTime() + (1 + Math.floor(Math.random() * 25)) * 86400000)
        : null;
      var rec = {
        id: uid(),
        type: t.id,
        title: demoTitle(t.id),
        description: 'Auto-generated demo record for ' + t.id + ' at the site.',
        category: pick(CATEGORIES),
        location: pick(DEMO_LOCATIONS),
        department: pick(['Operations', 'Warehouse', 'Transport', 'Admin', 'Maintenance']),
        reporter: pick(DEMO_PEOPLE),
        assignedTo: pick(DEMO_PEOPLE),
        dateOccurred: occurred.toISOString().slice(0, 10),
        dateReported: occurred.toISOString().slice(0, 10),
        likelihood: likelihood,
        consequence: consequence,
        riskScore: likelihood * consequence,
        rootCause: pick(ROOT_CAUSES),
        immediateAction: 'Area made safe / supervisor notified.',
        correctiveAction: status === 'Closed' ? 'Procedure updated and team briefed.' : '',
        status: status,
        cost: t.recordable ? Math.floor(Math.random() * 9000) : Math.floor(Math.random() * 800),
        dateClosed: closed ? closed.toISOString().slice(0, 10) : null,
        createdAt: occurred.toISOString(),
        updatedAt: (closed || occurred).toISOString()
      };
      list.push(rec);
    }
    // assign reference numbers in chronological order
    list.sort(function (a, b) { return new Date(a.dateReported) - new Date(b.dateReported); });
    var counters = {};
    list.forEach(function (r) {
      var p = typeMeta(r.type).prefix;
      var y = new Date(r.dateReported).getFullYear();
      var k = p + y;
      counters[k] = (counters[k] || 0) + 1;
      r.refNo = p + '-' + y + '-' + String(counters[k]).padStart(3, '0');
    });
    write(list);
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

  /* ------------------------------- Export --------------------------------- */
  global.HSEQStore = {
    KEY: KEY, SETTINGS_KEY: SETTINGS_KEY,
    REPORT_TYPES: REPORT_TYPES, CATEGORIES: CATEGORIES,
    ROOT_CAUSES: ROOT_CAUSES, STATUSES: STATUSES,
    DEMO_LOCATIONS: DEMO_LOCATIONS, DEMO_PEOPLE: DEMO_PEOPLE,
    all: all, get: get, add: add, update: update, remove: remove,
    clear: clear, seedDemo: seedDemo,
    exportJSON: exportJSON, importJSON: importJSON,
    typeMeta: typeMeta, riskBand: riskBand, daysBetween: daysBetween
  };
})(window);

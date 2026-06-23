/* ==========================================================================
   OpenHSEQ — charts.js
   All dashboard visualisations (Chart.js) + the safety pyramid.
   ========================================================================== */
(function (global) {
  'use strict';

  var instances = {};
  var PALETTE = ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#8b5cf6', '#0891b2', '#eab308', '#64748b'];

  function destroy(id) { if (instances[id]) { instances[id].destroy(); delete instances[id]; } }

  function make(id, config) {
    var el = document.getElementById(id);
    if (!el) return;
    destroy(id);
    instances[id] = new Chart(el.getContext('2d'), config);
  }

  function countBy(list, keyFn) {
    var m = {};
    list.forEach(function (r) { var k = keyFn(r); m[k] = (m[k] || 0) + 1; });
    return m;
  }

  function monthKey(d) {
    var dt = new Date(d);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
  }
  function last12Months() {
    var out = [], now = new Date();
    for (var i = 11; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    return out;
  }
  function monthLabel(key) {
    var p = key.split('-');
    var names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return names[parseInt(p[1], 10) - 1] + " '" + p[0].slice(2);
  }

  function renderAll(list) {
    var noLegend = { plugins: { legend: { display: false } }, maintainAspectRatio: false };

    // Reports by type (doughnut)
    var byType = countBy(list, function (r) { return r.type; });
    make('chartType', {
      type: 'doughnut',
      data: { labels: Object.keys(byType), datasets: [{ data: Object.values(byType), backgroundColor: PALETTE }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } } }
    });

    // Monthly trend (line)
    var months = last12Months();
    var byMonth = countBy(list, function (r) { return monthKey(r.dateReported); });
    make('chartTrend', {
      type: 'line',
      data: { labels: months.map(monthLabel),
        datasets: [{ label: 'Reports', data: months.map(function (m) { return byMonth[m] || 0; }),
          borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.12)', fill: true, tension: .3, pointRadius: 3 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    // Status breakdown (doughnut)
    var byStatus = countBy(list, function (r) { return r.status; });
    var statusColors = { 'Open': '#dc2626', 'In Progress': '#eab308', 'Closed': '#16a34a' };
    make('chartStatus', {
      type: 'doughnut',
      data: { labels: Object.keys(byStatus),
        datasets: [{ data: Object.values(byStatus), backgroundColor: Object.keys(byStatus).map(function (s) { return statusColors[s] || '#64748b'; }) }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } } }
    });

    // Category H/S/E/Q (bar)
    var byCat = countBy(list, function (r) { return r.category; });
    make('chartCategory', {
      type: 'bar',
      data: { labels: Object.keys(byCat), datasets: [{ data: Object.values(byCat), backgroundColor: PALETTE }] },
      options: Object.assign({ scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }, noLegend)
    });

    // Top locations (horizontal bar)
    var byLoc = countBy(list, function (r) { return r.location; });
    var locSorted = Object.keys(byLoc).sort(function (a, b) { return byLoc[b] - byLoc[a]; }).slice(0, 8);
    make('chartLocation', {
      type: 'bar',
      data: { labels: locSorted, datasets: [{ data: locSorted.map(function (l) { return byLoc[l]; }), backgroundColor: '#0891b2' }] },
      options: Object.assign({ indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }, noLegend)
    });

    // Root-cause Pareto (only triaged records carry a cause)
    var withCause = list.filter(function (r) { return r.rootCause; });
    var byCause = countBy(withCause, function (r) { return r.rootCause; });
    var causes = Object.keys(byCause).sort(function (a, b) { return byCause[b] - byCause[a]; });
    var total = withCause.length || 1, cum = 0;
    var cumPct = causes.map(function (c) { cum += byCause[c]; return Math.round(cum / total * 100); });
    make('chartPareto', {
      data: { labels: causes,
        datasets: [
          { type: 'bar', label: 'Count', data: causes.map(function (c) { return byCause[c]; }), backgroundColor: '#2563eb', order: 2 },
          { type: 'line', label: 'Cumulative %', data: cumPct, borderColor: '#dc2626', backgroundColor: '#dc2626', yAxisID: 'y1', tension: .2, pointRadius: 3, order: 1 }
        ] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
          y1: { beginAtZero: true, max: 100, position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: function (v) { return v + '%'; } } },
          x: { ticks: { font: { size: 9 }, maxRotation: 60, minRotation: 40 } }
        } }
    });

    // Reports by severity (bar)
    var bySev = {};
    [1, 2, 3, 4, 5].forEach(function (s) { bySev[s] = 0; });
    list.forEach(function (r) { var s = Number(r.severity) || Number(r.consequence); if (s) bySev[s] = (bySev[s] || 0) + 1; });
    var sevColors = ['#16a34a', '#84cc16', '#eab308', '#f97316', '#dc2626'];
    make('chartSeverity', {
      type: 'bar',
      data: { labels: ['1 Insig.', '2 Minor', '3 Mod.', '4 Major', '5 Severe'],
        datasets: [{ data: [1, 2, 3, 4, 5].map(function (s) { return bySev[s] || 0; }), backgroundColor: sevColors }] },
      options: Object.assign({ scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }, noLegend)
    });

    renderPyramid(list);
  }

  function renderPyramid(list) {
    var el = document.getElementById('pyramid');
    if (!el) return;
    var tiers = [
      { label: 'Accidents', color: '#dc2626', n: list.filter(function (r) { return r.type === 'Accident'; }).length, w: 46 },
      { label: 'Non-Conformances', color: '#f97316', n: list.filter(function (r) { return r.type === 'Non-Conformance'; }).length, w: 62 },
      { label: 'Near Misses', color: '#eab308', n: list.filter(function (r) { return r.type === 'Near Miss'; }).length, w: 80 },
      { label: 'Observations / Proactive', color: '#16a34a', n: list.filter(function (r) { return r.type === 'Observation' || r.type === 'Improvement' || r.type === 'Prevention'; }).length, w: 100 }
    ];
    el.innerHTML = tiers.map(function (t) {
      return '<div class="tier" style="width:' + t.w + '%;background:' + t.color + '">' + t.label + ' — <strong>' + t.n + '</strong></div>';
    }).join('');
  }

  global.HSEQCharts = { renderAll: renderAll };
})(window);

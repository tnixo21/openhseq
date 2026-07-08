/* ==========================================================================
   OpenHSEQ — settings.js
   Admin Settings tab: editable reference lists, report types, org branding,
   language, QR quick-raise links, and data tools (demo / backup / restore).
   ========================================================================== */
(function (global) {
  'use strict';
  var S = window.HSEQStore, UI = window.HSEQUI, I18N = window.HSEQI18n;
  function esc(s) { return UI.esc(s); }
  function $(s, r) { return (r || document).querySelector(s); }

  var root, draft;

  var LISTS = [
    { key: 'locations', label: 'Locations' },
    { key: 'departments', label: 'Departments' },
    { key: 'customers', label: 'Customers' },
    { key: 'rootCauses', label: 'Root causes' },
    { key: 'people', label: 'People (reporters / assignees / auditors)' }
  ];

  function render() {
    root = document.getElementById('settingsRoot');
    draft = JSON.parse(JSON.stringify(S.getSettings()));
    var langOpts = (I18N ? I18N.LANGS : [{ code: 'en', name: 'English' }]).map(function (l) {
      return '<option value="' + l.code + '"' + (draft.lang === l.code ? ' selected' : '') + '>' + esc(l.name) + '</option>';
    }).join('');

    root.innerHTML =
      '<div id="usersRoot"></div>' +
      '<div class="card"><h3>Organisation &amp; branding</h3>' +
        '<div class="form-grid">' +
        '<label>Organisation name<input type="text" id="set-orgname" value="' + esc(draft.org.name || '') + '" /></label>' +
        '<label>Language<select id="set-lang">' + langOpts + '</select></label>' +
        '<label class="span2">Logo (shown in sidebar &amp; on PDFs)<input type="file" id="set-logo" accept="image/*" /></label>' +
        '</div>' +
        '<div class="logo-preview">' + (draft.org.logo ? '<img src="' + draft.org.logo + '" alt="logo" /><button type="button" class="btn small" id="set-logo-remove">Remove logo</button>' : '<span class="muted">No logo set</span>') + '</div>' +
      '</div>' +

      '<div class="card"><h3>Report types</h3>' +
        '<p class="muted">Prefix drives the reference number; “recordable” counts toward the days-since-incident board.</p>' +
        '<div id="set-types"></div>' +
        '<button type="button" class="btn small" id="set-type-add">+ Add type</button>' +
      '</div>' +

      LISTS.map(function (l) {
        return '<div class="card"><h3>' + l.label + '</h3><div class="set-list" data-list="' + l.key + '"></div>' +
          '<button type="button" class="btn small" data-addto="' + l.key + '">+ Add</button></div>';
      }).join('') +

      '<div class="card"><h3>Quick-access QR codes</h3>' +
        '<p class="muted">Print a code at each location. Scanning opens that location’s hub — a “Raise a Report” button plus the audits that need doing. ' +
        '(Works once the app is hosted at a real URL; QR images need internet.)</p>' +
        '<div id="set-qr" class="qr-grid"></div>' +
      '</div>' +

      '<div class="form-actions"><button type="button" class="btn primary" id="set-save">Save settings</button>' +
      '<button type="button" class="btn" id="set-cancel">Cancel</button></div>' +

      '<div class="card"><h3>Data</h3>' +
        '<p class="muted">Sample reports are randomly generated placeholders — clear them before live use.</p>' +
        '<button type="button" class="btn primary" id="data-seed">Load demo data (42 reports)</button> ' +
        '<button type="button" class="btn danger" id="data-clear">Clear all reports</button>' +
        '<hr><button type="button" class="btn" id="data-export">Export JSON backup</button> ' +
        '<button type="button" class="btn" id="data-import">Import JSON…</button>' +
        '<input type="file" id="importFile" accept="application/json" hidden />' +
      '</div>';

    renderTypes(); LISTS.forEach(function (l) { renderList(l.key); }); renderQR();
    if (window.HSEQAuth) window.HSEQAuth.renderUsers(document.getElementById('usersRoot'));
  }

  function renderTypes() {
    $('#set-types').innerHTML = draft.reportTypes.map(function (t, i) {
      return '<div class="type-row" data-i="' + i + '">' +
        '<input type="text" class="t-id" value="' + esc(t.id) + '" placeholder="Type name" aria-label="Type name" />' +
        '<input type="text" class="t-prefix" value="' + esc(t.prefix) + '" placeholder="REF" maxlength="5" aria-label="Prefix" />' +
        '<label class="bld-req"><input type="checkbox" class="t-rec"' + (t.recordable ? ' checked' : '') + ' /> recordable</label>' +
        '<button type="button" class="btn small danger t-del" aria-label="Remove">×</button></div>';
    }).join('');
  }
  function renderList(key) {
    var box = $('.set-list[data-list="' + key + '"]');
    box.innerHTML = draft[key].map(function (v, i) {
      return '<div class="set-item" data-i="' + i + '"><input type="text" value="' + esc(v) + '" aria-label="' + key + ' item" />' +
        '<button type="button" class="btn small danger set-del" aria-label="Remove">×</button></div>';
    }).join('');
  }
  function renderQR() {
    var base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : location.href.split('?')[0];
    $('#set-qr').innerHTML = draft.locations.map(function (loc) {
      var url = base + '?hub=1&location=' + encodeURIComponent(loc);
      var qr = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(url);
      return '<div class="qr-card"><img src="' + qr + '" alt="QR for ' + esc(loc) + '" loading="lazy" /><div class="qr-name">' + esc(loc) + '</div>' +
        '<button type="button" class="btn small qr-copy" data-url="' + esc(url) + '">Copy link</button> ' +
        '<a class="btn small" href="' + esc(url) + '" target="_blank" rel="noopener">Preview</a></div>';
    }).join('');
  }

  function syncDraft() {
    if ($('#set-orgname')) draft.org.name = $('#set-orgname').value.trim();
    Array.prototype.forEach.call(document.querySelectorAll('#set-types .type-row'), function (row) {
      var i = Number(row.dataset.i);
      draft.reportTypes[i] = { id: row.querySelector('.t-id').value.trim(), prefix: (row.querySelector('.t-prefix').value.trim() || 'GEN').toUpperCase(), recordable: row.querySelector('.t-rec').checked };
    });
    LISTS.forEach(function (l) {
      Array.prototype.forEach.call(document.querySelectorAll('.set-list[data-list="' + l.key + '"] .set-item'), function (row) {
        draft[l.key][Number(row.dataset.i)] = row.querySelector('input').value.trim();
      });
    });
  }

  /* events (scoped to the settings root + data buttons) */
  document.addEventListener('click', function (e) {
    if (!document.getElementById('view-settings') || !document.getElementById('view-settings').classList.contains('active')) {
      // still allow data import handler wiring below to be harmless
    }
    var t = e.target;

    if (t.id === 'set-type-add') { syncDraft(); draft.reportTypes.push({ id: '', prefix: 'GEN', recordable: false }); renderTypes(); return; }
    if (t.classList && t.classList.contains('t-del')) { syncDraft(); draft.reportTypes.splice(Number(t.closest('.type-row').dataset.i), 1); renderTypes(); return; }
    var addto = t.getAttribute && t.getAttribute('data-addto');
    if (addto) { syncDraft(); draft[addto].push(''); renderList(addto); return; }
    if (t.classList && t.classList.contains('set-del')) { var box = t.closest('.set-list'); var key = box.dataset.list; syncDraft(); draft[key].splice(Number(t.closest('.set-item').dataset.i), 1); renderList(key); return; }
    if (t.id === 'set-logo-remove') { draft.org.logo = ''; render(); return; }
    if (t.classList && t.classList.contains('qr-copy')) {
      var url = t.dataset.url;
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { UI.toast('Link copied'); }, function () { prompt('Copy this link:', url); });
      else prompt('Copy this link:', url);
      return;
    }
    if (t.id === 'set-cancel') { render(); UI.toast('Reverted'); return; }
    if (t.id === 'set-save') {
      syncDraft();
      draft.reportTypes = draft.reportTypes.filter(function (x) { return x.id; });
      LISTS.forEach(function (l) { draft[l.key] = draft[l.key].filter(function (v) { return v && v.trim(); }); });
      if (!draft.reportTypes.length) { alert('Keep at least one report type.'); return; }
      S.saveSettings(draft);
      UI.refreshAll(); UI.toast('Settings saved');
      return;
    }

    // ---- data tools ----
    if (t.id === 'data-seed') { if (S.all().length && !confirm('Add demo data on top of existing reports?')) return; var n = S.seedDemo(42); UI.refreshAll(); UI.toast('Loaded ' + n + ' demo reports'); return; }
    if (t.id === 'data-clear') { if (!confirm('Delete ALL reports? This cannot be undone.')) return; S.clear(); UI.refreshAll(); UI.toast('All reports cleared'); return; }
    if (t.id === 'data-export') { UI.download('openhseq-backup.json', S.exportJSON(), 'application/json'); UI.toast('Backup exported'); return; }
    if (t.id === 'data-import') { $('#importFile').click(); return; }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'set-lang' && I18N) { I18N.setLang(t.value); draft.lang = t.value; return; }
    if (t.id === 'set-logo') {
      var f = t.files[0]; if (!f) return;
      if (f.size > 1.5 * 1024 * 1024) { alert('Logo too large — keep under 1.5 MB.'); return; }
      var reader = new FileReader(); reader.onload = function () { draft.org.logo = reader.result; render(); }; reader.readAsDataURL(f);
      return;
    }
    if (t.id === 'importFile') {
      var file = t.files[0]; if (!file) return;
      var reader2 = new FileReader();
      reader2.onload = function () { try { var n = S.importJSON(reader2.result, confirm('OK = replace all data, Cancel = merge.')); UI.refreshAll(); UI.toast('Imported — ' + n + ' total reports'); } catch (err) { alert('Import failed: ' + err.message); } };
      reader2.readAsText(file); t.value = '';
      return;
    }
  });

  global.HSEQSettings = { render: render };
})(window);

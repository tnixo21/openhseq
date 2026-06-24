/* ==========================================================================
   OpenHSEQ — docs.js
   Document Centre: store SOPs / SDS / policies, optionally linked to a report
   type. Reports show the documents that apply to their type.
   ========================================================================== */
(function (global) {
  'use strict';
  var S = window.HSEQStore, UI = window.HSEQUI;
  function esc(s) { return UI.esc(s); }
  function $(s, r) { return (r || document).querySelector(s); }

  var DOC_KINDS = ['SOP', 'SDS', 'Policy', 'Work Instruction', 'Form', 'Other'];
  var root;

  function render() {
    root = document.getElementById('docsRoot');
    var typeOpts = '<option value="">All report types</option>' + S.reportTypes().map(function (t) { return '<option>' + esc(t.id) + '</option>'; }).join('');
    var kindOpts = DOC_KINDS.map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('');
    var docs = S.documents();
    var rows = docs.length ? docs.map(function (d) {
      return '<tr><td><strong>' + esc(d.title) + '</strong></td><td><span class="badge type">' + esc(d.kind) + '</span></td>' +
        '<td>' + esc(d.linkedType || 'All') + '</td><td>' + esc((d.createdAt || '').slice(0, 10)) + '</td>' +
        '<td><a class="btn link" href="' + d.dataUrl + '" target="_blank" rel="noopener">Open</a>' +
        '<a class="btn link" href="' + d.dataUrl + '" download="' + esc(d.filename || d.title) + '">Download</a>' +
        '<button type="button" class="btn link" data-deldoc="' + d.id + '">Delete</button></td></tr>';
    }).join('') : '<tr><td colspan="5" class="empty">No documents yet — upload one above.</td></tr>';

    root.innerHTML =
      '<div class="card"><h3>Upload document</h3>' +
        '<div class="form-grid">' +
        '<label>Title *<input type="text" id="doc-title" placeholder="e.g. Forklift Operating Procedure" /></label>' +
        '<label>Kind<select id="doc-kind">' + kindOpts + '</select></label>' +
        '<label>Applies to report type<select id="doc-type">' + typeOpts + '</select></label>' +
        '<label>File *<input type="file" id="doc-file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" /></label>' +
        '</div>' +
        '<button type="button" class="btn primary" id="doc-save">Add to library</button>' +
        '<small class="hint">Stored in your browser (no server) — keep files under ~2 MB.</small>' +
      '</div>' +
      '<div class="card"><h3>Library (' + docs.length + ')</h3>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>Title</th><th>Kind</th><th>Applies to</th><th>Added</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  /* documents that apply to a given report type (type-specific + general) */
  function relatedHTML(typeId) {
    var docs = S.documents().filter(function (d) { return !d.linkedType || d.linkedType === typeId; });
    if (!docs.length) return '';
    var items = docs.map(function (d) { return '<li><a href="' + d.dataUrl + '" target="_blank" rel="noopener">' + esc(d.title) + '</a> <span class="badge type">' + esc(d.kind) + '</span></li>'; }).join('');
    return '<details class="history"><summary>Reference documents (' + docs.length + ')</summary><ul>' + items + '</ul></details>';
  }

  var pendingFile = null;
  document.addEventListener('change', function (e) {
    if (e.target.id === 'doc-file') {
      var f = e.target.files[0]; pendingFile = null;
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) { alert('File over 2 MB — keep documents small (no server).'); e.target.value = ''; return; }
      var reader = new FileReader();
      reader.onload = function () { pendingFile = { filename: f.name, dataUrl: reader.result }; };
      reader.readAsDataURL(f);
    }
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.id === 'doc-save') {
      var title = $('#doc-title') && $('#doc-title').value.trim();
      if (!title) { alert('Give the document a title.'); return; }
      if (!pendingFile) { alert('Choose a file.'); return; }
      S.addDocument({ title: title, kind: $('#doc-kind').value, linkedType: $('#doc-type').value, filename: pendingFile.filename, dataUrl: pendingFile.dataUrl });
      pendingFile = null; UI.toast('Document added'); render();
      return;
    }
    var del = t.closest && t.closest('[data-deldoc]');
    if (del) { if (confirm('Delete this document?')) { S.removeDocument(del.dataset.deldoc); render(); } }
  });

  global.HSEQDocs = { render: render, relatedHTML: relatedHTML };
})(window);

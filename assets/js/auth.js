/* ==========================================================================
   OpenHSEQ — auth.js
   Client-side access control: user accounts, hashed passwords, a session,
   and the 6-level capability model. First run creates the owner account.

   IMPORTANT — this is a browser-only gate, not server security. Everything
   runs on the client, so a determined user with dev-tools can read stored
   data. It stops casual/unauthorised access and enforces role-based UI, which
   is the intent here (no backend). Treat it as access control, not encryption.

   ---------------------------------------------------------------------------
   Access levels (1 = least, 6 = owner). Every level can raise reports.
     1  Raise reports + raise/run audits. No report viewing, no dashboards.
     2  + View audits. Still cannot view any reports.
     3  + View reports assigned to (or raised by) them.
     4  + Dashboards & analytics.
     5  + View all non-hidden reports. Can hide a report when raising it.
     6  + View ALL reports incl. hidden. Manage users (owner).
   ========================================================================== */
(function (global) {
  'use strict';

  var USERS_KEY = 'openhseq.users.v1';
  var SESSION_KEY = 'openhseq.session';          // sessionStorage — clears on tab close
  var OWNER_EMAIL = 'tnix@bws.dk';

  /* ------------------------------- storage -------------------------------- */
  function readUsers() {
    try { var raw = localStorage.getItem(USERS_KEY); var v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; }
    catch (e) { console.error('OpenHSEQ auth: read users failed', e); return []; }
  }
  function writeUsers(list) {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(list)); return true; }
    catch (e) { console.error('OpenHSEQ auth: write users failed', e); alert('Could not save users — browser storage may be full.'); return false; }
  }
  function hasUsers() { return readUsers().length > 0; }

  /* ------------------------------- helpers -------------------------------- */
  function uid() { return 'u-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function randSalt() {
    if (global.crypto && global.crypto.getRandomValues) {
      var a = new Uint8Array(16); global.crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    return (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 24);
  }

  /* SHA-256(salt + password) via WebCrypto when available (https / localhost),
     with a non-crypto fallback so local file:// testing still works. The stored
     record keeps which algo was used, so verification always matches. */
  function sha256Hex(str) {
    var enc = new TextEncoder();
    return global.crypto.subtle.digest('SHA-256', enc.encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }
  function fallbackHash(str) {
    // djb2 — NOT secure, only used when WebCrypto is unavailable (file://)
    var h = 5381; for (var i = 0; i < str.length; i++) { h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; }
    return 'x' + h.toString(16);
  }
  function hashPassword(password, salt) {
    var input = salt + '::' + password;
    if (global.crypto && global.crypto.subtle) {
      return sha256Hex(input).then(function (hex) { return { algo: 'sha256', hash: hex }; })
        .catch(function () { return { algo: 'djb2', hash: fallbackHash(input) }; });
    }
    return Promise.resolve({ algo: 'djb2', hash: fallbackHash(input) });
  }
  function verifyPassword(user, password) {
    var input = user.salt + '::' + password;
    if (user.algo === 'sha256' && global.crypto && global.crypto.subtle) {
      return sha256Hex(input).then(function (hex) { return hex === user.hash; }).catch(function () { return false; });
    }
    return Promise.resolve(fallbackHash(input) === user.hash);
  }

  /* --------------------------- user CRUD (owner) -------------------------- */
  function findByEmail(email) { var e = norm(email); return readUsers().filter(function (u) { return norm(u.email) === e; })[0] || null; }

  function createUser(opts) {
    // opts: { email, name, level, password }  -> Promise<user>
    var email = norm(opts.email);
    if (!email) return Promise.reject(new Error('Email is required.'));
    if (findByEmail(email)) return Promise.reject(new Error('A user with that email already exists.'));
    var level = Math.max(1, Math.min(6, Number(opts.level) || 1));
    if (!opts.password || opts.password.length < 6) return Promise.reject(new Error('Password must be at least 6 characters.'));
    var salt = randSalt();
    return hashPassword(opts.password, salt).then(function (h) {
      var user = { id: uid(), email: email, name: (opts.name || '').trim() || email, level: level,
        salt: salt, algo: h.algo, hash: h.hash, active: true, createdAt: new Date().toISOString() };
      var list = readUsers(); list.push(user); writeUsers(list); return user;
    });
  }

  function updateUser(id, patch) {
    var list = readUsers();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        if (patch.level != null) list[i].level = Math.max(1, Math.min(6, Number(patch.level)));
        if (patch.name != null) list[i].name = String(patch.name).trim() || list[i].email;
        if (patch.active != null) list[i].active = !!patch.active;
        writeUsers(list); return list[i];
      }
    }
    return null;
  }

  function setPassword(id, password) {
    if (!password || password.length < 6) return Promise.reject(new Error('Password must be at least 6 characters.'));
    var list = readUsers(); var u = list.filter(function (x) { return x.id === id; })[0];
    if (!u) return Promise.reject(new Error('User not found.'));
    var salt = randSalt();
    return hashPassword(password, salt).then(function (h) { u.salt = salt; u.algo = h.algo; u.hash = h.hash; writeUsers(list); return u; });
  }

  function removeUser(id) {
    var list = readUsers(); var u = list.filter(function (x) { return x.id === id; })[0];
    if (u && norm(u.email) === norm(OWNER_EMAIL)) throw new Error('The owner account cannot be deleted.');
    writeUsers(list.filter(function (x) { return x.id !== id; }));
  }

  /* ------------------------------- session -------------------------------- */
  function setSession(user) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, email: user.email, ts: new Date().toISOString() })); } catch (e) {}
  }
  function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} }
  function currentUser() {
    var raw; try { raw = sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; }
    if (!raw) return null;
    var s; try { s = JSON.parse(raw); } catch (e) { return null; }
    var u = readUsers().filter(function (x) { return x.id === s.id; })[0];
    return (u && u.active) ? u : null;   // always re-read the record so level/active changes apply live
  }
  function isOwner(user) { return user && norm(user.email) === norm(OWNER_EMAIL); }

  function login(email, password) {
    var u = findByEmail(email);
    if (!u) return Promise.resolve({ ok: false, error: 'No account for that email.' });
    if (!u.active) return Promise.resolve({ ok: false, error: 'This account is deactivated.' });
    return verifyPassword(u, password).then(function (ok) {
      if (!ok) return { ok: false, error: 'Incorrect password.' };
      setSession(u); return { ok: true, user: u };
    });
  }
  function logout() { clearSession(); if (typeof onGateChange === 'function') onGateChange(); showGate(); renderLogin(); }

  /* On a fresh install (no users yet) seed the owner with a known password so the
     hosted app is usable immediately — no first-run race over who claims owner. */
  var DEFAULT_OWNER_PW = 'Bluewater.1';
  function seedOwner() { return createUser({ email: OWNER_EMAIL, name: 'Owner', level: 6, password: DEFAULT_OWNER_PW }); }

  /* --------------------------- capability model --------------------------- */
  function caps(level) {
    level = Number(level) || 0;
    return {
      raiseReports: true,                                   // every level
      audits: true,                                         // L1 raises, L2+ view — all get the tab
      reportsScope: level >= 6 ? 'all' : level >= 5 ? 'nonhidden' : level >= 3 ? 'assigned' : 'none',
      viewReports: level >= 3,
      dashboards: level >= 4,
      createAudits: level >= 4,                             // build/edit/delete audit types
      qrCodes: level >= 4,                                  // Quick-access QR codes tab
      canHide: level >= 5,
      settings: level >= 5,                                 // Settings page (incl. user maintenance)
      manageUsers: level >= 5,                              // add/manage users…
      grantOwner: level >= 6                                // …but only L6 can grant/manage level-6 access
    };
  }
  function myCaps() { var u = currentUser(); return caps(u ? u.level : 0); }

  function isMine(rec, user) {
    var keys = [norm(user.name), norm(user.email), norm((user.email || '').split('@')[0])];
    return keys.indexOf(norm(rec.assignedTo)) > -1 || keys.indexOf(norm(rec.reporter)) > -1 ||
      (rec.raisedByEmail && norm(rec.raisedByEmail) === norm(user.email));
  }

  /* Filter a report list down to what the current user may see. */
  function scope(list) {
    var u = currentUser(); if (!u) return [];
    var c = caps(u.level);
    if (c.reportsScope === 'none') return [];
    return list.filter(function (r) {
      if (r.hidden && u.level < 6) return false;            // hidden reports: owner-only
      if (c.reportsScope === 'all') return true;
      if (c.reportsScope === 'nonhidden') return true;      // hidden already excluded above
      return isMine(r, u);                                  // 'assigned'
    });
  }
  function canSee(rec) { return scope([rec]).length === 1; }

  /* ----------------------------- gate / UI -------------------------------- */
  var gateEl, onAuthed, onGateChange;

  function showGate() { if (gateEl) { gateEl.hidden = false; document.body.classList.add('locked'); } }
  function hideGate() { if (gateEl) { gateEl.hidden = true; document.body.classList.remove('locked'); } }

  function renderLogin(msg) {
    gateEl.innerHTML =
      '<div class="auth-card">' +
        '<div class="auth-brand"><span class="auth-mark">◆</span><div><div class="auth-title">OpenHSEQ</div>' +
        '<div class="auth-sub">Sign in to continue</div></div></div>' +
        (msg ? '<p class="auth-note">' + esc(msg) + '</p>' : '') +
        '<form id="auth-login-form" class="auth-form">' +
          '<label>Email<input type="email" id="login-email" autocomplete="username" required /></label>' +
          '<label>Password<input type="password" id="login-pass" autocomplete="current-password" required /></label>' +
          '<div class="auth-err" id="login-err" hidden></div>' +
          '<button type="submit" class="btn primary auth-btn">Sign in</button>' +
        '</form>' +
        '<p class="auth-foot muted">Access is granted by the HSEQ administrator. Contact them for an account.</p>' +
      '</div>';
    var form = document.getElementById('auth-login-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = document.getElementById('login-err'); err.hidden = true;
      var btn = form.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = 'Signing in…';
      login(document.getElementById('login-email').value, document.getElementById('login-pass').value).then(function (res) {
        btn.disabled = false; btn.textContent = 'Sign in';
        if (!res.ok) { err.textContent = res.error; err.hidden = false; return; }
        enter();
      });
    });
    var em = document.getElementById('login-email'); if (em) em.focus();
  }

  function enter() { hideGate(); if (typeof onGateChange === 'function') onGateChange(); if (typeof onAuthed === 'function') onAuthed(); }

  /* -------------------------- user management UI -------------------------- */
  var LEVEL_DESC = {
    1: 'Raise reports & audits',
    2: '+ View audits',
    3: '+ View reports assigned to them',
    4: '+ Dashboards',
    5: '+ All non-hidden reports · can hide',
    6: 'Owner — everything incl. hidden'
  };
  function levelOptions(sel, maxLvl) {
    maxLvl = maxLvl || 6;
    var out = '';
    for (var l = 1; l <= maxLvl; l++) out += '<option value="' + l + '"' + (Number(sel) === l ? ' selected' : '') + '>' + l + ' — ' + esc(LEVEL_DESC[l]) + '</option>';
    return out;
  }

  // Which target users the signed-in admin may edit/delete/reset.
  //  - Owner row: level & delete always locked; only a level-6 admin may reset its password.
  //  - A level-6 user (non-owner): manageable only by a level-6 admin (grantOwner).
  //  - A level ≤5 user: manageable by any admin (level 5+).
  function canManage(admin, target) {
    if (isOwner(target)) return false;                 // owner is never level/delete-editable
    if (target.level >= 6) return admin.grantOwner;    // level-6 rights are level-6 only
    return true;
  }

  function renderUsers(container) {
    var me = currentUser();
    if (!me || !caps(me.level).manageUsers) { container.innerHTML = ''; return; }
    var admin = caps(me.level);
    var maxAssignable = admin.grantOwner ? 6 : 5;      // only L6 admins can grant level 6
    var list = readUsers().slice().sort(function (a, b) { return b.level - a.level || norm(a.email).localeCompare(norm(b.email)); });
    var rows = list.map(function (u) {
      var owner = isOwner(u);
      var manageable = canManage(admin, u);
      var levelCell = owner || !manageable
        ? '<select class="u-level" disabled aria-label="Access level">' + levelOptions(u.level, 6) + '</select>'
        : '<select class="u-level" aria-label="Access level">' + levelOptions(u.level, maxAssignable) + '</select>';
      var statusCell = owner ? '<span class="badge status-Closed">Active</span>'
        : manageable ? '<label class="inline"><input type="checkbox" class="u-active"' + (u.active ? ' checked' : '') + ' /> Active</label>'
        : '<span class="badge ' + (u.active ? 'status-Closed' : 'status-Open') + '">' + (u.active ? 'Active' : 'Inactive') + '</span>';
      var resetBtn = (owner ? admin.grantOwner : manageable) ? '<button type="button" class="btn small u-pass">Reset password</button>' : '';
      var delBtn = manageable ? ' <button type="button" class="btn small danger u-del">Delete</button>' : '';
      return '<tr data-uid="' + u.id + '">' +
        '<td><strong>' + esc(u.email) + '</strong>' + (owner ? ' <span class="badge type">owner</span>' : '') + '<div class="muted">' + esc(u.name) + '</div></td>' +
        '<td>' + levelCell + '</td>' +
        '<td>' + statusCell + '</td>' +
        '<td class="u-actions">' + (resetBtn || delBtn ? resetBtn + delBtn : '<span class="muted">—</span>') + '</td>' +
        '</tr>';
    }).join('');

    var note = admin.grantOwner
      ? 'Owner (level 6) can grant any level. Levels: 1 raise-only … 6 full access.'
      : 'You can manage users up to level 5. Only the owner (level 6) can grant level-6 access. Level-6 users are read-only here.';

    container.innerHTML =
      '<div class="card"><h3>Users &amp; access</h3>' +
        '<p class="muted">' + note + ' Changes apply the next time that user loads a screen.</p>' +
        '<div class="table-wrap"><table class="data-table" id="usersTable"><thead><tr>' +
          '<th>User</th><th>Access level</th><th>Status</th><th>Actions</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<h3 style="margin-top:18px">Add a user</h3>' +
        '<div class="form-grid">' +
          '<label>Email<input type="email" id="nu-email" placeholder="name@bws.dk" /></label>' +
          '<label>Display name<input type="text" id="nu-name" placeholder="Optional" /></label>' +
          '<label>Access level<select id="nu-level">' + levelOptions(1, maxAssignable) + '</select></label>' +
          '<label>Temporary password<input type="password" id="nu-pass" placeholder="At least 6 characters" autocomplete="new-password" /></label>' +
        '</div>' +
        '<div class="auth-err" id="nu-err" hidden></div>' +
        '<button type="button" class="btn primary" id="nu-add">+ Add user</button>' +
      '</div>';

    // wire (idempotent: renderUsers rebuilds container each call)
    var table = container.querySelector('#usersTable');
    table.addEventListener('change', function (e) {
      var tr = e.target.closest('tr[data-uid]'); if (!tr) return; var id = tr.dataset.uid;
      var u = readUsers().filter(function (x) { return x.id === id; })[0]; if (!u || !canManage(admin, u)) return;
      if (e.target.classList.contains('u-level')) {
        var lvl = Number(e.target.value);
        if (lvl >= 6 && !admin.grantOwner) { alert('Only the owner can grant level-6 access.'); renderUsers(container); return; }
        updateUser(id, { level: lvl }); toast('Level updated');
      }
      if (e.target.classList.contains('u-active')) { updateUser(id, { active: e.target.checked }); toast(e.target.checked ? 'Activated' : 'Deactivated'); }
    });
    table.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-uid]'); if (!tr) return; var id = tr.dataset.uid;
      var u = readUsers().filter(function (x) { return x.id === id; })[0]; if (!u) return;
      var resettable = isOwner(u) ? admin.grantOwner : canManage(admin, u);
      if (e.target.classList.contains('u-del')) {
        if (!canManage(admin, u)) return;
        if (!confirm('Delete user ' + u.email + '?')) return;
        try { removeUser(id); renderUsers(container); toast('User deleted'); } catch (ex) { alert(ex.message); }
      }
      if (e.target.classList.contains('u-pass')) {
        if (!resettable) return;
        var np = prompt('New password for ' + u.email + ' (min 6 chars):'); if (np == null) return;
        setPassword(id, np).then(function () { toast('Password reset'); }).catch(function (ex) { alert(ex.message); });
      }
    });
    container.querySelector('#nu-add').addEventListener('click', function () {
      var err = container.querySelector('#nu-err'); err.hidden = true;
      var lvl = Number(container.querySelector('#nu-level').value);
      if (lvl >= 6 && !admin.grantOwner) { err.textContent = 'Only the owner can grant level-6 access.'; err.hidden = false; return; }
      createUser({ email: container.querySelector('#nu-email').value, name: container.querySelector('#nu-name').value,
        level: lvl, password: container.querySelector('#nu-pass').value })
        .then(function () { renderUsers(container); toast('User added'); })
        .catch(function (ex) { err.textContent = ex.message; err.hidden = false; });
    });
  }
  function toast(m) { if (global.HSEQUI && global.HSEQUI.toast) global.HSEQUI.toast(m); }

  /* ------------------------------- bootstrap ------------------------------ */
  function init(opts) {
    opts = opts || {};
    onAuthed = opts.onAuthed;
    onGateChange = opts.onGateChange;
    gateEl = document.getElementById('authGate');
    if (!gateEl) { console.error('OpenHSEQ auth: #authGate missing'); if (onAuthed) onAuthed(); return; }

    if (currentUser()) { enter(); return; }        // valid session already
    showGate();
    if (!hasUsers()) {
      seedOwner()
        .then(function () { renderLogin('Owner account ready — sign in as ' + OWNER_EMAIL + '.'); })
        .catch(function (e) { console.error('OpenHSEQ auth: owner seed failed', e); renderLogin(); });
    } else {
      renderLogin();
    }
  }

  global.HSEQAuth = {
    init: init, logout: logout, currentUser: currentUser, isOwner: isOwner,
    caps: caps, myCaps: myCaps, scope: scope, canSee: canSee,
    readUsers: readUsers, renderUsers: renderUsers, OWNER_EMAIL: OWNER_EMAIL,
    // account operations (used by the UI; exported for reuse/testing)
    login: login, createUser: createUser, setPassword: setPassword,
    updateUser: updateUser, removeUser: removeUser, findByEmail: findByEmail, canManage: canManage
  };
})(window);

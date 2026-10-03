(function () {
  var cfg = window.UZ_COMMUNITY_CONFIG || {};
  var client = null;
  var ready = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  var allowed = (cfg.allowedEmailDomains || []).map(function (d) { return String(d).toLowerCase(); });
  var ownerEmails = (cfg.ownerEmails || []).map(function (e) { return String(e).toLowerCase(); });
  var konami = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  var konamiIndex = 0;
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function emailAllowed(email) { email = String(email || '').toLowerCase(); if (!allowed.length) return true; return allowed.some(function (d) { return email === d || email.endsWith('@' + d); }); }
  function isOwnerEmail(email) { return ownerEmails.indexOf(String(email || '').toLowerCase()) !== -1; }
  function getName() { return String(localStorage.getItem('uzCommunityProfileName') || '').trim(); }
  function getAvatar() { return String(localStorage.getItem('uzCommunityAvatar') || '').trim(); }
  function setLightspeed(email) { try { localStorage.setItem('uzLoginEmail', email || ''); localStorage.setItem('lightspeedSystemMsg', 'You are logged in as ' + (email || 'ClassLink user') + ' (IP Address: █████).'); } catch (e) {} }
  function initClient() { if (ready && !client) client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey); }
  function renderGate(message) {
    if (!cfg.requireLogin) return;
    var gate = document.getElementById('uz-auth-gate');
    if (!gate) { gate = document.createElement('div'); gate.id = 'uz-auth-gate'; gate.className = 'uz-auth-gate'; document.body.appendChild(gate); }
    var setup = !ready ? '<p class="uz-auth-warn">Supabase is not connected yet. Paste the Project URL and publishable anon key in community/config.js.</p>' : '';
    var loginUrl = cfg.classLinkLoginUrl || '';
    var button = loginUrl ? '<button class="community-btn" id="uz-auth-classlink">Continue with ClassLink</button>' : '<button class="community-btn" id="uz-auth-classlink" disabled>ClassLink URL needed</button>';
    gate.innerHTML = '<div class="uz-auth-card"><h1>ClassLink sign in</h1><p>You need to sign in before using this site. The page never asks for or stores your password.</p>' + setup + button + '<p class="uz-auth-detail">Set <b>classLinkLoginUrl</b> in community/config.js after your ClassLink app is created.</p><p class="uz-auth-error">' + esc(message || '') + '</p></div>';
    var btn = document.getElementById('uz-auth-classlink');
    if (btn && loginUrl) btn.onclick = function () { window.location.href = loginUrl; };
  }
  function clearGate() { var gate = document.getElementById('uz-auth-gate'); if (gate) gate.remove(); }
  function renderProfile(session) {
    var mount = document.getElementById('uz-profile-menu');
    if (!mount) { mount = document.createElement('div'); mount.id = 'uz-profile-menu'; mount.className = 'uz-profile-menu'; document.body.appendChild(mount); }
    var user = session && session.user;
    var email = user && user.email ? user.email : localStorage.getItem('uzLoginEmail') || '';
    var name = getName() || (email ? email.split('@')[0] : 'Profile');
    var avatar = getAvatar();
    var owner = isOwnerEmail(email) || localStorage.getItem('uzLocalOwnerUnlocked') === 'true';
    mount.innerHTML = '<button class="uz-profile-chip" id="uz-profile-toggle"><span class="uz-profile-avatar">' + (avatar ? '<img src="' + esc(avatar) + '" alt="">' : esc(name.charAt(0).toUpperCase() || 'P')) + '</span><span>' + esc(name) + '</span></button><div class="uz-profile-panel" id="uz-profile-panel"><label>Display name</label><input id="uz-profile-name" maxlength="24" value="' + esc(getName()) + '" placeholder="Choose a name"><label>Image URL</label><input id="uz-profile-avatar" value="' + esc(avatar) + '" placeholder="https://..."><div class="community-row"><button class="community-btn" id="uz-profile-save">Save</button><button class="community-btn secondary" id="uz-profile-logout">Log out</button></div><p>' + (email ? 'Signed in: <b>' + esc(owner ? email : email.replace(/^(.{2}).*(@.*)$/, '$1••••$2')) + '</b>' : 'Not signed in') + '</p><p>Role: <b>' + esc(owner ? 'owner' : 'member') + '</b></p></div>';
    document.getElementById('uz-profile-toggle').onclick = function () { document.getElementById('uz-profile-panel').classList.toggle('open'); };
    document.getElementById('uz-profile-save').onclick = async function () {
      var n = document.getElementById('uz-profile-name').value.replace(/\s+/g, ' ').trim().slice(0, cfg.maxNameLength || 24);
      var a = document.getElementById('uz-profile-avatar').value.trim();
      localStorage.setItem('uzCommunityProfileName', n); localStorage.setItem('uzCommunityAvatar', a);
      if (window.UZCommunity && window.UZCommunity.saveProfile) await window.UZCommunity.saveProfile();
      var note = document.getElementById('uz-autosave-note'); if (note) { note.textContent = 'Profile autosaved'; note.classList.add('show'); setTimeout(function(){ note.classList.remove('show'); }, 1500); }
      renderProfile(session);
    };
    document.getElementById('uz-profile-logout').onclick = async function () { if (client) await client.auth.signOut(); localStorage.removeItem('uzLoginEmail'); location.reload(); };
  }
  function sparkle() { for (var i = 0; i < 24; i++) { var s = document.createElement('i'); s.className = 'uz-owner-spark'; s.style.setProperty('--spark-x', ((Math.random() * 260) - 130) + 'px'); s.style.setProperty('--spark-y', ((Math.random() * 220) - 110) + 'px'); document.body.appendChild(s); setTimeout(function(el){ return function(){ el.remove(); }; }(s), 850); } }
  async function check() {
    initClient();
    if (!ready) { renderProfile(null); renderGate(''); return; }
    var res = await client.auth.getSession(); var session = res.data && res.data.session;
    if (!session || !session.user) { renderProfile(null); renderGate(''); return; }
    var email = session.user.email || ''; setLightspeed(email);
    if (!emailAllowed(email)) { await client.auth.signOut(); renderGate('That email domain is not allowed.'); renderProfile(null); return; }
    clearGate(); renderProfile(session);
  }
  document.addEventListener('keydown', function (e) {
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === konami[konamiIndex]) { konamiIndex++; sparkle(); } else { konamiIndex = key === konami[0] ? 1 : 0; }
    if (konamiIndex === konami.length) { konamiIndex = 0; localStorage.setItem('uzLocalOwnerUnlocked', 'true'); sparkle(); renderProfile(null); alert('Local owner tools unlocked on this browser. Real server owner access still requires your approved ClassLink email.'); }
  }, true);
  window.UZAuthGate = { refresh: check };
  if (ready) { initClient(); client.auth.onAuthStateChange(check); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check); else check();
}());
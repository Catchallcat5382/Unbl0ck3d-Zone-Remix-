(function () {
  var cfg = window.UZ_COMMUNITY_CONFIG || {};
  var client = null;
  var ready = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  var konami = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  var konamiIndex = 0;
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function cleanUsername(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24); }
  function authEmail(username) { return cleanUsername(username) + '@' + (cfg.internalAuthDomain || 'uz.local'); }
  function getName() { return String(localStorage.getItem('uzCommunityProfileName') || '').trim(); }
  function getAvatar() { return String(localStorage.getItem('uzCommunityAvatar') || '').trim(); }
  function usernameFromUser(user) { return (user && user.user_metadata && user.user_metadata.username) || (user && user.email ? user.email.split('@')[0] : ''); }
  function setLightspeed(name) { try { localStorage.setItem('uzLoginEmail', name || ''); localStorage.setItem('lightspeedSystemMsg', 'You are logged in as ' + (name || 'user') + ' (IP Address: █████).'); } catch (e) {} }
  function isTempOwner() { return sessionStorage.getItem('uzTempOwnerUnlocked') === 'true'; }
  function bypassCodeReady() { return typeof cfg.ownerBypassCode === 'string' && cfg.ownerBypassCode.length === 36; }
  function initClient() { if (ready && !client) client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey); }
  function note(msg) { var el = document.getElementById('uz-auth-error'); if (el) el.textContent = msg || ''; }
  async function ensureProfile(user) {
    if (!ready || !user) return null;
    var username = usernameFromUser(user);
    var display = getName() || username || 'Member';
    var res = await client.from('profiles').upsert({ id: user.id, username: username, display_name: display }, { onConflict: 'id' }).select('*').single();
    if (window.UZCommunity && window.UZCommunity.refresh) window.UZCommunity.refresh();
    return res.data || null;
  }
  function renderGate(message) {
    if (!cfg.requireLogin) return;
    var gate = document.getElementById('uz-auth-gate');
    if (!gate) { gate = document.createElement('div'); gate.id = 'uz-auth-gate'; gate.className = 'uz-auth-gate uz-auth-ms-style'; document.body.appendChild(gate); }
    var setup = !ready ? '<div class="uz-auth-setup"><b>Setup needed</b><span>Accounts turn on after you paste your Supabase Project URL and publishable anon key into community/config.js.</span></div>' : '';
    var disabled = ready ? '' : ' disabled';
    gate.innerHTML = '<div class="uz-auth-card"><div class="uz-login-brand"><div class="uz-login-logo">UZ</div><div><b>Unbl0cked Zone</b><span>Private access</span></div></div><h1>Welcome back</h1><p class="uz-auth-detail">Use a custom site account. This is not Microsoft, Google, ClassLink, or your school login.</p>' + setup + '<label>Username</label><input id="uz-login-user" autocomplete="username" maxlength="24" placeholder="pick a username"><label>Password</label><input id="uz-login-pass" autocomplete="current-password" type="password" placeholder="6+ characters"><div class="uz-auth-actions"><button class="community-btn" id="uz-login-submit"' + disabled + '>Sign in</button><button class="community-btn secondary" id="uz-login-create"' + disabled + '>Create account</button></div><p class="uz-auth-detail">Passwords are secured by Supabase Auth and are not readable by site admins.</p><p class="uz-auth-hint">Owner shortcut: press Up Up Down Down Left Right Left Right B A, then enter your 36-character code. It lasts only for this tab.</p><p class="uz-auth-error" id="uz-auth-error">' + esc(message || '') + '</p></div>';
    document.getElementById('uz-login-submit').onclick = signIn;
    document.getElementById('uz-login-create').onclick = signUp;
    document.getElementById('uz-login-pass').addEventListener('keydown', function(e){ if (e.key === 'Enter') signIn(); });
  }
  function clearGate() { var gate = document.getElementById('uz-auth-gate'); if (gate) gate.remove(); }
  async function signIn() {
    if (!ready) { note('Connect Supabase first.'); return; }
    initClient();
    var username = cleanUsername(document.getElementById('uz-login-user').value);
    var password = document.getElementById('uz-login-pass').value;
    if (username.length < 2 || password.length < 6) { note('Username needs 2+ characters and password needs 6+ characters.'); return; }
    var res = await client.auth.signInWithPassword({ email: authEmail(username), password: password });
    if (res.error) { note(res.error.message); return; }
    localStorage.setItem('uzLoginEmail', username); setLightspeed(username); await ensureProfile(res.data.user); check();
  }
  async function signUp() {
    if (!ready) { note('Connect Supabase first.'); return; }
    initClient();
    var username = cleanUsername(document.getElementById('uz-login-user').value);
    var password = document.getElementById('uz-login-pass').value;
    if (username.length < 2 || password.length < 6) { note('Username needs 2+ characters and password needs 6+ characters.'); return; }
    var res = await client.auth.signUp({ email: authEmail(username), password: password, options: { data: { username: username } } });
    if (res.error) { note(res.error.message); return; }
    localStorage.setItem('uzLoginEmail', username); setLightspeed(username); await ensureProfile(res.data.user); check();
  }
  function renderProfile(session, profile) {
    var mount = document.getElementById('uz-profile-menu');
    if (!mount) { mount = document.createElement('div'); mount.id = 'uz-profile-menu'; mount.className = 'uz-profile-menu'; document.body.appendChild(mount); }
    var user = session && session.user;
    var username = (profile && profile.username) || usernameFromUser(user) || localStorage.getItem('uzLoginEmail') || '';
    var name = getName() || username || 'Profile';
    var avatar = getAvatar();
    var owner = (profile && profile.role === 'owner') || isTempOwner();
    mount.innerHTML = '<button class="uz-profile-chip" id="uz-profile-toggle"><span class="uz-profile-avatar">' + (avatar ? '<img src="' + esc(avatar) + '" alt="">' : esc(name.charAt(0).toUpperCase() || 'P')) + '</span><span>' + esc(name) + '</span></button><div class="uz-profile-panel" id="uz-profile-panel"><label>Display name</label><input id="uz-profile-name" maxlength="24" value="' + esc(getName()) + '" placeholder="Choose a name"><label>Image URL</label><input id="uz-profile-avatar" value="' + esc(avatar) + '" placeholder="https://..."><div class="community-row"><button class="community-btn" id="uz-profile-save">Save</button><button class="community-btn secondary" id="uz-profile-logout">Log out</button></div><p>Account: <b>' + esc(username || 'Not signed in') + '</b></p><p>Role: <b>' + esc(owner ? 'owner' : 'member') + '</b></p></div>';
    document.getElementById('uz-profile-toggle').onclick = function () { document.getElementById('uz-profile-panel').classList.toggle('open'); };
    document.getElementById('uz-profile-save').onclick = async function () {
      var n = document.getElementById('uz-profile-name').value.replace(/\s+/g, ' ').trim().slice(0, cfg.maxNameLength || 24);
      var a = document.getElementById('uz-profile-avatar').value.trim();
      localStorage.setItem('uzCommunityProfileName', n); localStorage.setItem('uzCommunityAvatar', a);
      if (window.UZCommunity && window.UZCommunity.saveProfile) await window.UZCommunity.saveProfile();
      var toast = document.getElementById('uz-autosave-note'); if (toast) { toast.textContent = 'Profile autosaved'; toast.classList.add('show'); setTimeout(function(){ toast.classList.remove('show'); }, 1500); }
      check();
    };
    document.getElementById('uz-profile-logout').onclick = async function () { sessionStorage.removeItem('uzTempOwnerUnlocked'); if (client) await client.auth.signOut(); localStorage.removeItem('uzLoginEmail'); location.reload(); };
  }
  function sparkle() { for (var i = 0; i < 24; i++) { var s = document.createElement('i'); s.className = 'uz-owner-spark'; s.style.setProperty('--spark-x', ((Math.random() * 260) - 130) + 'px'); s.style.setProperty('--spark-y', ((Math.random() * 220) - 110) + 'px'); document.body.appendChild(s); setTimeout(function(el){ return function(){ el.remove(); }; }(s), 850); } }
  function showOwnerPrompt() {
    var existing = document.getElementById('uz-owner-code-modal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'uz-owner-code-modal';
    modal.className = 'uz-owner-code-modal';
    modal.innerHTML = '<div class="uz-owner-code-card"><h2>Owner unlock</h2><p>Enter your 36-character temporary owner code. This unlock lasts only until this tab closes.</p><input id="uz-owner-code-input" type="password" maxlength="36" autocomplete="off" placeholder="36-character code"><div class="community-row"><button class="community-btn" id="uz-owner-code-submit">Unlock</button><button class="community-btn secondary" id="uz-owner-code-cancel">Cancel</button></div><p id="uz-owner-code-error" class="uz-auth-error"></p></div>';
    document.body.appendChild(modal);
    var input = document.getElementById('uz-owner-code-input');
    var err = document.getElementById('uz-owner-code-error');
    function submit() {
      var code = input.value.trim();
      if (code.length !== 36) { err.textContent = 'Code must be exactly 36 characters.'; return; }
      if (!bypassCodeReady()) { err.textContent = 'Set ownerBypassCode in community/config.js first.'; return; }
      if (code !== cfg.ownerBypassCode) { err.textContent = 'Wrong code.'; input.value = ''; input.focus(); return; }
      sessionStorage.setItem('uzTempOwnerUnlocked', 'true');
      setLightspeed('temporary-owner');
      sparkle();
      modal.remove();
      check();
    }
    document.getElementById('uz-owner-code-submit').onclick = submit;
    document.getElementById('uz-owner-code-cancel').onclick = function () { modal.remove(); };
    input.addEventListener('keydown', function(e){ if (e.key === 'Enter') submit(); if (e.key === 'Escape') modal.remove(); });
    setTimeout(function(){ input.focus(); }, 30);
  }
  async function check() {
    initClient();
    if (!ready) { renderProfile(null, null); renderGate(''); return; }
    var res = await client.auth.getSession(); var session = res.data && res.data.session;
    if (!session || !session.user) { renderProfile(null, null); renderGate(''); return; }
    var profile = await ensureProfile(session.user);
    var username = (profile && profile.username) || usernameFromUser(session.user);
    setLightspeed(username); clearGate(); renderProfile(session, profile);
  }
  document.addEventListener('keydown', function (e) {
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === konami[konamiIndex]) { konamiIndex++; sparkle(); } else { konamiIndex = key === konami[0] ? 1 : 0; }
    if (konamiIndex === konami.length) {
      konamiIndex = 0;
      sparkle();
      showOwnerPrompt();
    }
  }, true);
  window.UZAuthGate = { refresh: check };
  if (ready) { initClient(); client.auth.onAuthStateChange(check); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check); else check();
}());
(function () {
  var cfg = window.UZ_COMMUNITY_CONFIG || {};
  var client = null;
  var ready = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  var konami = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  var konamiIndex = 0;
  var authMode = 'signin';
  var tempOwnerActive = false; window.UZTempOwnerActive = false; window.UZCurrentProfile = null;
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function cleanUsername(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24); }
  function authEmail(username) { return cleanUsername(username) + '@' + (cfg.internalAuthDomain || 'uzlogin.net'); }
  function profileStorageUser() { return cleanUsername(localStorage.getItem('uzLoginEmail') || 'guest') || 'guest'; }
  function profileKey(name, username) { return name + ':' + cleanUsername(username || profileStorageUser()); }
  function getName(username) { return String(localStorage.getItem(profileKey('uzCommunityProfileName', username)) || '').trim(); }
  function getAvatar(username) { return String(localStorage.getItem(profileKey('uzCommunityAvatar', username)) || '').trim(); }
  function usernameFromUser(user) { return (user && user.user_metadata && user.user_metadata.username) || (user && user.email ? user.email.split('@')[0] : ''); }
  function setLightspeed(name) { try { localStorage.setItem('uzLoginEmail', name || ''); localStorage.setItem('lightspeedSystemMsg', 'You are logged in as ' + (name || 'user') + ' (IP Address: █████).'); } catch (e) {} }
  function isTempOwner() { return tempOwnerActive === true || window.UZTempOwnerActive === true; }
  function bypassCodeReady() { return typeof cfg.ownerBypassHash === 'string' && /^[a-f0-9]{64}$/i.test(cfg.ownerBypassHash); }
  async function sha256Hex(value) { var data = new TextEncoder().encode(value); var digest = await crypto.subtle.digest('SHA-256', data); return Array.from(new Uint8Array(digest)).map(function(b){ return b.toString(16).padStart(2, '0'); }).join(''); }
  function authUrl() { return String(cfg.supabaseUrl || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''); }
  function initClient() { if (ready && !client) client = window.supabase.createClient(authUrl(), cfg.supabaseAnonKey); }
  function note(msg) { var el = document.getElementById('uz-auth-error'); if (el) el.textContent = msg || ''; }
  function rememberWanted() { var box = document.getElementById('uz-remember-me'); return !box || box.checked; }
  function recentAccounts() { try { return JSON.parse(localStorage.getItem('uzRecentAccounts') || '[]').filter(function(a){ return a && a.username && Date.now() - a.time < 2592000000; }).slice(0, 12); } catch(e) { return []; } }
  function removeRecentAccount(username) { var u = cleanUsername(username); localStorage.setItem('uzRecentAccounts', JSON.stringify(recentAccounts().filter(function(a){ return cleanUsername(a.username) !== u; }))); }
  function recentDaysLeft(a) { return Math.max(1, Math.ceil((2592000000 - (Date.now() - a.time)) / 86400000)); }
  function saveRecentAccount(username) { if (!rememberWanted()) { localStorage.setItem('uzRememberMe', 'false'); return; } var list = recentAccounts().filter(function(a){ return a.username !== username; }); list.unshift({ username: username, time: Date.now() }); localStorage.setItem('uzRecentAccounts', JSON.stringify(list.slice(0, 6))); localStorage.setItem('uzRememberMe', 'true'); }
  function recentAccountsHtml() {
    var list = recentAccounts();
    if (!list.length || authMode !== 'signin') return '';
    var first = list.slice(0, 5).map(function(a){ return '<button type="button" class="uz-recent-account" data-username="' + esc(a.username) + '">' + esc(a.username) + ' <small>' + recentDaysLeft(a) + 'd</small><b data-remove-recent="1">x</b></button>'; }).join('');
    var rest = list.slice(5).map(function(a){ return '<button type="button" class="uz-recent-account" data-username="' + esc(a.username) + '">' + esc(a.username) + ' <small>' + recentDaysLeft(a) + 'd</small><b data-remove-recent="1">x</b></button>'; }).join('');
    return '<div class="uz-recent-accounts"><span>Recent accounts</span>' + first + (rest ? '<details class="uz-recent-more"><summary>More</summary>' + rest + '</details>' : '') + '</div>';
  }
  function wireRecentAccounts() { Array.prototype.forEach.call(document.querySelectorAll('.uz-recent-account'), function(btn){ btn.onclick = function(e){ if (e.target && e.target.dataset && e.target.dataset.removeRecent) { removeRecentAccount(btn.dataset.username || ''); renderGate('Recent account removed.'); return; } var input = document.getElementById('uz-login-user'); if (input) input.value = btn.dataset.username || ''; var pass = document.getElementById('uz-login-pass'); if (pass) pass.focus(); }; }); }
  function switchAccountsHtml(currentUsername) { var list = recentAccounts().filter(function(a){ return cleanUsername(a.username) !== cleanUsername(currentUsername); }); if (!list.length) return '<button class="community-btn secondary" id="uz-switch-account" type="button">Switch account</button>'; return '<details class="uz-switch-accounts"><summary>Switch account</summary>' + list.map(function(a){ return '<button type="button" class="uz-switch-account-option" data-username="' + esc(a.username) + '">' + esc(a.username) + ' <small>' + recentDaysLeft(a) + 'd left</small></button>'; }).join('') + '<button type="button" class="uz-switch-account-option" data-username="">Use another account</button></details>'; }
  function wireProfileSwitchAccounts() { Array.prototype.forEach.call(document.querySelectorAll('.uz-switch-account-option'), function(btn){ btn.onclick = async function(){ var username = btn.dataset.username || ''; sessionStorage.removeItem('uzSessionOk'); if (client) await client.auth.signOut(); localStorage.removeItem('uzLoginEmail'); authMode = 'signin'; renderGate(username ? 'Sign in to switch to ' + username + '.' : 'Sign in with another account.'); var input = document.getElementById('uz-login-user'); if (input) input.value = username; var pass = document.getElementById('uz-login-pass'); if (pass) pass.focus(); }; }); var plain = document.getElementById('uz-switch-account'); if (plain) plain.onclick = async function(){ sessionStorage.removeItem('uzSessionOk'); if (client) await client.auth.signOut(); localStorage.removeItem('uzLoginEmail'); authMode = 'signin'; renderGate('Sign in with another account.'); }; }
  async function ensureProfile(user) { if (!ready || !user) return null; var username = usernameFromUser(user); var localDisplay = getName(username); var payload = { id: user.id, username: username }; if (localDisplay) payload.display_name = localDisplay; var res = await client.from('profiles').upsert(payload, { onConflict: 'id' }).select('*').single(); if (res.error) { note(res.error.message || 'Profile could not be saved.'); return null; } if (window.UZCommunity && window.UZCommunity.refresh) window.UZCommunity.refresh(); return res.data || null; }
  function logoSvg() { return '<svg class="uz-logo-svg" viewBox="0 0 96 96" aria-hidden="true"><defs><linearGradient id="uzOrange" x1="10" y1="8" x2="86" y2="90"><stop stop-color="#ffd36b"/><stop offset="0.42" stop-color="#ff7a1a"/><stop offset="1" stop-color="#d93400"/></linearGradient><filter id="uzGlow" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M48 6 84 22v28c0 23-14 36-36 44C26 86 12 73 12 50V22L48 6Z" fill="#150704" stroke="#ff7a1a" stroke-width="4" filter="url(#uzGlow)"/><path d="M27 29h12v27c0 7 3 10 9 10s9-3 9-10V29h12v28c0 14-8 22-21 22s-21-8-21-22V29Z" fill="url(#uzOrange)"/><path d="M31 25h39L45 53h24v11H27l25-29H31V25Z" fill="#ffb347"/><path d="M20 76 78 20" stroke="#fff1c2" stroke-width="5" stroke-linecap="round" opacity=".88"/><path d="M22 78 80 22" stroke="#ff5a00" stroke-width="3" stroke-linecap="round" opacity=".95"/></svg>'; }
  function renderGate(message) {
    if (!cfg.requireLogin) return;
    document.body.classList.add('uz-auth-locked');
    try { document.title = 'Unbl0cked Zone'; } catch(e) {}
    var gate = document.getElementById('uz-auth-gate');
    if (!gate) { gate = document.createElement('div'); gate.id = 'uz-auth-gate'; gate.className = 'uz-auth-gate uz-auth-ms-style'; document.body.appendChild(gate); }
    var setup = !ready ? '<div class="uz-auth-setup"><b>Setup needed</b><span>Accounts turn on after you paste your Supabase Project URL and publishable anon key into community/config.js.</span></div>' : '';
    var disabled = ready ? '' : ' disabled';
    var title = authMode === 'signup' ? 'Create your account' : 'Welcome back';
    var primary = authMode === 'signup' ? 'Create account' : 'Sign in';
    var switchText = authMode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Create one';
    gate.innerHTML = '<div class="uz-auth-card"><aside class="uz-auth-art"><div class="uz-auth-wordmark">' + logoSvg() + '<div><strong>Unbl0cked Zone</strong><span>Remix access panel</span></div></div><div class="uz-auth-copy"><b>Choose your route.</b><span>Sign in or create a site account to continue.</span></div></aside><section class="uz-auth-form"><div class="uz-auth-tabs"><button id="uz-tab-signin" class="' + (authMode === 'signin' ? 'active' : '') + '">Sign in</button><button id="uz-tab-signup" class="' + (authMode === 'signup' ? 'active' : '') + '">Create account</button></div><h1>' + title + '</h1><p class="uz-auth-detail">Use your Unbl0cked Zone account. This is not a school, Google, Microsoft, or ClassLink login.</p>' + setup + recentAccountsHtml() + '<label>Username</label><input id="uz-login-user" autocomplete="username" name="username" maxlength="24" placeholder="Choose a username"><label>Password</label><input id="uz-login-pass" autocomplete="current-password" name="password" type="password" placeholder="At least 6 characters"><label class="uz-remember-row"><input id="uz-remember-me" type="checkbox" checked> Remember this account for 30 days</label><button class="community-btn uz-auth-primary" id="uz-login-primary"' + disabled + '>' + primary + '</button><button class="uz-auth-switch" id="uz-auth-switch" type="button">' + switchText + '</button><button class="uz-auth-switch" id="uz-forgot-pass" type="button">Forgot password?</button><p class="uz-auth-detail">Passwords are protected by Supabase Auth and cannot be read by site admins.</p><button class="uz-owner-link" id="uz-owner-link" type="button" aria-label="More options">More options</button><p class="uz-auth-error" id="uz-auth-error">' + esc(message || '') + '</p></section></div>';
    document.getElementById('uz-tab-signin').onclick = function(){ authMode = 'signin'; renderGate(''); };
    document.getElementById('uz-tab-signup').onclick = function(){ authMode = 'signup'; renderGate(''); };
    document.getElementById('uz-auth-switch').onclick = function(){ authMode = authMode === 'signin' ? 'signup' : 'signin'; renderGate(''); };
    document.getElementById('uz-owner-link').onclick = showOwnerPrompt; var fp = document.getElementById('uz-forgot-pass'); if (fp) fp.onclick = forgotPassword;
    wireRecentAccounts();
    document.getElementById('uz-login-primary').onclick = function(){ if (authMode === 'signup') signUp(); else signIn(); };
    document.getElementById('uz-login-pass').addEventListener('keydown', function(e){ if (e.key === 'Enter') { if (authMode === 'signup') signUp(); else signIn(); } });
  }
  function clearGate() { document.body.classList.remove('uz-auth-locked'); var gate = document.getElementById('uz-auth-gate'); if (gate) gate.remove(); if (window.restoreSavedCloak) window.restoreSavedCloak(); }
  async function forgotPassword() {
    var username = cleanUsername((document.getElementById('uz-login-user') || {}).value || '');
    if (!username) { note('Enter your username first, then press Forgot password.'); return; }
    note('Password reset needs owner/admin help for this custom account system. Ask staff to reset it from Supabase Authentication.');
  }
  function authFail(msg) { note(msg || 'That did not work. Check the username and password.'); var card = document.querySelector('.uz-auth-card'); if (card) { card.classList.remove('uz-auth-shake'); void card.offsetWidth; card.classList.add('uz-auth-shake'); } }
  async function signIn() { if (!ready) { note('Connect Supabase first.'); return; } initClient(); var username = cleanUsername(document.getElementById('uz-login-user').value); var password = document.getElementById('uz-login-pass').value; if (username.length < 2 || password.length < 6) { note('Username needs 2+ characters and password needs 6+ characters.'); return; } var res = await client.auth.signInWithPassword({ email: authEmail(username), password: password }); if (res.error) { removeRecentAccount(username); renderGate(res.error.message || 'Sign in failed.'); return; } localStorage.setItem('uzLoginEmail', username); sessionStorage.setItem('uzSessionOk', 'true'); saveRecentAccount(username); setLightspeed(username); await ensureProfile(res.data.user); location.reload(); }
  async function signUp() { if (!ready) { note('Connect Supabase first.'); return; } initClient(); var username = cleanUsername(document.getElementById('uz-login-user').value); var password = document.getElementById('uz-login-pass').value; if (username.length < 2 || password.length < 6) { note('Username needs 2+ characters and password needs 6+ characters.'); return; } var res = await client.auth.signUp({ email: authEmail(username), password: password, options: { data: { username: username } } }); if (res.error) { authFail(res.error.message); return; } localStorage.setItem('uzLoginEmail', username); sessionStorage.setItem('uzSessionOk', 'true'); saveRecentAccount(username); setLightspeed(username); await ensureProfile(res.data.user); location.reload(); }

  function updateProfileReady() {
    var mount = document.getElementById('uz-profile-menu');
    if (!mount) return;
    var loading = document.getElementById('loading-screen');
    var boot = document.getElementById('boot-screen');
    var busy = (loading && loading.style.display !== 'none' && !loading.classList.contains('hidden')) || (boot && boot.style.display !== 'none' && !boot.classList.contains('hidden'));
    mount.classList.toggle('uz-profile-ready', !busy);
  }
  function renderProfile(session, profile) {
    if (!session && !profile && !isTempOwner()) { var old = document.getElementById('uz-profile-menu'); if (old) old.remove(); return; }
    var mount = document.getElementById('uz-profile-menu');
    if (!mount) { mount = document.createElement('div'); mount.id = 'uz-profile-menu'; mount.className = 'uz-profile-menu'; document.body.appendChild(mount); if (window.MutationObserver) { var obs = new MutationObserver(updateProfileReady); ['loading-screen','boot-screen'].forEach(function(id){ var el = document.getElementById(id); if (el) obs.observe(el, { attributes: true, attributeFilter: ['class','style'] }); }); } } updateProfileReady();
    var user = session && session.user;
    var username = (profile && profile.username) || usernameFromUser(user) || localStorage.getItem('uzLoginEmail') || '';
    window.UZCurrentProfile = profile || null; var owner = (profile && profile.role === 'owner') || isTempOwner();
    var temporary = isTempOwner() && !user;
    var savedName = temporary ? '' : getName(username);
    var name = temporary ? 'Temporary Owner' : (savedName || (profile && profile.display_name) || username || 'Profile');
    var avatar = temporary ? '' : getAvatar(username);
    var disabled = temporary ? ' disabled' : '';
    var readonlyNote = temporary ? '<p class="uz-profile-note">Temporary owner mode cannot save profile names, images, or account settings.</p>' : '';
    var passwordTools = temporary ? '' : '<details class="uz-account-tools"><summary>Account security</summary><button class="community-btn secondary" id="uz-password-save" type="button">Forgot / reset password</button></details>';
    var switchButton = temporary ? '' : switchAccountsHtml(username);
    var deleteButton = temporary ? '' : '<button class="community-btn danger" id="uz-profile-delete">Delete account</button>';
    mount.innerHTML = '<button class="uz-profile-chip" id="uz-profile-toggle"><span class="uz-profile-avatar">' + (avatar ? '<img src="' + esc(avatar) + '" alt="">' : esc(name.charAt(0).toUpperCase() || 'P')) + '</span><span>' + esc(name) + '</span></button><div class="uz-profile-panel" id="uz-profile-panel"><label>Display name</label><input id="uz-profile-name" maxlength="24" value="' + esc(savedName) + '" placeholder="Choose a name"' + disabled + '><label>Image URL</label><input id="uz-profile-avatar" value="' + esc(avatar) + '" placeholder="https://..."' + disabled + '><div class="community-row"><button class="community-btn" id="uz-profile-save"' + disabled + '>Save</button><button class="community-btn secondary" id="uz-profile-open" type="button">Expand profile settings</button><button class="community-btn secondary" id="uz-profile-logout">Log out</button></div>' + switchButton + passwordTools + deleteButton + readonlyNote + '<p>Account: <b>' + esc(username || 'Not signed in') + '</b></p><p>Role: <b>' + esc(owner ? 'owner' : 'member') + '</b></p></div>';
    document.getElementById('uz-profile-toggle').onclick = function () { document.getElementById('uz-profile-panel').classList.toggle('open'); };
    var openProfile = document.getElementById('uz-profile-open');
    if (openProfile) openProfile.onclick = function () { openProfileSettings(username, name, avatar, owner, temporary); };
    var save = document.getElementById('uz-profile-save');
    if (save && !temporary) save.onclick = async function () {
      var n = document.getElementById('uz-profile-name').value.replace(/\s+/g, ' ').trim().slice(0, cfg.maxNameLength || 24);
      var a = document.getElementById('uz-profile-avatar').value.trim();
      localStorage.setItem(profileKey('uzCommunityProfileName', username), n);
      localStorage.setItem(profileKey('uzCommunityAvatar', username), a);
      if (window.UZCommunity && window.UZCommunity.saveProfile) await window.UZCommunity.saveProfile();
      var toast = document.getElementById('uz-autosave-note');
      if (toast) { toast.textContent = 'Profile autosaved'; toast.classList.add('show'); setTimeout(function(){ toast.classList.remove('show'); }, 1500); }
      check();
    };
    var passBtn = document.getElementById('uz-password-save');
    if (passBtn) passBtn.onclick = async function () { await forgotPassword(); }; wireProfileSwitchAccounts();
    var del = document.getElementById('uz-profile-delete');
    if (del) del.onclick = async function () { await deleteAccount(username); };
    document.getElementById('uz-profile-logout').onclick = async function () { tempOwnerActive = false; window.UZTempOwnerActive = false; sessionStorage.removeItem('uzSessionOk'); if (client) await client.auth.signOut(); localStorage.removeItem('uzLoginEmail'); location.reload(); };
  }
  function openProfileSettings(username, name, avatar, owner, temporary) {
    var existing = document.getElementById('uz-profile-modal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'uz-profile-modal';
    modal.className = 'uz-profile-modal';
    modal.innerHTML = '<div class="uz-profile-modal-card"><button class="uz-profile-modal-close" id="uz-profile-modal-close">Close</button><h2>Profile settings</h2><div class="uz-profile-modal-grid"><section><h3>Account</h3><p>Username: <b>' + esc(username || 'Not signed in') + '</b></p><p>Role: <b>' + esc(owner ? 'owner' : 'member') + '</b></p><p>' + (temporary ? 'Temporary owner mode resets on refresh and cannot save account settings.' : 'Profile changes save only for this account.') + '</p></section><section><h3>Personalization</h3><p>Display name and image stay account-scoped. Site settings are also stored per account after login.</p><p>Use the small profile menu to edit name/image quickly.</p></section><section><h3>Security</h3><p>Use Account security in the profile menu to change your password or delete your account.</p></section></div></div>';
    document.body.appendChild(modal);
    document.getElementById('uz-profile-modal-close').onclick = function(){ modal.remove(); };
    modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });
  }
  async function changePassword() { return forgotPassword(); }
  async function deleteAccount(username) {
    if (!ready || !client || isTempOwner()) return;
    var typed = prompt('Type your exact username to delete this account:');
    if (typed !== username) { note('Account deletion cancelled. Username did not match.'); return; }
    var again = confirm('Delete account "' + username + '"? This cannot be undone.');
    if (!again) return;
    try { await client.from('profiles').delete().eq('id', (await client.auth.getUser()).data.user.id); } catch(e) {}
    var res = await client.rpc('delete_current_user');
    if (res.error) { note('Account deletion needs the Supabase delete_current_user function from the updated schema.'); return; }
    localStorage.removeItem(profileKey('uzCommunityProfileName', username));
    localStorage.removeItem(profileKey('uzCommunityAvatar', username)); removeRecentAccount(username);
    await client.auth.signOut();
    localStorage.removeItem('uzLoginEmail');
    location.reload();
  }
  function ownerAudio(kind) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = kind === 'bad' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(kind === 'crack' ? 92 : (kind === 'bad' ? 140 : 240), ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(kind === 'good' ? 760 : 58, ctx.currentTime + .22);
      gain.gain.setValueAtTime(.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(kind === 'crack' ? .18 : .12, ctx.currentTime + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .32);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .34);
    } catch(e) {}
  }
  function ownerRift(progress, opened) {
    var rift = document.getElementById('uz-owner-rift');
    if (!rift) { rift = document.createElement('div'); rift.id = 'uz-owner-rift'; rift.className = 'uz-owner-rift'; rift.innerHTML = '<i></i><b></b><span></span>'; document.body.appendChild(rift); }
    progress = Math.max(.08, Math.min(1, progress || .08));
    rift.style.setProperty('--rift-open', progress);
    rift.style.setProperty('--rift-gap', (2 + progress * 18) + 'vw');
    rift.style.setProperty('--rift-line', Math.min(14, 2 + progress * 12) + 'px');
    rift.classList.toggle('open', !!opened);
    document.body.classList.add('uz-owner-quake');
    clearTimeout(ownerRift.t);
    ownerRift.t = setTimeout(function(){ document.body.classList.remove('uz-owner-quake'); }, 260);
    ownerAudio(opened ? 'good' : 'crack');
    return rift;
  }
  function closeOwnerRift() { var r = document.getElementById('uz-owner-rift'); if (r) { r.classList.add('closing'); setTimeout(function(){ r.remove(); }, 900); } }
  function sparkle() { ownerRift(1, true); for (var i = 0; i < 46; i++) { var s = document.createElement('i'); s.className = 'uz-owner-spark'; s.style.setProperty('--spark-x', ((Math.random() * 360) - 180) + 'px'); s.style.setProperty('--spark-y', ((Math.random() * 280) - 140) + 'px'); document.body.appendChild(s); setTimeout(function(el){ return function(){ el.remove(); }; }(s), 950); } }
  function showOwnerPrompt() { var existing = document.getElementById('uz-owner-code-modal'); if (existing) existing.remove(); ownerRift(1, true); var modal = document.createElement('div'); modal.id = 'uz-owner-code-modal'; modal.className = 'uz-owner-code-modal from-rift'; modal.innerHTML = '<div class="uz-owner-code-card"><h2>Owner unlock</h2><p>Enter your 32-character temporary owner code. This unlock lasts until refresh or tab close.</p><input id="uz-owner-code-input" type="password" maxlength="64" autocomplete="off" placeholder="32-character raw code"><div class="community-row"><button class="community-btn" id="uz-owner-code-submit">Unlock</button><button class="community-btn secondary" id="uz-owner-code-cancel">Cancel</button></div><p id="uz-owner-code-error" class="uz-auth-error"></p></div>'; document.body.appendChild(modal); var input = document.getElementById('uz-owner-code-input'); var err = document.getElementById('uz-owner-code-error'); async function submit() { var code = input.value.trim(); if (code.length === 64 && /^[a-f0-9]{64}$/i.test(code)) { err.textContent = 'Enter the raw unlock code, not the stored hash.'; ownerAudio('bad'); modal.classList.add('uz-auth-shake'); return; } if (code.length !== 32) { err.textContent = 'Enter the 32-character raw unlock code.'; ownerAudio('bad'); modal.classList.add('uz-auth-shake'); return; } if (!bypassCodeReady()) { err.textContent = 'Owner unlock is not configured yet.'; ownerAudio('bad'); return; } var codeHash = await sha256Hex(code); if (codeHash !== cfg.ownerBypassHash) { err.textContent = 'Wrong code.'; ownerAudio('bad'); input.value = ''; input.focus(); modal.classList.remove('uz-auth-shake'); void modal.offsetWidth; modal.classList.add('uz-auth-shake'); return; } if (client) { try { await client.auth.signOut(); } catch(e) {} } sessionStorage.removeItem('uzSessionOk'); localStorage.removeItem('uzLoginEmail'); window.UZCurrentProfile = { username: 'temporary-owner', role: 'owner' }; tempOwnerActive = true; window.UZTempOwnerActive = true; setLightspeed('temporary-owner'); sparkle(); modal.classList.add('accepted'); setTimeout(function(){ modal.remove(); closeOwnerRift(); check(); }, 820); } document.getElementById('uz-owner-code-submit').onclick = submit; document.getElementById('uz-owner-code-cancel').onclick = function () { modal.remove(); closeOwnerRift(); }; input.addEventListener('keydown', function(e){ if (e.key === 'Enter') submit(); if (e.key === 'Escape') { modal.remove(); closeOwnerRift(); } }); setTimeout(function(){ input.focus(); }, 180); }
  async function check() { if (isTempOwner()) { setLightspeed('temporary-owner'); clearGate(); renderProfile(null, { username: 'temporary-owner', role: 'owner' }); if (window.UZCommunity && window.UZCommunity.refresh) window.UZCommunity.refresh(); return; } initClient(); if (!ready) { renderProfile(null, null); renderGate(''); return; } var res = await client.auth.getSession(); var session = res.data && res.data.session; if (!session || !session.user) { renderProfile(null, null); renderGate(''); return; } if (localStorage.getItem('uzRememberMe') !== 'true' && sessionStorage.getItem('uzSessionOk') !== 'true') { await client.auth.signOut(); renderProfile(null, null); renderGate(''); return; } var profile = await ensureProfile(session.user); var username = (profile && profile.username) || usernameFromUser(session.user); if (profile && profile.banned_until && new Date(profile.banned_until) > new Date()) { await client.auth.signOut(); localStorage.removeItem('uzLoginEmail'); renderGate('This account is banned.'); return; } setLightspeed(username); clearGate(); renderProfile(session, profile); }
  document.addEventListener('keydown', function (e) { var key = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (key === konami[konamiIndex]) { konamiIndex++; ownerRift(konamiIndex / konami.length, false); } else { konamiIndex = key === konami[0] ? 1 : 0; if (konamiIndex) ownerRift(konamiIndex / konami.length, false); } if (konamiIndex === konami.length) { konamiIndex = 0; showOwnerPrompt(); } }, true);
  window.UZAuthGate = { refresh: check, showLogin: function(msg){ tempOwnerActive=false; window.UZTempOwnerActive=false; renderGate(msg || ''); } };
  if (ready) { initClient(); client.auth.onAuthStateChange(check); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ check(); updateProfileReady(); }); else { check(); updateProfileReady(); } window.addEventListener('load', updateProfileReady);
}());

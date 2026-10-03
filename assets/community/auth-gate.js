(function () {
  var cfg = window.UZ_COMMUNITY_CONFIG || {};
  if (!cfg.requireLogin) return;
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) return;
  var client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  var allowed = (cfg.allowedEmailDomains || []).map(function (d) { return String(d).toLowerCase(); });
  function emailAllowed(email) { email = String(email || '').toLowerCase(); if (!allowed.length) return true; return allowed.some(function (d) { return email === d || email.endsWith('@' + d); }); }
  function renderGate(message) {
    var gate = document.getElementById('uz-auth-gate');
    if (!gate) { gate = document.createElement('div'); gate.id = 'uz-auth-gate'; gate.className = 'uz-auth-gate'; document.body.appendChild(gate); }
    gate.innerHTML = '<div class="uz-auth-card"><h1>Sign in required</h1><p>Use your approved school account. The site stores your authenticated email and display name only; it never sees your password.</p><div class="community-row"><button class="community-btn" id="uz-auth-google">Google</button><button class="community-btn secondary" id="uz-auth-ms">Microsoft</button></div><p style="margin-top:12px;color:#ffb3b3;">' + (message || '') + '</p></div>';
    document.getElementById('uz-auth-google').onclick = function () { signIn('google'); };
    document.getElementById('uz-auth-ms').onclick = function () { signIn('azure'); };
  }
  function clearGate() { var gate = document.getElementById('uz-auth-gate'); if (gate) gate.remove(); }
  async function signIn(provider) { await client.auth.signInWithOAuth({ provider: provider, options: { redirectTo: location.href.split('#')[0] } }); }
  async function check() {
    var res = await client.auth.getSession(); var session = res.data && res.data.session;
    if (!session || !session.user) { renderGate(''); return; }
    var email = session.user.email || ''; localStorage.setItem('uzLoginEmail', email); localStorage.setItem('lightspeedSystemMsg', 'You are logged in as ' + email + ' (IP Address: █████).');
    if (!emailAllowed(email)) { await client.auth.signOut(); renderGate('That email is not allowed for this site.'); return; }
    clearGate();
  }
  client.auth.onAuthStateChange(check);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check); else check();
}());
(function () {
  var cfg = window.UZ_COMMUNITY_CONFIG || {};
  var state = { client: null, user: null, profile: null, tab: 'chat', channel: null };
  var ready = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);

  function $(id) { return document.getElementById(id); }
  function status(msg) { var el = $('community-status'); if (el) el.textContent = msg || ''; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function when(ts) { try { return new Date(ts).toLocaleString(); } catch (e) { return ''; } }
  function role() { return state.profile && state.profile.role ? state.profile.role : 'member'; }
  function canPost() { return (cfg.postRoles || []).indexOf(role()) !== -1; }
  function canChat() { return (cfg.chatRoles || []).indexOf(role()) !== -1; }

  function renderSetup() {
    var setup = $('community-setup');
    if (!setup) return;
    setup.classList.toggle('community-hidden', ready);
  }

  function renderUser() {
    var box = $('community-user');
    if (!box) return;
    if (!ready) {
      box.innerHTML = '<div class="community-setup">Paste your Supabase URL and anon key in <b>assets/community/config.js</b>, then redeploy.</div>';
      return;
    }
    if (!state.user) {
      box.innerHTML = '<div class="community-auth"><input id="community-email" type="email" placeholder="Email"><input id="community-password" type="password" placeholder="Password"><input id="community-name" placeholder="Display name"><div class="community-row"><button class="community-btn" id="community-login">Log in</button><button class="community-btn secondary" id="community-signup">Sign up</button></div></div>';
      $('community-login').onclick = login;
      $('community-signup').onclick = signup;
      return;
    }
    box.innerHTML = '<p><b>' + esc(state.profile && state.profile.display_name || state.user.email) + '</b></p><p>Role: <b>' + esc(role()) + '</b></p><button class="community-btn secondary" id="community-logout">Log out</button>';
    $('community-logout').onclick = logout;
  }

  function renderComposer() {
    var chat = $('community-chat-form');
    var post = $('community-post-form');
    if (!chat || !post) return;
    chat.classList.toggle('community-hidden', state.tab !== 'chat');
    post.classList.toggle('community-hidden', state.tab !== 'posts');
    chat.innerHTML = state.user && canChat()
      ? '<textarea id="community-chat-input" maxlength="1000" placeholder="Message"></textarea><button class="community-btn" id="community-send-chat">Send</button>'
      : '<div class="community-message community-locked">Sign in to chat.</div>';
    post.innerHTML = state.user && canPost()
      ? '<input id="community-post-title" maxlength="120" placeholder="Post title"><textarea id="community-post-body" maxlength="4000" placeholder="Post text, links, file links, updates"></textarea><button class="community-btn" id="community-send-post">Publish post</button>'
      : '<div class="community-message community-locked">Posts are role locked. Give yourself owner/admin/mod in Supabase profiles.</div>';
    var sendChat = $('community-send-chat');
    if (sendChat) sendChat.onclick = sendMessage;
    var sendPost = $('community-send-post');
    if (sendPost) sendPost.onclick = sendPostMessage;
  }

  function setTab(tab) {
    state.tab = tab;
    Array.prototype.forEach.call(document.querySelectorAll('.community-tab'), function (btn) {
      btn.classList.toggle('active', btn.dataset.communityTab === tab);
    });
    loadItems();
    renderComposer();
    subscribe();
  }

  async function ensureProfile() {
    if (!state.client || !state.user) return null;
    var found = await state.client.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
    if (found.data) { state.profile = found.data; return found.data; }
    var name = localStorage.getItem('communityPendingName') || state.user.email || 'Member';
    var created = await state.client.from('profiles').insert({ id: state.user.id, display_name: name, role: 'member' }).select('*').single();
    state.profile = created.data || { display_name: name, role: 'member' };
    return state.profile;
  }

  async function refreshSession() {
    if (!ready) { renderSetup(); renderUser(); renderComposer(); return; }
    state.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    var session = await state.client.auth.getSession();
    state.user = session.data && session.data.session ? session.data.session.user : null;
    if (state.user) await ensureProfile();
    state.client.auth.onAuthStateChange(async function (_event, sessionData) {
      state.user = sessionData && sessionData.user ? sessionData.user : null;
      if (state.user) await ensureProfile(); else state.profile = null;
      renderUser(); renderComposer(); loadItems(); subscribe();
    });
    renderSetup(); renderUser(); renderComposer(); loadItems(); subscribe();
  }

  async function login() {
    status('Logging in...');
    var email = $('community-email').value.trim();
    var password = $('community-password').value;
    var res = await state.client.auth.signInWithPassword({ email: email, password: password });
    status(res.error ? res.error.message : 'Logged in.');
  }

  async function signup() {
    status('Creating account...');
    var email = $('community-email').value.trim();
    var password = $('community-password').value;
    var name = $('community-name').value.trim() || email;
    localStorage.setItem('communityPendingName', name);
    var res = await state.client.auth.signUp({ email: email, password: password });
    status(res.error ? res.error.message : 'Account created. Check email if confirmation is enabled.');
  }

  async function logout() {
    await state.client.auth.signOut();
    status('Logged out.');
  }

  async function loadItems() {
    var list = $('community-list');
    if (!list) return;
    if (!ready) { list.innerHTML = '<div class="community-message community-locked">Database not connected yet.</div>'; return; }
    var table = state.tab === 'chat' ? 'chat_messages' : 'posts';
    var query = state.client.from(table).select('*, profiles(display_name, role)').order('created_at', { ascending: false }).limit(50);
    var res = await query;
    if (res.error) { list.innerHTML = '<div class="community-message community-locked">' + esc(res.error.message) + '</div>'; return; }
    var rows = (res.data || []).slice().reverse();
    list.innerHTML = rows.map(renderItem).join('') || '<div class="community-message">Nothing here yet.</div>';
    list.scrollTop = list.scrollHeight;
  }

  function renderItem(row) {
    var profile = row.profiles || {};
    var name = profile.display_name || 'Member';
    var r = profile.role || 'member';
    if (state.tab === 'posts') {
      return '<article class="community-post"><div class="community-meta"><span>' + esc(name) + ' / ' + esc(r) + '</span><span>' + esc(when(row.created_at)) + '</span></div><h3>' + esc(row.title) + '</h3><div class="community-body">' + esc(row.body) + '</div></article>';
    }
    return '<article class="community-message"><div class="community-meta"><span>' + esc(name) + ' / ' + esc(r) + '</span><span>' + esc(when(row.created_at)) + '</span></div><div class="community-body">' + esc(row.body) + '</div></article>';
  }

  async function sendMessage() {
    var input = $('community-chat-input');
    var body = input.value.trim();
    if (!body) return;
    input.value = '';
    var res = await state.client.from('chat_messages').insert({ user_id: state.user.id, body: body });
    if (res.error) status(res.error.message);
  }

  async function sendPostMessage() {
    var title = $('community-post-title').value.trim();
    var body = $('community-post-body').value.trim();
    if (!title || !body) return;
    $('community-post-title').value = '';
    $('community-post-body').value = '';
    var res = await state.client.from('posts').insert({ user_id: state.user.id, title: title, body: body });
    if (res.error) status(res.error.message);
  }

  function subscribe() {
    if (!ready || !state.client) return;
    if (state.channel) state.client.removeChannel(state.channel);
    var table = state.tab === 'chat' ? 'chat_messages' : 'posts';
    state.channel = state.client.channel('community-' + table)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: table }, loadItems)
      .subscribe();
  }

  window.initCommunity = function () {
    Array.prototype.forEach.call(document.querySelectorAll('.community-tab'), function (btn) {
      btn.onclick = function () { setTab(btn.dataset.communityTab); };
    });
    refreshSession();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.initCommunity);
  else window.initCommunity();
}());
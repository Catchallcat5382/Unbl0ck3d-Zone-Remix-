(function () {
  window.UZ_ACCOUNT_DEBUG = window.UZ_ACCOUNT_DEBUG || [];
  window.UZ_ACCOUNT_DEBUG.push('community-js-start');
  var cfg = window.UZ_COMMUNITY_CONFIG || {};
  var state = { client: null, user: null, profile: null, tab: 'chat', channelName: 'chat', realtime: null, profileRealtime: null, presenceChannel: null, onlineIds: {}, profileByUser: {}, memberRows: [], presenceReady: true, kickReady: true, heartbeatTimer: null, authUnsub: null };
  var mongoApiUrl = String(cfg.mongoApiUrl || '').replace(/\/$/, '');
  var mongoMode = !!mongoApiUrl;
  var firebaseMode = !mongoMode && cfg.authProvider === 'firebase';
  var firebaseReady = firebaseMode && cfg.firebaseConfig && cfg.firebaseConfig.apiKey && cfg.firebaseConfig.projectId && window.firebase;
  var ready = mongoMode || firebaseReady || Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  var storageKey = 'uzCommunityProfileName';
  var channelInfo = {
    chat: { tab: 'chat', label: 'general-chat', title: 'General Chat', note: 'Live chat for everyone signed in.' },
    settings: { tab: 'posts', label: 'settings-share', title: 'Settings Share', note: 'Everyone can upload and copy settings presets.' },
    suggestions: { tab: 'posts', label: 'suggestions', title: 'Suggestions', note: 'Post ideas, bugs, and requests.' },
    'voice-lounge': { tab: 'voice', label: 'voice-lounge', title: 'Voice Lounge', note: 'Join the community voice room. Live mic audio needs WebRTC hosting.' },
    members: { tab: 'members', label: 'members', title: 'Members', note: 'Profiles and role hierarchy.' }
  };
  function $(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function when(ts) { try { return new Date(ts).toLocaleString(); } catch (e) { return ''; } }
  function status(msg) { var el = $('community-status'); if (el) el.textContent = msg || ''; }
  function debugLog(label, detail) {
    try {
      window.UZ_ACCOUNT_DEBUG = window.UZ_ACCOUNT_DEBUG || [];
      window.UZ_ACCOUNT_DEBUG.push(new Date().toISOString() + ' community-' + label + (detail ? ': ' + detail : ''));
      if (window.UZ_ACCOUNT_DEBUG.length > 80) window.UZ_ACCOUNT_DEBUG.splice(0, window.UZ_ACCOUNT_DEBUG.length - 80);
    } catch(e) {}
  }
  function isTempOwner() { return window.UZTempOwnerActive === true; }
  function role() { if (isTempOwner()) return 'owner'; var a = state.profile || {}; var b = window.UZCurrentProfile || {}; var rank = { member: 0, mod: 1, admin: 2, owner: 3 }; return (rank[b.role] || 0) > (rank[a.role] || 0) ? b.role : (a.role || b.role || 'member'); }
  function isDeleted(profile) { return profile && profile.role === 'deleted'; }
  function isBanned(profile) { return profile && (profile.role === 'banned' || (profile.banned_until && new Date(profile.banned_until) > new Date())); }
  function isKicked(profile) { return profile && state.kickReady && profile.kicked_until && new Date(profile.kicked_until) > new Date(); }
  function isMuted(profile) { return profile && profile.muted_until && new Date(profile.muted_until) > new Date(); }
  function isOwner() { return role() === 'owner'; }
  function isRealOwner() { return role() === 'owner' && !isTempOwner() && !!state.user; }
  function isStaff() { return ['owner','admin','mod'].indexOf(role()) !== -1 || isTempOwner(); }
  function canPost() { return state.channelName === 'settings' || state.channelName === 'suggestions' || (state.channelName === 'announcements' && isStaff()) || (state.tab === 'posts' && isStaff()); }
  function canEditPost(row) { return role() === 'owner' || role() === 'admin' || (role() === 'mod' && state.user && row.user_id === state.user.id); }
  function canDeletePost(row) { return role() === 'owner' || role() === 'admin' || (role() === 'mod' && state.user && row.user_id === state.user.id); }
  function canEditMessage(row) { return !!(state.user && row && String(row.user_id) === String(state.user.id) && !row.deleted_at); }
  function canDeleteMessage(row) { return !!(row && !row.deleted_at && (role() === 'owner' || role() === 'admin')); }
  function notifySaved(msg) { var n = $('community-save-note') || $('uz-autosave-note'); if (!n) { n = document.createElement('div'); n.id = 'community-save-note'; n.className = 'community-save-note'; document.body.appendChild(n); } n.textContent = msg || 'Saved'; n.classList.add('show'); clearTimeout(notifySaved.t); notifySaved.t = setTimeout(function(){ n.classList.remove('show'); }, 1500); }
  function normalizeName(v) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, cfg.maxNameLength || 24); }
  function hasBadWord(v) { var s = String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return (cfg.blockedWords || []).some(function (w) { return s.indexOf(String(w).toLowerCase().replace(/[^a-z0-9]/g, '')) !== -1; }); }
  function validName(v) { v = normalizeName(v); return v.length >= (cfg.minNameLength || 2) && !hasBadWord(v); }
  function profileUsername() { return state.profile && state.profile.username ? state.profile.username : (state.user && state.user.email ? state.user.email.split('@')[0] : 'guest'); }
  function getName() { if (isTempOwner() && !state.user) return 'Temporary Owner'; return normalizeName(localStorage.getItem(storageKey + ':' + profileUsername()) || ''); }
  function initClient() { if (firebaseMode && firebaseReady && !state.client) { if (!window.firebase.apps.length) window.firebase.initializeApp(cfg.firebaseConfig); state.client = { auth: window.firebase.auth(), db: window.firebase.firestore() }; return; } if (!mongoMode && ready && !state.client) state.client = window.supabase.createClient(String(cfg.supabaseUrl || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''), cfg.supabaseAnonKey); }
  function mongoToken() { return localStorage.getItem('uzMongoToken') || sessionStorage.getItem('uzMongoToken') || ''; }
  async function mongoFetch(path, options) {
    options = options || {};
    options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    var token = mongoToken();
    if (token) options.headers.Authorization = 'Bearer ' + token;
    var controller = window.AbortController ? new AbortController() : null;
    var timeout = setTimeout(function(){ if (controller) controller.abort(); }, Number(options.timeout || 16000));
    if (controller) options.signal = controller.signal;
    delete options.timeout;
    var res;
    try {
      res = await fetch(mongoApiUrl + path, options);
    } catch (e) {
      debugLog('api-failed', path + ' ' + (e && e.name ? e.name : 'fetch'));
      var offline = new Error('Mongo account API is not reachable at ' + mongoApiUrl + '. If this host is blocked, switch the API URL to a different deployed host.');
      offline.cause = e;
      offline.offline = true;
      throw offline;
    } finally {
      clearTimeout(timeout);
    }
    var data = await res.json().catch(function(){ return {}; });
    if (!res.ok) { var err = new Error(data.error || 'Mongo API request failed.'); err.status = res.status; err.data = data; throw err; }
    return data;
  }
  function fromMongoUser(u) { return u ? { id: u.id, username: u.username, display_name: u.displayName || u.username, role: u.role || 'member', warnings: u.warnings || 0, banned_until: u.bannedUntil, kicked_until: u.kickedUntil, muted_until: u.mutedUntil, last_seen: u.lastSeen } : null; }
  function mongoMessage(row) { var id = row._id && (row._id.$oid || row._id); return { id: id, user_id: row.userId && (row.userId.$oid || row.userId), body: row.body, deleted_body: row.deletedBody, deleted_at: row.deletedAt, updated_at: row.editedAt, created_at: row.createdAt, profiles: { username: row.username, display_name: row.username, role: 'member' } }; }
  function mongoPost(row) { var id = row._id && (row._id.$oid || row._id); return { id: id, user_id: row.userId && (row.userId.$oid || row.userId), title: row.title, body: row.body, created_at: row.createdAt, profiles: { username: row.username, display_name: row.username, role: 'staff' } }; }
  function fromFirebaseProfile(id, data) { data = data || {}; return { id: id || data.id, username: data.username, display_name: data.display_name || data.displayName || data.username, role: data.role || 'member', warnings: data.warnings || 0, banned_until: data.banned_until || data.bannedUntil || null, kicked_until: data.kicked_until || data.kickedUntil || null, muted_until: data.muted_until || data.mutedUntil || null, last_seen: data.last_seen || data.lastSeen || null, email: data.email || '' }; }
  function firebaseRow(doc) { var d = doc.data() || {}; d.id = doc.id; d.user_id = d.user_id || d.userId; d.created_at = d.created_at || d.createdAt; d.updated_at = d.updated_at || d.updatedAt; d.deleted_at = d.deleted_at || d.deletedAt; d.deleted_body = d.deleted_body || d.deletedBody; return d; }
  function displayName() { return getName() || (state.profile && (state.profile.display_name || state.profile.username)) || (state.user && state.user.email ? state.user.email.split('@')[0] : 'Member'); }
  function mergeProfile(profile) { if (!profile) return; var rank = { member: 0, mod: 1, admin: 2, owner: 3 }; var cur = state.profile || {}; state.profile = Object.assign({}, cur, profile); if ((rank[(window.UZCurrentProfile || {}).role] || 0) > (rank[state.profile.role] || 0)) state.profile.role = window.UZCurrentProfile.role; window.UZCurrentProfile = state.profile; }
  function profileFields() { return 'id, username, display_name, role, warnings, banned_until, muted_until' + (state.kickReady ? ', kicked_until' : '') + ', staff_note' + (state.presenceReady ? ', last_seen' : ''); }
  function isOnline(profile) { if (!profile) return false; if (state.user && String(profile.id) === String(state.user.id)) return true; if (state.onlineIds && state.onlineIds[String(profile.id)]) return true; if (!profile.last_seen) return false; var t = new Date(profile.last_seen).getTime(); return Number.isFinite(t) && Date.now() - t < 18000; }
  async function touchPresence() { if (firebaseMode) { if (!state.user || !state.client) return; try { await state.client.db.collection('profiles').doc(state.user.id).set({ last_seen: new Date().toISOString(), email: state.user.email || '' }, { merge: true }); } catch(e) {} return; } if (mongoMode) { try { var mine = await mongoFetch('/me'); mergeProfile(fromMongoUser(mine.user)); } catch(e) { if (e.status === 401 || e.status === 403) await forceSignedOut(e.message || 'Your account session ended.', e.data && e.data.banned ? profileUsername() : null); } return; } if (!ready || !state.client || !state.user || !state.presenceReady) return; var res = await state.client.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', state.user.id).select(profileFields()).single(); if (res.error) { if (/last_seen/i.test(res.error.message || '')) state.presenceReady = false; return; } if (res.data) mergeProfile(res.data); }
  function startHeartbeat() { clearInterval(state.heartbeatTimer); if (!state.user) return; touchPresence(); state.heartbeatTimer = setInterval(function(){ touchPresence(); if (state.tab === 'members') loadMembers(true); else loadMembers(false); }, (mongoMode || firebaseMode) ? 5000 : 25000); }
  function subscribePresence() {
    if (!ready || !state.client || !state.user) return;
    if (state.presenceChannel) state.client.removeChannel(state.presenceChannel);
    state.onlineIds = {};
    var username = (state.profile && state.profile.username) || (state.user.email || '').split('@')[0] || state.user.id;
    state.presenceChannel = state.client.channel('uz-community-presence', { config: { presence: { key: state.user.id } } });
    state.presenceChannel.on('presence', { event: 'sync' }, function(){
      var seen = {};
      var all = state.presenceChannel.presenceState();
      Object.keys(all || {}).forEach(function(key){
        (all[key] || []).forEach(function(p){ if (p && p.user_id) seen[String(p.user_id)] = true; });
      });
      state.onlineIds = seen;
      loadMembers(state.tab === 'members');
    });
    state.presenceChannel.subscribe(function(status){
      if (status === 'SUBSCRIBED') state.presenceChannel.track({ user_id: state.user.id, username: username, online_at: new Date().toISOString() });
    });
  }
  function handleProfileError(error) {
    var msg = error && error.message ? error.message : '';
    var changed = false;
    if (/last_seen/i.test(msg)) { state.presenceReady = false; changed = true; }
    if (/kicked_until/i.test(msg)) { state.kickReady = false; changed = true; }
    return changed;
  }
  function subscribeOwnProfile() {
    if (firebaseMode) {
      if (!ready || !state.client || !state.user) return;
      if (typeof state.profileRealtime === 'function') state.profileRealtime();
      state.profileRealtime = state.client.db.collection('profiles').doc(state.user.id).onSnapshot(async function(doc){
        if (!doc.exists) { await forceSignedOut('This account was deleted.', null, profileUsername()); return; }
        mergeProfile(fromFirebaseProfile(doc.id, doc.data()));
        if (isDeleted(state.profile)) await forceSignedOut('This account was deleted.', null, (state.profile && state.profile.username) || profileUsername());
        else if (isBanned(state.profile)) await forceSignedOut('This account is banned.', (state.profile && state.profile.username) || 'this account');
        else if (isKicked(state.profile)) await forceSignedOut('You were kicked from this account until ' + when(state.profile.kicked_until) + '.');
        else clearDeviceBan((state.profile && state.profile.username) || profileUsername());
        loadMembers(state.tab === 'members');
      });
      return;
    }
    if (!ready || !state.client || !state.user) return;
    if (state.profileRealtime) state.client.removeChannel(state.profileRealtime);
    state.profileRealtime = state.client.channel('uz-profile-' + state.user.id).on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: 'id=eq.' + state.user.id }, async function(payload){
      if (payload && payload.eventType === 'DELETE') {
        var deletedName = (state.profile && state.profile.username) || 'this account';
        await forceSignedOut(deletedName + ' was deleted by an owner.');
        loadItems();
        return;
      }
      if (payload && payload.new) mergeProfile(payload.new);
      if (isBanned(state.profile)) {
        await forceSignedOut('This account is banned.', (state.profile && state.profile.username) || 'this account');
      } else if (isKicked(state.profile)) {
        await forceSignedOut('You were kicked from this account until ' + when(state.profile.kicked_until) + '.');
      }
      loadMembers(state.tab === 'members');
    }).subscribe();
  }
  function audit(action, detail) { try { var logs = JSON.parse(localStorage.getItem('uzAuditLog') || '[]'); logs.unshift({ action: action, detail: detail || '', by: profileUsername(), at: new Date().toISOString() }); localStorage.setItem('uzAuditLog', JSON.stringify(logs.slice(0, 300))); } catch(e) {} }
  function pingEveryone(title) { if (window.UZNotify && window.UZNotify.add) window.UZNotify.add('@everyone: ' + (title || 'New announcement')); }
  function clearDeviceBan(username) { try { var u = String(username || '').toLowerCase(); if (!u || localStorage.getItem('uzSiteBanned') === u) localStorage.removeItem('uzSiteBanned'); if (u) localStorage.removeItem('uzBannedAccount:' + u); localStorage.removeItem('uzSiteBannedUid'); } catch(e) {} }
  async function forceSignedOut(message, bannedName, deletedName) { try { if (state.client && !mongoMode && !bannedName) await state.client.auth.signOut(); } catch(e) {} try { sessionStorage.removeItem('uzSessionOk'); if (!bannedName) localStorage.removeItem('uzLoginEmail'); localStorage.removeItem('uzMongoToken'); sessionStorage.removeItem('uzMongoToken'); if (deletedName) { var u = String(deletedName).toLowerCase(); localStorage.setItem('uzRecentAccounts', JSON.stringify((JSON.parse(localStorage.getItem('uzRecentAccounts') || '[]') || []).filter(function(a){ return String(a.username || '').toLowerCase() !== u; }))); } if (bannedName) { localStorage.setItem('uzBannedAccount:' + String(bannedName).toLowerCase(), '1'); localStorage.setItem('uzSiteBanned', String(bannedName).toLowerCase()); if (state.user && state.user.id) localStorage.setItem('uzSiteBannedUid', state.user.id); } } catch(e) {} if (!bannedName) { state.user = null; state.profile = null; } renderUser(); renderComposer(); if (bannedName && window.UZAuthGate && window.UZAuthGate.showBanned) window.UZAuthGate.showBanned(bannedName); else if (window.UZAuthGate) window.UZAuthGate.showLogin(message || 'Your account session ended.'); }
  function renderSetup() { var setup = $('community-setup'); if (setup) setup.classList.toggle('community-hidden', ready); }
  function renderUser() {
    var box = $('community-user'); if (!box) return;
    var signed = state.user ? 'Signed in as <b>' + esc((state.profile && state.profile.username) || (state.user.email || 'user').split('@')[0]) + '</b>.' : (isTempOwner() ? 'Using temporary owner mode.' : 'Sign in from the account gate first.');
    box.innerHTML = '<div class="community-auth"><p>' + signed + '</p><p>Role: <b>' + esc(role()) + '</b></p><p>Pick a channel on the left. Open member cards to view profiles. Owners can adjust roles in Members.</p></div>';
    Array.prototype.forEach.call(document.querySelectorAll('.community-staff-tab,.community-staff-only'), function(btn){ btn.classList.toggle('community-hidden', !isStaff()); });
  }
  async function saveProfile() { var name = displayName(); if (!validName(name)) { status('Pick a clean profile name, 2-' + (cfg.maxNameLength || 24) + ' characters.'); return false; } if (state.user) await upsertProfile(); renderUser(); renderComposer(); return true; }
  async function logout() { if (mongoMode) { localStorage.removeItem('uzMongoToken'); sessionStorage.removeItem('uzMongoToken'); } else if (state.client) await state.client.auth.signOut(); state.user = null; state.profile = null; status('Signed out.'); renderUser(); renderComposer(); loadItems(); if (window.UZAuthGate) window.UZAuthGate.refresh(); }
  async function upsertProfile() { if (!ready || !state.user) return; initClient(); if (firebaseMode) { var username = (state.user.email || '').split('@')[0] || state.user.id; var ref = state.client.db.collection('profiles').doc(state.user.id); var doc = await ref.get(); if (!doc.exists) await ref.set({ id: state.user.id, username: username, display_name: username, role: 'member', warnings: 0, email: state.user.email || '', created_at: new Date().toISOString(), last_seen: new Date().toISOString() }); else await ref.set({ last_seen: new Date().toISOString(), email: state.user.email || '' }, { merge: true }); doc = await ref.get(); mergeProfile(fromFirebaseProfile(doc.id, doc.data())); if (isDeleted(state.profile)) await forceSignedOut('This account was deleted.', null, (state.profile && state.profile.username) || username); else if (isBanned(state.profile)) await forceSignedOut('This account is banned.', (state.profile && state.profile.username) || username); return; } var payload = { id: state.user.id, display_name: displayName() }; if (state.presenceReady) payload.last_seen = new Date().toISOString(); var res = await state.client.from('profiles').upsert(payload, { onConflict: 'id' }).select(profileFields()).single(); if (res.error && handleProfileError(res.error)) { delete payload.last_seen; res = await state.client.from('profiles').upsert(payload, { onConflict: 'id' }).select(profileFields()).single(); } if (!res.error && res.data) mergeProfile(res.data); try { localStorage.setItem('lightspeedSchoolName', 'Unblocked Zone'); localStorage.setItem('lightspeedTopText', 'Oops,'); localStorage.setItem('lightspeedBottomText', 'is not available because it is categorized as Security - Proxy.'); localStorage.setItem('lightspeedSystemMsg', 'You are logged in as ' + ((state.profile && state.profile.username) || state.user.email || 'user') + ' (IP Address: hidden).'); localStorage.setItem('scUrl', 'Unblocked Zone'); localStorage.setItem('scHeading', 'Unblocked Zone'); localStorage.setItem('scIp', 'hidden'); } catch(e) {} if (isKicked(state.profile)) { status('You were kicked from the site.'); await forceSignedOut('You were kicked from this account until ' + when(state.profile.kicked_until) + '.'); return; } if (isBanned(state.profile)) { status('This account is banned.'); if (state.profile && state.profile.username) try { localStorage.setItem('uzBannedAccount:' + state.profile.username, '1'); } catch(e) {} await forceSignedOut('This account is banned.', (state.profile && state.profile.username) || 'this account'); } }
  async function refreshSession() { if (!ready) { renderSetup(); renderUser(); renderComposer(); loadItems(); return; } if (firebaseMode) { initClient(); var fb = state.client.auth.currentUser; state.user = fb ? { id: fb.uid, email: fb.email || '' } : null; if (state.user) { await upsertProfile(); startHeartbeat(); subscribeOwnProfile(); } if (!state.authUnsub) state.authUnsub = state.client.auth.onAuthStateChanged(async function(user){ state.user = user ? { id: user.uid, email: user.email || '' } : null; if (state.user) { await upsertProfile(); startHeartbeat(); subscribeOwnProfile(); } else { clearInterval(state.heartbeatTimer); if (typeof state.profileRealtime === 'function') { state.profileRealtime(); state.profileRealtime = null; } if (typeof state.realtime === 'function') { state.realtime(); state.realtime = null; } state.profile = null; } renderUser(); renderComposer(); loadItems(); subscribe(); }); renderSetup(); renderUser(); renderComposer(); loadItems(); subscribe(); return; } if (mongoMode) { try { var mine = await mongoFetch('/me'); var p = fromMongoUser(mine.user); state.user = { id: p.id, email: p.username + '@' + (cfg.internalAuthDomain || 'uzlogin.net') }; mergeProfile(p); startHeartbeat(); } catch(e) { state.user = null; state.profile = null; } renderSetup(); renderUser(); renderComposer(); loadMembers(state.tab === 'members'); loadItems(); return; } initClient(); var session = await state.client.auth.getSession(); state.user = session.data && session.data.session ? session.data.session.user : null; if (state.user) { await upsertProfile(); startHeartbeat(); subscribePresence(); subscribeOwnProfile(); } state.client.auth.onAuthStateChange(async function (_event, sessionData) { state.user = sessionData && sessionData.user ? sessionData.user : null; if (state.user) { await upsertProfile(); startHeartbeat(); subscribePresence(); subscribeOwnProfile(); } else { clearInterval(state.heartbeatTimer); if (state.presenceChannel) state.client.removeChannel(state.presenceChannel); if (state.profileRealtime) state.client.removeChannel(state.profileRealtime); state.onlineIds = {}; state.profile = null; } renderUser(); renderComposer(); loadItems(); subscribe(); }); renderSetup(); renderUser(); renderComposer(); loadItems(); subscribe(); }
  function postAllowedMessage() { if (state.channelName === 'announcements') return 'Announcements are staff-only. Members can read and copy.'; return 'Sign in to post here.'; }
  function renderComposer() {
    var chat = $('community-chat-form'); var post = $('community-post-form'); var staff = $('community-staff-form'); if (!chat || !post || !staff) return;
    chat.classList.toggle('community-hidden', state.tab !== 'chat'); post.classList.toggle('community-hidden', state.tab !== 'posts'); staff.classList.toggle('community-hidden', true);
    var ok = state.user && !isBanned(state.profile) && !isMuted(state.profile);
    chat.innerHTML = ok ? '<textarea id="community-chat-input" maxlength="1000" placeholder="Message #' + esc(channelInfo[state.channelName].label) + '"></textarea><button class="community-btn" id="community-send-chat">Send</button>' : '<div class="community-message community-locked">Sign in with a real account to chat.</div>';
    var postOk = ok && canPost();
    var titlePh = state.channelName === 'settings' ? 'Preset name' : (state.channelName === 'suggestions' ? 'Suggestion title' : 'Thread title');
    var bodyPh = state.channelName === 'settings' ? 'Describe this settings preset, or press Attach settings.' : 'Post text, links, updates, settings, or attached file text';
    post.innerHTML = postOk ? '<div class="community-post-composer"><input id="community-post-title" maxlength="120" placeholder="' + titlePh + '"><textarea id="community-post-body" maxlength="7000" placeholder="' + bodyPh + '"></textarea><div class="community-composer-actions"><button class="community-btn secondary" id="community-attach-settings" type="button">Attach settings</button><label class="community-file-label">Attach file<input id="community-file-input" type="file"></label><button class="community-btn" id="community-send-post">Publish</button></div></div>' : '<div class="community-message community-locked">' + postAllowedMessage() + '</div>';
    var sendChat = $('community-send-chat'); if (sendChat) sendChat.onclick = sendMessage;
    var sendPost = $('community-send-post'); if (sendPost) sendPost.onclick = sendPostMessage;
    var attachSettings = $('community-attach-settings'); if (attachSettings) attachSettings.onclick = attachSettingsPreset;
    var attachFile = $('community-file-input'); if (attachFile) attachFile.onchange = attachFileToPost;
    wireMentionComplete($('community-post-body'));
  }
  function decorateMentions(text) { return esc(text).replace(/@everyone\b/gi, '<span class="community-mention">@everyone</span>'); }
  function renderRichBody(text) {
    var raw = String(text || '');
    var match = raw.match(/(?:^|\n)Attached file:\s*([^\n]+)\n(data:[^\s]+)/);
    if (!match) return decorateMentions(raw);
    var before = raw.slice(0, match.index).trim();
    var name = match[1].trim();
    var data = match[2].trim();
    var embed = '<div class="community-attachment-embed"><b>' + esc(name) + '</b><small>Attached file</small>' + (/^data:image\//i.test(data) ? '<img src="' + esc(data) + '" alt="' + esc(name) + '">' : '<a href="' + esc(data) + '" download="' + esc(name) + '">Download</a>') + '</div>';
    return (before ? decorateMentions(before) : '') + embed;
  }
  function wireMentionComplete(el) {
    if (!el) return;
    el.addEventListener('keydown', function(e){
      if (e.key !== 'Tab') return;
      var start = el.selectionStart || 0;
      var before = el.value.slice(0, start);
      var m = before.match(/(^|\s)@(?:e|ev|eve|ever|every|everyo|everyon)?$/i);
      if (!m) return;
      e.preventDefault();
      var at = before.lastIndexOf('@');
      el.value = el.value.slice(0, at) + '@everyone ' + el.value.slice(start);
      var pos = at + '@everyone '.length;
      el.setSelectionRange(pos, pos);
    });
  }
  function currentSettingsText() { var keys = ['activeCursor','cloakTitle','cloakFavicon','uzRememberMe','panicEnabled','panicKey','startupLoadingEnabled','loadingScreenEnabled','openGamesInBlob','hiddenPageCover']; var out = keys.map(function(k){ return k + ': ' + (localStorage.getItem(k) || ''); }).join('\n'); return 'Settings preset from ' + displayName() + '\n```\n' + out + '\n```'; }
  function appendPostText(text) { var body = $('community-post-body'); if (!body) return; body.value = (body.value ? body.value + '\n\n' : '') + text; body.focus(); }
  function attachSettingsPreset() { appendPostText(currentSettingsText()); status('Settings preset added.'); }
  function attachFileToPost(e) { var file = e && e.target && e.target.files ? e.target.files[0] : null; if (!file) return; if (file.size > 250000) { status('File is too large for inline sharing. Upload it somewhere and paste a link.'); return; } var reader = new FileReader(); reader.onload = function(){ appendPostText('Attached file: ' + file.name + '\n' + String(reader.result || '').slice(0, 12000)); status('File attached.'); }; reader.readAsDataURL(file); }
  function renderVoiceRoom() {
    var list = $('community-list');
    if (!list) return;
    var joined = localStorage.getItem('uzVoiceJoined') === '1';
    var muted = localStorage.getItem('uzVoiceMuted') === '1';
    var deafened = localStorage.getItem('uzVoiceDeafened') === '1';
    var online = (state.memberRows || []).filter(isOnline);
    var names = online.map(function(m){ return '<span class="community-voice-pill">' + esc(m.display_name || m.username || 'member') + '</span>'; }).join('') || '<span class="community-voice-empty">Nobody else is showing online yet.</span>';
    list.innerHTML = '<div class="community-voice-room"><h3>Voice Lounge</h3><p>Mic controls work in this browser. Live cross-device talking still needs a WebRTC signaling server.</p><div class="community-voice-status ' + (joined ? 'is-joined' : '') + '">' + (joined ? 'You are in voice' + (muted ? ' / muted' : '') + (deafened ? ' / deafened' : '') + '.' : 'You are not in voice.') + '</div><div class="community-voice-members">' + names + '</div><div class="community-row"><button class="community-btn" id="community-voice-toggle" type="button">' + (joined ? 'Leave voice' : 'Join voice') + '</button><button class="community-btn secondary" id="community-voice-mute" type="button"' + (!joined ? ' disabled' : '') + '>' + (muted ? 'Unmute' : 'Mute') + '</button><button class="community-btn secondary" id="community-voice-deafen" type="button"' + (!joined ? ' disabled' : '') + '>' + (deafened ? 'Undeafen' : 'Deafen') + '</button></div></div>';
    var btn = $('community-voice-toggle');
    if (btn) btn.onclick = async function(){ if (!joined && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) { try { var stream = await navigator.mediaDevices.getUserMedia({ audio: true }); window.uzVoiceStream = stream; stream.getAudioTracks().forEach(function(t){ t.enabled = !muted; }); } catch(e) { status('Microphone blocked or unavailable.'); return; } } if (joined && window.uzVoiceStream) { window.uzVoiceStream.getTracks().forEach(function(t){ t.stop(); }); window.uzVoiceStream = null; } localStorage.setItem('uzVoiceJoined', joined ? '0' : '1'); renderVoiceRoom(); };
    var mute = $('community-voice-mute'); if (mute) mute.onclick = function(){ localStorage.setItem('uzVoiceMuted', muted ? '0' : '1'); if (window.uzVoiceStream) window.uzVoiceStream.getAudioTracks().forEach(function(t){ t.enabled = muted; }); renderVoiceRoom(); };
    var deafen = $('community-voice-deafen'); if (deafen) deafen.onclick = function(){ localStorage.setItem('uzVoiceDeafened', deafened ? '0' : '1'); renderVoiceRoom(); };
  }
  function ensureCommunityTools() {
    var shell = document.querySelector('.community-discord-shell');
    if (!shell || document.getElementById('community-pop-tools')) return;
    var tools = document.createElement('div');
    tools.id = 'community-pop-tools';
    tools.className = 'community-pop-tools';
    tools.innerHTML = '<button class="community-btn secondary" id="community-expand-toggle" type="button">Expand</button>';
    shell.insertBefore(tools, shell.firstChild);
    document.getElementById('community-expand-toggle').onclick = function(){ document.body.classList.toggle('community-expanded'); this.textContent = document.body.classList.contains('community-expanded') ? 'Shrink' : 'Expand'; };
  }
  function renderChannelHeader() { var head = $('community-channel-head'); var c = channelInfo[state.channelName] || channelInfo.chat; if (head) head.innerHTML = '<h3># ' + esc(c.title) + '</h3><p>' + esc(c.note) + '</p>'; }
  function setTab(tab, channel) {
    state.tab = tab || 'chat'; state.channelName = channel || (tab === 'chat' ? 'chat' : state.channelName || 'chat');
    Array.prototype.forEach.call(document.querySelectorAll('.community-tab'), function(btn){ var active = btn.dataset.communityChannel === state.channelName; btn.classList.toggle('active', active); btn.classList.toggle('secondary', !active); });
    renderChannelHeader(); renderComposer(); loadItems(); subscribe();
  }
  async function renderAnnouncementsPanel() {
    var list = $('announcements-list'), compose = $('announcements-compose');
    if (!list) return;
    if (!ready) { list.innerHTML = '<div class="community-message community-locked">Live database is not connected yet.</div>'; return; }
    if (mongoMode) {
      try {
        var data = await mongoFetch('/posts');
        var rows = (data.posts || []).map(mongoPost).filter(function(row){ return normalizePostChannel(row.title) === 'announcements'; });
        list.innerHTML = rows.map(function(row){ var p = row.profiles || {}; var del = canDeletePost(row) ? '<button class="community-btn secondary community-delete-announcement" data-post-id="' + esc(row.id) + '">Delete</button>' : ''; return '<article class="announcement-card"><h3>' + esc(stripPostChannel(row.title || 'Announcement')) + '</h3><div class="announcement-meta">' + esc(p.display_name || p.username || 'Staff') + ' / ' + esc(when(row.created_at)) + '</div><div class="announcement-body">' + renderRichBody(row.body || '') + '</div><div class="community-actions"><button class="community-btn secondary community-copy-announcement" data-post-id="' + esc(row.id) + '">Copy</button>' + del + '</div></article>'; }).join('') || '<div class="community-message">No announcements yet.</div>';
        Array.prototype.forEach.call(document.querySelectorAll('.community-copy-announcement'), function(btn){ btn.onclick = function(){ var row = rows.filter(function(r){ return String(r.id) === String(btn.dataset.postId); })[0]; if (!row) return; navigator.clipboard.writeText(stripPostChannel(row.title || '') + '\n\n' + (row.body || '')); notifySaved('Announcement copied'); }; }); wireAnnouncementActions(rows);
        if (compose) {
          var ok = state.user && isStaff();
          compose.innerHTML = ok ? '<input id="announcement-title" maxlength="120" placeholder="Announcement title"><textarea id="announcement-body" maxlength="7000" placeholder="Announcement text, links, files, or @everyone. Type @eve then Tab."></textarea><details class="announcement-file-drop"><summary>Files</summary><label class="community-file-label">Browse file<input id="announcement-file-input" type="file"></label></details><button class="community-btn" id="announcement-send" type="button">Publish announcement</button>' : '<div class="community-message community-locked">Mod, admin, or owner required to publish announcements.</div>';
          var file = $('announcement-file-input'); if (file) file.onchange = attachAnnouncementFile;
          var send = $('announcement-send'); if (send) send.onclick = async function(){ var title = ($('announcement-title').value || '').trim(); var body = ($('announcement-body').value || '').trim(); if (!title || !body) return; if (hasBadWord(title + ' ' + body)) { status('Blocked word found. Announcement will not publish.'); return; } try { await mongoFetch('/posts', { method: 'POST', body: JSON.stringify({ title: '[announcements] ' + title, body: body }) }); audit('announcement', title); if (/@everyone\b/i.test(body + ' ' + title)) pingEveryone(title); notifySaved('Announcement posted'); renderAnnouncementsPanel(); } catch(e) { status(e.message); } };
        }
      } catch(e) { list.innerHTML = '<div class="community-message community-locked">' + esc(e.message) + '</div>'; if (compose) compose.innerHTML = ''; }
      return;
    }
    initClient();
    if (firebaseMode) {
      try {
        var snap = await state.client.db.collection('posts').orderBy('created_at', 'desc').limit(60).get();
        var rows = snap.docs.map(firebaseRow).filter(function(row){ return normalizePostChannel(row.title) === 'announcements'; });
        await loadMembers(false);
        state.profileByUser = {}; (state.memberRows || []).forEach(function(p){ state.profileByUser[String(p.id)] = p; });
        rows.forEach(function(row){ row.profiles = state.profileByUser[String(row.user_id)] || { username: row.username, display_name: row.username, role: 'staff' }; });
        list.innerHTML = rows.map(function(row){ var p = row.profiles || {}; var del = canDeletePost(row) ? '<button class="community-btn secondary community-delete-announcement" data-post-id="' + esc(row.id) + '">Delete</button>' : ''; return '<article class="announcement-card"><h3>' + esc(stripPostChannel(row.title || 'Announcement')) + '</h3><div class="announcement-meta">' + esc(p.display_name || p.username || 'Staff') + ' / ' + esc(p.role || 'staff') + ' / ' + esc(when(row.created_at)) + '</div><div class="announcement-body">' + renderRichBody(row.body || '') + '</div><div class="community-actions"><button class="community-btn secondary community-copy-announcement" data-post-id="' + esc(row.id) + '">Copy</button>' + del + '</div></article>'; }).join('') || '<div class="community-message">No announcements yet.</div>';
        Array.prototype.forEach.call(document.querySelectorAll('.community-copy-announcement'), function(btn){ btn.onclick = function(){ var row = rows.filter(function(r){ return String(r.id) === String(btn.dataset.postId); })[0]; if (!row) return; navigator.clipboard.writeText(stripPostChannel(row.title || '') + '\n\n' + (row.body || '')); notifySaved('Announcement copied'); }; }); wireAnnouncementActions(rows);
        if (compose) {
          var ok = state.user && isStaff();
          compose.innerHTML = ok ? '<input id="announcement-title" maxlength="120" placeholder="Announcement title"><textarea id="announcement-body" maxlength="7000" placeholder="Announcement text, links, files, or @everyone. Type @eve then Tab."></textarea><details class="announcement-file-drop"><summary>Files</summary><label class="community-file-label">Browse file<input id="announcement-file-input" type="file"></label></details><button class="community-btn" id="announcement-send" type="button">Publish announcement</button>' : '<div class="community-message community-locked">Mod, admin, or owner required to publish announcements.</div>';
          var f = $('announcement-file-input'); if (f) f.onchange = attachAnnouncementFile;
          var s = $('announcement-send'); if (s) s.onclick = async function(){ var title = ($('announcement-title').value || '').trim(); var body = ($('announcement-body').value || '').trim(); if (!title || !body) return; if (hasBadWord(title + ' ' + body)) { status('Blocked word found. Announcement will not publish.'); return; } try { await state.client.db.collection('posts').add({ user_id: state.user.id, username: profileUsername(), title: '[announcements] ' + title, body: body, created_at: new Date().toISOString() }); audit('announcement', title); if (/@everyone\b/i.test(body + ' ' + title)) pingEveryone(title); notifySaved('Announcement posted'); renderAnnouncementsPanel(); } catch(e) { status(e.message); } };
        }
      } catch(e) { list.innerHTML = '<div class="community-message community-locked">' + esc(e.message) + '</div>'; if (compose) compose.innerHTML = ''; }
      return;
    }
    var res = await state.client.from('posts').select('*, profiles(' + profileFields() + ', email)').order('created_at', { ascending: false }).limit(60);
    if (res.error && handleProfileError(res.error)) res = await state.client.from('posts').select('*, profiles(' + profileFields() + ', email)').order('created_at', { ascending: false }).limit(60);
    if (res.error) { list.innerHTML = '<div class="community-message community-locked">' + esc(res.error.message) + '</div>'; return; }
    var rows = (res.data || []).filter(function(row){ return normalizePostChannel(row.title) === 'announcements'; });
    list.innerHTML = rows.map(function(row){ var p = row.profiles || {}; var del = canDeletePost(row) ? '<button class="community-btn secondary community-delete-announcement" data-post-id="' + esc(row.id) + '">Delete</button>' : ''; return '<article class="announcement-card"><h3>' + esc(stripPostChannel(row.title || 'Announcement')) + '</h3><div class="announcement-meta">' + esc(p.display_name || p.username || 'Staff') + ' / ' + esc(p.role || 'staff') + ' / ' + esc(when(row.created_at)) + '</div><div class="announcement-body">' + renderRichBody(row.body || '') + '</div><div class="community-actions"><button class="community-btn secondary community-copy-announcement" data-post-id="' + esc(row.id) + '">Copy</button>' + del + '</div></article>'; }).join('') || '<div class="community-message">No announcements yet.</div>';
    Array.prototype.forEach.call(document.querySelectorAll('.community-copy-announcement'), function(btn){ btn.onclick = function(){ var row = rows.filter(function(r){ return String(r.id) === String(btn.dataset.postId); })[0]; if (!row) return; navigator.clipboard.writeText(stripPostChannel(row.title || '') + '\n\n' + (row.body || '')); notifySaved('Announcement copied'); }; }); wireAnnouncementActions(rows);
    if (compose) {
      var ok = state.user && isStaff();
      compose.innerHTML = ok ? '<input id="announcement-title" maxlength="120" placeholder="Announcement title"><textarea id="announcement-body" maxlength="7000" placeholder="Announcement text, links, files, or @everyone. Type @eve then Tab."></textarea><details class="announcement-file-drop"><summary>Files</summary><label class="community-file-label">Browse file<input id="announcement-file-input" type="file"></label></details><button class="community-btn" id="announcement-send" type="button">Publish announcement</button>' : '<div class="community-message community-locked">Mod, admin, or owner required to publish announcements.</div>';
      var file = $('announcement-file-input'); if (file) file.onchange = attachAnnouncementFile;
      var send = $('announcement-send'); if (send) send.onclick = async function(){ var title = ($('announcement-title').value || '').trim(); var body = ($('announcement-body').value || '').trim(); if (!title || !body) return; if (hasBadWord(title + ' ' + body)) { status('Blocked word found. Announcement will not publish.'); return; } var r = await state.client.from('posts').insert({ user_id: state.user.id, title: '[announcements] ' + title, body: body }); if (r.error) { status(r.error.message); return; } audit('announcement', title); if (/@everyone\b/i.test(body + ' ' + title)) pingEveryone(title); notifySaved('Announcement posted'); renderAnnouncementsPanel(); };
    }
  }
  function normalizePostChannel(title) { var m = String(title || '').match(/^\[([^\]]+)\]\s*/); return m ? m[1].toLowerCase() : 'announcements'; }
  function wireAnnouncementActions(rows) { Array.prototype.forEach.call(document.querySelectorAll('.community-delete-announcement'), function(btn){ btn.onclick = async function(){ var row = rows.filter(function(r){ return String(r.id) === String(btn.dataset.postId); })[0]; if (!row || !canDeletePost(row) || !confirm('Delete this announcement?')) return; initClient(); try { if (firebaseMode) await state.client.db.collection('posts').doc(String(row.id)).delete(); else if (mongoMode) await mongoFetch('/posts/' + encodeURIComponent(row.id), { method: 'DELETE' }); else { var res = await state.client.from('posts').delete().eq('id', row.id); if (res.error) throw res.error; } audit('announcement-delete', row.id); notifySaved('Announcement deleted'); renderAnnouncementsPanel(); } catch(e) { status(e.message || 'Announcement delete failed.'); } }; }); }
  function attachAnnouncementFile(e) { var file = e && e.target && e.target.files ? e.target.files[0] : null; var body = $('announcement-body'); if (!file || !body) return; if (file.size > 250000) { status('File is too large for inline sharing. Upload it somewhere and paste a link.'); return; } var reader = new FileReader(); reader.onload = function(){ body.value += (body.value ? '\n\n' : '') + 'Attached file: ' + file.name + '\n' + String(reader.result || '').slice(0, 12000); status('File attached.'); }; reader.readAsDataURL(file); }
  function stripPostChannel(title) { return String(title || '').replace(/^\[[^\]]+\]\s*/, ''); }
  async function loadItems() {
    var list = $('community-list'); if (!list) return; renderChannelHeader();
    if (state.tab === 'voice') { renderVoiceRoom(); loadMembers(false); return; }
    if (!ready) { list.innerHTML = '<div class="community-message community-locked">Live database is not connected yet. Check community/config.js.</div>'; return; }
    if (firebaseMode) {
      try {
        initClient();
        if (state.tab === 'members') { await loadMembers(true); return; }
        var collection = state.tab === 'chat' ? 'messages' : 'posts';
        var snap = await state.client.db.collection(collection).orderBy('created_at', 'desc').limit(100).get();
        var rows = snap.docs.map(firebaseRow).reverse();
        if (state.tab === 'posts') rows = rows.filter(function(row){ return normalizePostChannel(row.title) === state.channelName; });
        await loadMembers(false);
        state.profileByUser = {}; (state.memberRows || []).forEach(function(p){ state.profileByUser[String(p.id)] = p; });
        rows.forEach(function(r){ r.profiles = state.profileByUser[String(r.user_id)] || { username: r.username, display_name: r.username, role: 'member' }; });
        list.innerHTML = rows.map(renderItem).join('') || '<div class="community-message">Nothing here yet.</div>';
        if (state.tab === 'chat') wireMessageActions(rows); else wirePostActions(rows);
        wireProfileLinks(); list.scrollTop = list.scrollHeight;
      } catch(e) { list.innerHTML = '<div class="community-message community-locked">' + esc(e.message) + '</div>'; }
      return;
    }
    if (mongoMode) {
      try {
        if (state.tab === 'members') { await loadMembers(true); return; }
        var data = await mongoFetch(state.tab === 'chat' ? '/messages' : '/posts');
        var rows = state.tab === 'chat' ? (data.messages || []).map(mongoMessage).reverse() : (data.posts || []).map(mongoPost).reverse();
        if (state.tab === 'posts') rows = rows.filter(function(row){ return normalizePostChannel(row.title) === state.channelName; });
        state.profileByUser = {}; (state.memberRows || []).forEach(function(p){ state.profileByUser[String(p.id)] = p; });
        list.innerHTML = rows.map(renderItem).join('') || '<div class="community-message">Nothing here yet.</div>';
        if (state.tab === 'chat') wireMessageActions(rows); else wirePostActions(rows);
        wireProfileLinks(); list.scrollTop = list.scrollHeight; loadMembers(false);
      } catch(e) { list.innerHTML = '<div class="community-message community-locked">' + esc(e.message) + '</div>'; }
      return;
    }
    initClient();
    if (state.tab === 'members') { await loadMembers(true); return; }
    var table = state.tab === 'chat' ? 'chat_messages' : 'posts';
    var res = await state.client.from(table).select('*, profiles(' + profileFields() + ', email)').order('created_at', { ascending: false }).limit(100);
    if (res.error && handleProfileError(res.error)) { res = await state.client.from(table).select('*, profiles(' + profileFields() + ', email)').order('created_at', { ascending: false }).limit(100); }
    if (res.error) { list.innerHTML = '<div class="community-message community-locked">' + esc(res.error.message) + '</div>'; return; }
    var rows = (res.data || []).slice().reverse();
    if (state.tab === 'posts') rows = rows.filter(function(row){ return normalizePostChannel(row.title) === state.channelName; });
    state.profileByUser = {}; rows.forEach(function(r){ if (r.profiles && r.user_id) state.profileByUser[String(r.user_id)] = r.profiles; });
    list.innerHTML = rows.map(renderItem).join('') || '<div class="community-message">Nothing here yet.</div>';
    if (state.tab === 'chat') wireMessageActions(rows); else wirePostActions(rows);
    wireProfileLinks(); list.scrollTop = list.scrollHeight; loadMembers(false);
  }
  function metaEmail(p) { if (!isOwner() || !p.email) return ''; return ' / ' + esc(p.email); }
  function renderItem(row) {
    var p = row.profiles || {}; var name = p.display_name || p.username || 'Member'; var r = p.role || 'member';
    if (state.tab === 'posts') { var actions = '<div class="community-actions"><button class="community-btn secondary community-copy-post" data-post-id="' + esc(row.id) + '">Copy</button>'; if (canEditPost(row)) actions += '<button class="community-btn secondary community-edit-post" data-post-id="' + esc(row.id) + '">Edit</button>'; if (canDeletePost(row)) actions += '<button class="community-btn secondary community-delete-post" data-post-id="' + esc(row.id) + '">Delete</button>'; actions += '</div>'; return '<article class="community-post" data-post-id="' + esc(row.id) + '"><div class="community-meta"><button class="community-user-link" data-user-id="' + esc(row.user_id) + '">' + esc(name) + '</button><span> / ' + esc(r) + metaEmail(p) + '</span><span>' + esc(when(row.created_at)) + '</span></div><h3>' + esc(stripPostChannel(row.title)) + '</h3><div class="community-body">' + renderRichBody(row.body) + '</div>' + actions + '</article>'; }
    if (row.deleted_at && !isStaff()) return '';
    var edited = row.updated_at && row.created_at && new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() > 1000 ? '<span class="community-edited">edited</span>' : '';
    var deleted = row.deleted_at ? '<span class="community-deleted-tag">deleted</span>' : '';
    var bodyClass = row.deleted_at ? 'community-body community-deleted-body' : 'community-body';
    var body = row.deleted_at ? 'Deleted message: ' + (row.deleted_body || row.body || '') : row.body;
    var chatActions = '<div class="community-actions">';
    if (canEditMessage(row)) chatActions += '<button class="community-btn secondary community-edit-message" data-message-id="' + esc(row.id) + '">Edit</button>';
    if (canDeleteMessage(row)) chatActions += '<button class="community-btn secondary community-delete-message" data-message-id="' + esc(row.id) + '">Delete</button>';
    chatActions += '</div>';
    return '<article class="community-message ' + (row.deleted_at ? 'is-deleted' : '') + '"><div class="community-meta"><button class="community-user-link" data-user-id="' + esc(row.user_id) + '">' + esc(name) + '</button><span> / ' + esc(r) + metaEmail(p) + ' ' + edited + deleted + '</span><span>' + esc(when(row.created_at)) + '</span></div><div class="' + bodyClass + '">' + esc(body) + '</div>' + chatActions + '</article>';
  }
  async function loadMembers(main) {
    if (!ready) return;
    if (firebaseMode) {
      try {
        initClient();
        var snap = await state.client.db.collection('profiles').limit(200).get();
        state.memberRows = snap.docs.map(function(doc){ return fromFirebaseProfile(doc.id, doc.data()); });
        var html = renderMembers(state.memberRows, main);
        if (main && $('community-list')) $('community-list').innerHTML = html || '<div class="community-message">No members yet.</div>';
        var side = $('community-side-members'); if (side) side.innerHTML = renderMembers(state.memberRows, false);
        wireMemberActions(); wireProfileLinks();
      } catch(e) { if (main && $('community-list')) $('community-list').innerHTML = '<div class="community-message community-locked">' + esc(e.message) + '</div>'; }
      return;
    }
    if (mongoMode) {
      try {
        var data = await mongoFetch('/members');
        state.memberRows = (data.members || []).map(fromMongoUser);
        var html = renderMembers(state.memberRows, main);
        if (main && $('community-list')) $('community-list').innerHTML = html || '<div class="community-message">No members yet.</div>';
        var side = $('community-side-members'); if (side) side.innerHTML = renderMembers(state.memberRows, false);
        wireMemberActions(); wireProfileLinks();
      } catch(e) { if (main && $('community-list')) $('community-list').innerHTML = '<div class="community-message community-locked">' + esc(e.message) + '</div>'; }
      return;
    }
    initClient();
    var res = await state.client.from('profiles').select(profileFields()).order('role', { ascending: false }).limit(200);
    if (res.error && handleProfileError(res.error)) { res = await state.client.from('profiles').select(profileFields()).order('role', { ascending: false }).limit(200); }
    if (res.error) { if (main && $('community-list')) $('community-list').innerHTML = '<div class="community-message community-locked">' + esc(res.error.message) + '</div>'; return; }
    state.memberRows = (res.data || []);
    var html = renderMembers(state.memberRows, main);
    if (main && $('community-list')) $('community-list').innerHTML = html || '<div class="community-message">No members yet.</div>';
    var side = $('community-side-members'); if (side) side.innerHTML = renderMembers(state.memberRows, false);
    wireMemberActions(); wireProfileLinks();
  }
  function renderMembers(rows, full) {
    var order = { owner: 0, admin: 1, mod: 2, member: 3, banned: 4 };
    rows = (rows || []).slice().sort(function(a,b){ return (order[a.role] || 9) - (order[b.role] || 9) || String(a.username || '').localeCompare(String(b.username || '')); });
    var groups = ['owner','admin','mod','member','banned'];
    return groups.map(function(g){ var members = rows.filter(function(r){ return (r.role || 'member') === g; }); if (!members.length) return ''; return '<section class="community-member-group"><h3>' + esc(g.toUpperCase()) + ' - ' + members.length + '</h3>' + members.map(function(m){ var canChangeRole = full && isRealOwner() && (!state.user || String(m.id) !== String(state.user.id)); var online = isOnline(m); var statusText = online ? 'Online' : 'Offline'; var roleControl = canChangeRole ? '<select class="community-role-select" data-user-id="' + esc(m.id) + '" data-username="' + esc(m.username || '') + '"><option' + (m.role === 'owner' ? ' selected' : '') + '>owner</option><option' + (m.role === 'admin' ? ' selected' : '') + '>admin</option><option' + (m.role === 'mod' ? ' selected' : '') + '>mod</option><option' + ((m.role || 'member') === 'member' ? ' selected' : '') + '>member</option><option' + (m.role === 'banned' ? ' selected' : '') + '>banned</option></select>' : '<em>' + esc(m.role || 'member') + '</em>'; return '<article class="community-member-row ' + (online ? 'is-online' : 'is-offline') + (g === 'banned' ? ' is-banned-member' : '') + '"><span class="community-member-dot" title="' + esc(statusText) + '"></span><button class="community-user-link community-member-name" data-user-id="' + esc(m.id) + '"><b>' + esc(m.display_name || m.username || 'member') + '</b><small>@' + esc(m.username || 'unknown') + ' - ' + statusText + '</small></button>' + roleControl + '</article>'; }).join('') + '</section>'; }).join('');
  }
  function wireProfileLinks() { Array.prototype.forEach.call(document.querySelectorAll('.community-user-link'), function(btn){ btn.onclick = function(){ showCommunityProfile(btn.dataset.userId); }; }); }
  function wireMemberActions() { Array.prototype.forEach.call(document.querySelectorAll('.community-role-select'), function(sel){ sel.onchange = async function(){ await changeUserRole(sel.dataset.username, sel.value); }; }); }
  async function firebaseFindUser(username) { initClient(); var snap = await state.client.db.collection('profiles').where('username', '==', String(username || '').toLowerCase()).limit(1).get(); if (snap.empty) return null; var doc = snap.docs[0]; return { id: doc.id, data: fromFirebaseProfile(doc.id, doc.data()), ref: state.client.db.collection('profiles').doc(doc.id) }; }
  async function changeUserRole(username, newRole) { if (!isRealOwner()) { status('A real owner account is required to change roles.'); return; } if (!username) return; if (state.profile && username.toLowerCase() === String(state.profile.username || '').toLowerCase()) { status('You cannot change your own role here.'); loadMembers(state.tab === 'members'); return; } if (firebaseMode) { try { var target = await firebaseFindUser(username); if (!target) { status('Target not found.'); return; } if (target.data.role === 'owner') { status('Owners cannot change other owners.'); return; } var set = { role: newRole }; if (newRole === 'banned') set.banned_until = '2099-01-01T00:00:00.000Z'; else set.banned_until = null; await target.ref.set(set, { merge: true }); notifySaved('Role updated'); await loadMembers(state.tab === 'members'); } catch(e) { status(e.message); } return; } if (mongoMode) { try { await mongoFetch('/staff/role', { method: 'POST', body: JSON.stringify({ username: username, role: newRole }) }); notifySaved('Role updated'); await loadMembers(state.tab === 'members'); } catch(e) { status(e.message); } return; } initClient(); var res = await state.client.rpc('set_user_role', { target_username: username, new_role: newRole }); if (res.error) { status(res.error.message); return; } notifySaved('Role updated'); await loadMembers(state.tab === 'members'); }
  function findProfile(userId) { return (state.memberRows || []).filter(function(m){ return String(m.id) === String(userId); })[0] || state.profileByUser[String(userId)] || {}; }
  function profileStatusHtml(p) {
    var banned = isBanned(p) || p.role === 'banned';
    var kicked = isKicked(p);
    var muted = isMuted(p);
    var label = banned ? 'BANNED' : (kicked ? 'KICKED' : (muted ? 'MUTED' : (isOnline(p) ? 'ONLINE' : 'OFFLINE')));
    var cls = banned ? 'is-banned' : (kicked ? 'is-kicked' : (muted ? 'is-muted' : (isOnline(p) ? 'is-online' : 'is-offline')));
    return '<p class="community-profile-status ' + cls + '">Status: <b>' + esc(label) + '</b></p>';
  }
  function profileRoleControl(p) {
    if (!isRealOwner() || !p.username || (state.user && String(p.id) === String(state.user.id))) return '<p>Role: <b>' + esc(p.role || 'member') + '</b></p>';
    var roles = ['owner','admin','mod','member','banned'];
    return '<label class="community-profile-role-label">Role<select id="community-profile-role">' + roles.map(function(r){ return '<option value="' + r + '"' + ((p.role || 'member') === r ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></label>';
  }
  function profileCommandButtons(p) {
    if (!p.username || !isStaff()) return '';
    var rr = role();
    var buttons = ['<button class="community-btn secondary community-profile-command" data-profile-cmd="warn">Warn</button>'];
    if (['owner','admin','mod'].indexOf(rr) !== -1) buttons.push('<button class="community-btn secondary community-profile-command" data-profile-cmd="mute">Mute</button><button class="community-btn secondary community-profile-command" data-profile-cmd="unmute">Unmute</button>');
    if (['owner','admin'].indexOf(rr) !== -1) buttons.push('<button class="community-btn secondary community-profile-command" data-profile-cmd="kick">Kick</button>');
    if (rr === 'owner') buttons.push('<button class="community-btn danger community-profile-command" data-profile-cmd="ban">Ban</button><button class="community-btn secondary community-profile-command" data-profile-cmd="unban">Unban</button><button class="community-btn danger community-profile-command" data-profile-cmd="deleteuser">Delete account</button>');
    return '<div class="community-profile-actions"><h3>Run command</h3><div class="community-profile-command-grid">' + buttons.join('') + '</div></div>';
  }
  function showCommunityProfile(userId) {
    var p = findProfile(userId); var existing = document.getElementById('community-profile-pop'); if (existing) existing.remove();
    var modal = document.createElement('div'); modal.id = 'community-profile-pop'; modal.className = 'community-profile-pop';
    var ban = p.banned_until && new Date(p.banned_until) > new Date() ? '<p>Banned until: <b>' + esc(when(p.banned_until)) + '</b></p>' : '';
    var kick = p.kicked_until && new Date(p.kicked_until) > new Date() ? '<p>Kicked until: <b>' + esc(when(p.kicked_until)) + '</b></p>' : '';
    var mute = p.muted_until && new Date(p.muted_until) > new Date() ? '<p>Muted until: <b>' + esc(when(p.muted_until)) + '</b></p>' : '';
    modal.innerHTML = '<div class="community-profile-card"><button class="uz-profile-modal-close" id="community-profile-close">Close</button><h2>' + esc(p.display_name || p.username || 'Member') + '</h2><p>Username: <b>' + esc(p.username || 'unknown') + '</b></p>' + profileRoleControl(p) + profileStatusHtml(p) + '<p>Warnings: <b>' + esc(p.warnings || 0) + '</b></p>' + ban + kick + mute + (isStaff() ? '<p>Staff note: ' + esc(p.staff_note || 'None') + '</p>' : '') + profileCommandButtons(p) + '</div>';
    document.body.appendChild(modal); document.getElementById('community-profile-close').onclick = function(){ modal.remove(); };
    var roleSel = document.getElementById('community-profile-role'); if (roleSel) roleSel.onchange = async function(){ await changeUserRole(p.username, roleSel.value); modal.remove(); };
    Array.prototype.forEach.call(modal.querySelectorAll('.community-profile-command'), function(btn){ btn.onclick = async function(){ var result = await runProfileCommand(p.username, btn.dataset.profileCmd); status(result.message); if (result.ok) { modal.remove(); await loadMembers(state.tab === 'members'); await loadItems(); } }; });
    modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });
  }
  async function runProfileCommand(username, action) {
    if (!username) return { ok: false, message: 'No username on this profile.' };
    if (action === 'deleteuser') { var deleted = await deleteUserByUsername(username); return { ok: !!deleted, message: deleted ? 'Account deleted.' : 'Delete cancelled or failed.' }; }
    var reason = '';
    var minutes = '';
    if (action === 'mute' || action === 'kick') { minutes = prompt(action === 'kick' ? 'Kick length, like 10m, 1h, 1d, or perma' : 'Mute length, like 10m, 1h, 1d, or perma', '10m'); if (minutes == null) return { ok: false, message: 'Command cancelled.' }; }
    if (['warn','mute','kick','ban','unban','unmute'].indexOf(action) !== -1) { reason = prompt('Reason for /' + action + ' ' + username, action === 'unban' || action === 'unmute' ? 'appeal accepted' : 'profile action'); if (reason == null) return { ok: false, message: 'Command cancelled.' }; }
    var command = '/' + action + ' ' + username + (minutes ? ' ' + minutes : '') + (reason ? ' ' + reason : '');
    return runStaffCommandText(command);
  }
  async function deleteUserByUsername(username) { if (!isRealOwner()) { status('A real owner account is required to delete accounts.'); return false; } var typed = prompt('Type the exact username to delete: ' + username); if (typed !== username) { status('Delete cancelled. Username did not match.'); return false; } if (firebaseMode) { try { var target = await firebaseFindUser(username); if (!target) { status('Target not found.'); return false; } if (target.data.role === 'owner') { status('Owners cannot delete other owners.'); return false; } await target.ref.set({ role: 'deleted', banned_until: null, deleted_at: new Date().toISOString() }, { merge: true }); notifySaved('Account disabled'); loadMembers(state.tab === 'members'); loadItems(); return true; } catch(e) { status(e.message); return false; } } if (mongoMode) { try { await mongoFetch('/staff/delete-user', { method: 'POST', body: JSON.stringify({ username: username }) }); notifySaved('Account deleted'); loadMembers(state.tab === 'members'); loadItems(); return true; } catch(e) { status(e.message); return false; } } initClient(); var res = await state.client.rpc('delete_user_by_username', { target_username: username }); if (res.error) { status(res.error.message); return false; } notifySaved('Account deleted'); loadMembers(state.tab === 'members'); loadItems(); return true; }
  function postById(rows, id) { return rows.filter(function(r){ return String(r.id) === String(id); })[0]; }
  function wirePostActions(rows) { Array.prototype.forEach.call(document.querySelectorAll('.community-copy-post'), function(btn){ btn.onclick = function(){ var row = postById(rows, btn.dataset.postId); if (!row) return; navigator.clipboard.writeText(stripPostChannel(row.title || '') + '\n\n' + (row.body || '')).then(function(){ notifySaved('Post copied'); }).catch(function(){ status('Could not copy post.'); }); }; }); Array.prototype.forEach.call(document.querySelectorAll('.community-edit-post'), function(btn){ btn.onclick = async function(){ var row = postById(rows, btn.dataset.postId); if (!row || !canEditPost(row)) return; var title = prompt('Post title', stripPostChannel(row.title || '')); if (title == null) return; var body = prompt('Post body', row.body || ''); if (body == null) return; initClient(); if (firebaseMode) { try { await state.client.db.collection('posts').doc(String(row.id)).set({ title: '[' + state.channelName + '] ' + title.trim(), body: body.trim(), updated_at: new Date().toISOString() }, { merge: true }); audit('post-edit', row.id); notifySaved('Post updated'); loadItems(); } catch(e) { status(e.message); } return; } var res = await state.client.from('posts').update({ title: '[' + state.channelName + '] ' + title.trim(), body: body.trim(), updated_at: new Date().toISOString() }).eq('id', row.id); if (res.error) status(res.error.message); else { notifySaved('Post updated'); loadItems(); } }; }); Array.prototype.forEach.call(document.querySelectorAll('.community-delete-post'), function(btn){ btn.onclick = async function(){ var row = postById(rows, btn.dataset.postId); if (!row || !canDeletePost(row)) return; if (!confirm('Delete this post?')) return; initClient(); if (firebaseMode) { try { await state.client.db.collection('posts').doc(String(row.id)).delete(); audit('post-delete', row.id); notifySaved('Post deleted'); loadItems(); } catch(e) { status(e.message); } return; } var res = await state.client.from('posts').delete().eq('id', row.id); if (res.error) status(res.error.message); else { notifySaved('Post deleted'); loadItems(); } }; }); }
  function messageById(rows, id) { return rows.filter(function(r){ return String(r.id) === String(id); })[0]; }
  function wireMessageActions(rows) {
    Array.prototype.forEach.call(document.querySelectorAll('.community-edit-message'), function(btn){ btn.onclick = async function(){ var row = messageById(rows, btn.dataset.messageId); if (!row || !canEditMessage(row)) return; var body = prompt('Edit message', row.body || ''); if (body == null) return; body = body.trim(); if (!body) return; if (hasBadWord(body)) { status('Blocked word found. This edit will not save.'); return; } if (firebaseMode) { try { await state.client.db.collection('messages').doc(String(row.id)).set({ body: body, updated_at: new Date().toISOString() }, { merge: true }); audit('message-edit', row.id); notifySaved('Message edited'); loadItems(); } catch(e) { status(e.message); } return; } if (mongoMode) { try { await mongoFetch('/messages/' + encodeURIComponent(row.id), { method: 'PATCH', body: JSON.stringify({ body: body }) }); audit('message-edit', row.id); notifySaved('Message edited'); loadItems(); } catch(e) { status(e.message); } return; } initClient(); var res = await state.client.from('chat_messages').update({ body: body, updated_at: new Date().toISOString() }).eq('id', row.id); if (res.error) status(res.error.message); else { audit('message-edit', row.id); notifySaved('Message edited'); loadItems(); } }; });
    Array.prototype.forEach.call(document.querySelectorAll('.community-delete-message'), function(btn){ btn.onclick = async function(){ var row = messageById(rows, btn.dataset.messageId); if (!row || !canDeleteMessage(row)) return; if (!confirm('Delete this message? Staff will still see it in red.')) return; if (firebaseMode) { try { await state.client.db.collection('messages').doc(String(row.id)).set({ deleted_at: new Date().toISOString(), deleted_body: row.deleted_body || row.body, body: '[deleted]' }, { merge: true }); audit('message-delete', row.id); notifySaved('Message deleted'); loadItems(); } catch(e) { status(e.message); } return; } if (mongoMode) { try { await mongoFetch('/messages/' + encodeURIComponent(row.id), { method: 'DELETE' }); audit('message-delete', row.id); notifySaved('Message deleted'); loadItems(); } catch(e) { status(e.message); } return; } initClient(); var res = await state.client.from('chat_messages').update({ deleted_at: new Date().toISOString(), deleted_body: row.deleted_body || row.body, body: '[deleted]' }).eq('id', row.id); if (res.error) status(res.error.message); else { audit('message-delete', row.id); notifySaved('Message deleted'); loadItems(); } }; });
  }
  function parseDurationToken(v, fallback) { v = String(v || '').toLowerCase(); if (v === 'perm' || v === 'perma' || v === 'forever') return 52560000; var m = v.match(/^(\d+)(m|h|d)?$/); if (!m) return fallback; var n = parseInt(m[1], 10); return m[2] === 'h' ? n * 60 : (m[2] === 'd' ? n * 1440 : n); }
  function parseStaffCommand(text) { var parts = String(text || '').trim().split(/\s+/); var cmd = (parts.shift() || '').replace(/^\//, '').toLowerCase(); if (!cmd) return null; if (cmd === 'role') return { local: 'Current role: ' + role() }; if (cmd === 'setrole') return { action: 'setrole', target: (parts.shift() || '').toLowerCase(), newRole: (parts.shift() || '').toLowerCase(), reason: parts.join(' ') }; if (cmd === 'deleteuser') return { action: 'deleteuser', target: (parts.shift() || '').toLowerCase(), reason: parts.join(' ') }; if (cmd === 'mute' || cmd === 'kick') { var target = (parts.shift() || '').toLowerCase(); var minutes = parseDurationToken(parts[0], cmd === 'kick' ? 10 : 10); if (/^(\d+)(m|h|d)?$|^perm|^perma|^forever/i.test(parts[0] || '')) parts.shift(); return { action: cmd, target: target, minutes: minutes, reason: parts.join(' ') }; } if (['warn','ban','unban','unmute'].indexOf(cmd) !== -1) return { action: cmd, target: (parts.shift() || '').toLowerCase(), minutes: null, reason: parts.join(' ') }; return { error: 'Unknown command.' }; }
  async function runStaffCommandText(text) { var parsed = parseStaffCommand(text); if (!parsed) return { ok: false, message: 'Type a command first.' }; if (parsed.local) return { ok: true, message: parsed.local }; if (parsed.error) return { ok: false, message: parsed.error }; if (isTempOwner()) return { ok: false, message: 'Temporary owner can view the terminal, but live commands need a real staff account.' }; if (!state.user || !isStaff()) return { ok: false, message: 'Staff account required.' }; if (!parsed.target) return { ok: false, message: 'Add a target username.' }; var rr = role(); if (['ban','unban','setrole','deleteuser'].indexOf(parsed.action) !== -1 && rr !== 'owner') return { ok: false, message: 'Owner role required for /' + parsed.action + '.' }; if (parsed.action === 'kick' && ['owner','admin'].indexOf(rr) === -1) return { ok: false, message: 'Admin or owner required for /kick.' }; if (['warn','mute','unmute'].indexOf(parsed.action) !== -1 && ['owner','admin','mod'].indexOf(rr) === -1) return { ok: false, message: 'Staff role required.' }; if (firebaseMode) { try { var target = await firebaseFindUser(parsed.target); if (!target) return { ok: false, message: 'Target not found.' }; if (target.data.role === 'owner' && target.data.username !== profileUsername()) return { ok: false, message: 'Owners cannot moderate other owners.' }; var set = {}; if (parsed.action === 'setrole') { if (!parsed.newRole) return { ok: false, message: 'Add a role: owner, admin, mod, member, or banned.' }; set.role = parsed.newRole; set.banned_until = parsed.newRole === 'banned' ? '2099-01-01T00:00:00.000Z' : null; if (parsed.newRole !== 'deleted') set.deleted_at = null; } else if (parsed.action === 'deleteuser') { set.role = 'deleted'; set.banned_until = null; set.deleted_at = new Date().toISOString(); } else if (parsed.action === 'ban') { set.role = 'banned'; set.banned_until = '2099-01-01T00:00:00.000Z'; set.deleted_at = null; } else if (parsed.action === 'unban') { set.role = 'member'; set.banned_until = null; set.deleted_at = null; } else if (parsed.action === 'warn') { set.warnings = (Number(target.data.warnings || 0) + 1); } else if (parsed.action === 'mute') { set.muted_until = new Date(Date.now() + (parsed.minutes || 10) * 60000).toISOString(); } else if (parsed.action === 'unmute') { set.muted_until = null; } else if (parsed.action === 'kick') { set.kicked_until = new Date(Date.now() + (parsed.minutes || 10) * 60000).toISOString(); } await target.ref.set(set, { merge: true }); if (parsed.action === 'unban') clearDeviceBan(parsed.target); audit('command', '/' + parsed.action + ' ' + parsed.target); notifySaved('Command ran'); loadMembers(true); loadItems(); return { ok: true, message: 'Command ran: /' + parsed.action + ' ' + parsed.target }; } catch(e) { return { ok: false, message: e.message }; } } if (mongoMode) { try { if (parsed.action === 'setrole') { if (!parsed.newRole) return { ok: false, message: 'Add a role: owner, admin, mod, member, or banned.' }; await mongoFetch('/staff/role', { method: 'POST', body: JSON.stringify({ username: parsed.target, role: parsed.newRole }) }); } else if (parsed.action === 'deleteuser') { await mongoFetch('/staff/delete-user', { method: 'POST', body: JSON.stringify({ username: parsed.target }) }); } else { await mongoFetch('/staff/moderate', { method: 'POST', body: JSON.stringify({ username: parsed.target, action: parsed.action, reason: parsed.reason || '', minutes: parsed.minutes || null }) }); } if (parsed.action === 'unban') { try { localStorage.removeItem('uzBannedAccount:' + String(parsed.target || '').toLowerCase()); } catch(e) {} } audit('command', '/' + parsed.action + ' ' + parsed.target); notifySaved('Command ran'); loadMembers(true); loadItems(); return { ok: true, message: 'Command ran: /' + parsed.action + ' ' + parsed.target }; } catch(e) { return { ok: false, message: e.message }; } } initClient(); var res; if (parsed.action === 'setrole') { if (!parsed.newRole) return { ok: false, message: 'Add a role: owner, admin, mod, member, or banned.' }; res = await state.client.rpc('set_user_role', { target_username: parsed.target, new_role: parsed.newRole }); } else if (parsed.action === 'deleteuser') { res = await state.client.rpc('delete_user_by_username', { target_username: parsed.target }); } else { res = await state.client.rpc('moderate_user', { target_username: parsed.target, action_name: parsed.action, reason_text: parsed.reason || '', duration_minutes: parsed.minutes || null }); } if (res.error) return { ok: false, message: res.error.message }; if (parsed.action === 'unban') { try { localStorage.removeItem('uzBannedAccount:' + String(parsed.target || '').toLowerCase()); } catch(e) {} } audit('command', '/' + parsed.action + ' ' + parsed.target); notifySaved('Command ran'); loadMembers(true); loadItems(); return { ok: true, message: 'Command ran: /' + parsed.action + ' ' + parsed.target }; }
  function warnBlockedInput(el, msg) { status(msg || 'Blocked word found. This will not send.'); if (el) { el.classList.remove('community-input-warn'); void el.offsetWidth; el.classList.add('community-input-warn'); el.focus(); } }
  async function sendMessage() { if (!state.user) { status('Sign in first.'); return; } var input = $('community-chat-input'); if (!input) { status('Chat box is not ready.'); return; } var body = input.value.trim(); if (!body) return; if (hasBadWord(body)) { warnBlockedInput(input, 'Blocked word found. This message will not send.'); return; } if (firebaseMode) { try { await state.client.db.collection('messages').add({ user_id: state.user.id, username: profileUsername(), body: body, created_at: new Date().toISOString() }); input.value = ''; audit('message', body.slice(0,80)); notifySaved('Message sent'); loadItems(); } catch(e) { status(e.message); } return; } if (mongoMode) { try { await mongoFetch('/messages', { method: 'POST', body: JSON.stringify({ body: body }) }); input.value = ''; audit('message', body.slice(0,80)); notifySaved('Message sent'); loadItems(); } catch(e) { status(e.message); } return; } initClient(); var res = await state.client.from('chat_messages').insert({ user_id: state.user.id, body: body }); if (res.error) { status(res.error.message); return; } input.value = ''; audit('message', body.slice(0,80)); notifySaved('Message sent'); loadItems(); }
  async function sendPostMessage() { if (!canPost()) { status('You cannot post in this channel.'); return; } if (!state.user) { status('Sign into a real account before publishing.'); return; } var titleEl = $('community-post-title'); var bodyEl = $('community-post-body'); var title = titleEl ? titleEl.value.trim() : ''; var body = bodyEl ? bodyEl.value.trim() : ''; if (!title || !body) return; if (hasBadWord(title + ' ' + body)) { warnBlockedInput(bodyEl || titleEl, 'Blocked word found. This post will not publish.'); return; } if (firebaseMode) { try { await state.client.db.collection('posts').add({ user_id: state.user.id, username: profileUsername(), title: '[' + state.channelName + '] ' + title, body: body, created_at: new Date().toISOString() }); if (titleEl) titleEl.value = ''; if (bodyEl) bodyEl.value = ''; audit('post', title); if (state.channelName === 'announcements' && /@everyone\b/i.test(title + ' ' + body)) pingEveryone(title); notifySaved('Posted'); loadItems(); } catch(e) { status(e.message); } return; } if (mongoMode) { try { await mongoFetch('/posts', { method: 'POST', body: JSON.stringify({ title: '[' + state.channelName + '] ' + title, body: body }) }); if (titleEl) titleEl.value = ''; if (bodyEl) bodyEl.value = ''; audit('post', title); notifySaved('Posted'); loadItems(); } catch(e) { status(e.message); } return; } initClient(); var res = await state.client.from('posts').insert({ user_id: state.user.id, title: '[' + state.channelName + '] ' + title, body: body }); if (res.error) { status(res.error.message); return; } if (titleEl) titleEl.value = ''; if (bodyEl) bodyEl.value = ''; audit('post', title); if (state.channelName === 'announcements' && /@everyone\b/i.test(title + ' ' + body)) pingEveryone(title); notifySaved('Posted'); loadItems(); }
  function subscribe() { if (!ready || !state.client) return; if (typeof state.realtime === 'function') { state.realtime(); state.realtime = null; } else if (state.realtime && state.client.removeChannel) state.client.removeChannel(state.realtime); if (state.tab === 'voice') return; if (firebaseMode) { var collection = state.tab === 'members' ? 'profiles' : (state.tab === 'chat' ? 'messages' : 'posts'); state.realtime = state.client.db.collection(collection).onSnapshot(function(){ loadItems(); }); return; } if (state.tab === 'members') return; var table = state.tab === 'chat' ? 'chat_messages' : 'posts'; state.realtime = state.client.channel('uz-' + table).on('postgres_changes', { event: '*', schema: 'public', table: table }, loadItems).subscribe(); }
  window.UZCommunity = { saveProfile: saveProfile, logout: logout, refresh: refreshSession, role: role, isStaff: isStaff, runCommand: runStaffCommandText, renderAnnouncements: renderAnnouncementsPanel, openTerminal: function(){ if (window.openUZCommandPalette) window.openUZCommandPalette(); } };
  window.UZ_ACCOUNT_DEBUG.push('community-js-ready');
  window.initCommunity = function () { ensureCommunityTools(); Array.prototype.forEach.call(document.querySelectorAll('.community-tab'), function(btn){ btn.onclick = function(){ setTab(btn.dataset.communityTab, btn.dataset.communityChannel); }; }); renderChannelHeader(); refreshSession(); setTab('chat', 'chat'); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.initCommunity); else window.initCommunity();
}());

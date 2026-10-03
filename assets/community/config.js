window.UZ_COMMUNITY_CONFIG = {
  // Paste these from Supabase > Project Settings > API.
  supabaseUrl: '',
  supabaseAnonKey: '',

  // Only users whose profiles.role is in this list can create posts.
  postRoles: ['owner', 'admin', 'mod'],

  // Anyone signed in can chat. Change this later if you want role-only chat.
  chatRoles: ['owner', 'admin', 'mod', 'member']
};
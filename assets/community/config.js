window.UZ_COMMUNITY_CONFIG = {
  // Paste these from Supabase > Project Settings > API.
  supabaseUrl: 'https://bvgqpqsdyfgxweaqihvs.supabase.co/rest/v1/',
  supabaseAnonKey: 'sb_publishable_0uYYo1yZn5KzvlLGsAxMMw_DePYh78F',

  // Only users whose profiles.role is in this list can create posts.
  postRoles: ['owner', 'admin', 'mod'],

  // Anyone signed in can chat. Change this later if you want role-only chat.
  chatRoles: ['owner', 'admin', 'mod', 'member']
};
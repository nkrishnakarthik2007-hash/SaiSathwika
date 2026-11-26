import { createClient } from '@supabase/supabase-js';

// Supabase publishable keys are designed to be included in client applications.
// Keep environment overrides for local development, with the store's public
// project configuration as a safe fallback so Android builds cannot silently
// ship without their backend connection.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  || 'https://dydiigralixlftrannee.supabase.co';
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
  || 'sb_publishable_FewDRYBlpvfc_Ds8lV_4kw_Nfr4txkv';

export const isSupabaseConfigured = Boolean(url && key);
export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'pkce',
        detectSessionInUrl: true,
      },
    })
  : null;

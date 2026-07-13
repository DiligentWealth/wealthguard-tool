import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Doesn't throw — a missing key shouldn't crash the whole app with a blank page.
  // Any Supabase call will fail gracefully instead, and this message explains why.
  console.error(
    'Supabase env vars are missing. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY ' +
    'in your .env.local file (for local dev) and in Vercel → Settings → Environment Variables ' +
    '(for the deployed site), then redeploy.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

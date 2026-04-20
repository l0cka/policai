import 'server-only';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Server-only Supabase client for protected admin/cron writes.
 *
 * This client uses the service-role key, which bypasses RLS and must never be
 * imported from client components or exposed to the browser.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for Supabase admin writes');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const adminPassword = process.env.ADMIN_PASSWORD || '';

/**
 * Verify authentication for API routes.
 *
 * Authentication strategies (checked in order):
 * 1. Supabase session (if Supabase is configured)
 * 2. ADMIN_PASSWORD via X-Admin-Password header
 * 3. Fallback: allow access when no auth backend is configured (dev/local mode)
 *
 * Returns a user-like object if authenticated, or null if not.
 */
export async function verifyAuth(request: Request) {
  // Strategy 1: Supabase auth
  if (supabaseUrl && supabaseAnonKey) {
    const authHeader = request.headers.get('authorization');
    const cookieHeader = request.headers.get('cookie');

    if (authHeader || cookieHeader) {
      try {
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: authHeader || '',
              Cookie: cookieHeader || '',
            },
          },
        });

        const { data: { user }, error } = await supabase.auth.getUser();

        if (!error && user) {
          return user;
        }
      } catch (error) {
        console.error('Supabase auth verification error:', error);
      }
    }
  }

  // Strategy 2: ADMIN_PASSWORD header check
  if (adminPassword) {
    const passwordHeader = request.headers.get('x-admin-password');
    if (passwordHeader === adminPassword) {
      return { id: 'admin', email: 'admin@local' };
    }
    // Password is configured but not provided/wrong — deny access
    return null;
  }

  // Strategy 3: No auth backend configured — allow access in development only
  if (!supabaseUrl && !supabaseAnonKey && process.env.NODE_ENV === 'development') {
    console.warn('[auth] No auth backend configured — granting dev-mode access');
    return { id: 'local-admin', email: 'admin@localhost' };
  }

  return null;
}

/**
 * Returns an unauthorized response for API routes
 */
export function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Unauthorized - Admin authentication required', success: false },
    { status: 401 }
  );
}

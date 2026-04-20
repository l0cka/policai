/**
 * Vercel Cron endpoint — discovers and updates agency AI transparency statements.
 *
 * Triggered weekly on Mondays (see vercel.json). Uses Perplexity to search for
 * .gov.au agency transparency statements, then updates the agencies table.
 *
 * Protected by CRON_SECRET so only Vercel infrastructure can invoke it.
 */

import { NextResponse } from 'next/server';
import { runAgencyDiscoveryAgent } from '@/lib/agents/agency-discovery-agent';
import { getAgencies } from '@/lib/data-service';
import { isSupabaseAdminConfigured } from '@/lib/data-service';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron/agencies] CRON_SECRET is not configured');
    return NextResponse.json(
      { error: 'CRON_SECRET not configured', success: false },
      { status: 500 },
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY not configured', success: false },
      { status: 500 },
    );
  }

  console.log(`[cron/agencies] Starting agency discovery at ${new Date().toISOString()}`);

  try {
    // Get existing agency names for dedup
    const existingAgencies = await getAgencies(undefined, { access: 'admin' });
    const existingNames = existingAgencies.map((a) => a.name);

    // Run discovery
    const updates = await runAgencyDiscoveryAgent(existingNames);

    // Apply updates to Supabase
    let created = 0;
    let updated = 0;

    if (isSupabaseAdminConfigured && updates.length > 0) {
      const { createSupabaseAdminClient } = await import('@/lib/supabase-admin');
      const supabase = createSupabaseAdminClient();

      for (const update of updates) {
        // Try to find existing agency by name (case-insensitive)
        const { data: existing } = await supabase
          .from('agencies')
          .select('id')
          .ilike('name', update.name)
          .maybeSingle();

        if (existing) {
          // Update transparency fields
          const { error } = await supabase
            .from('agencies')
            .update({
              aiTransparencyStatement: update.aiTransparencyStatement,
              aiUsageDisclosure: update.aiUsageDisclosure,
              hasPublishedStatement: update.hasPublishedStatement,
              transparencyStatementUrl: update.transparencyStatementUrl,
              lastUpdated: update.lastUpdated,
            })
            .eq('id', existing.id);

          if (!error) updated++;
          else console.warn(`[cron/agencies] Failed to update ${update.name}:`, error.message);
        } else {
          // Insert new agency
          const { error } = await supabase
            .from('agencies')
            .insert(update);

          if (!error) created++;
          else console.warn(`[cron/agencies] Failed to insert ${update.name}:`, error.message);
        }
      }
    }

    console.log(`[cron/agencies] Complete. Discovered: ${updates.length}, Created: ${created}, Updated: ${updated}`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      discovered: updates.length,
      created,
      updated,
    });
  } catch (error) {
    console.error('[cron/agencies] Failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Agency discovery failed',
      },
      { status: 500 },
    );
  }
}

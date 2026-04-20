# Supabase RLS Setup

This document records the RLS model for Policai's Supabase-backed deployment.

## Audit Summary

Policai stores public catalog data and operational admin data in the `public` schema:

| Table | Data classification | Public Data API access |
| --- | --- | --- |
| `policies` | Published public catalog data, with `trashed` rows treated as non-public | `SELECT` for `anon` and `authenticated` only when `status in ('proposed', 'active', 'amended', 'repealed')` |
| `news_items` | Published public catalog data | `SELECT` for `anon` and `authenticated` |
| `timeline_events` | Published public catalog data | `SELECT` for `anon` and `authenticated` |
| `agencies` | Public-facing agency fields plus possible sensitive/admin fields such as contacts, accountable officials, and audit notes | No direct `anon` or `authenticated` table access; public API responses are served by Next.js and strip sensitive agency fields |
| `scraper_runs` | Operational logs | No direct `anon` or `authenticated` table access |
| `pipeline_runs` | Admin workflow state | No direct `anon` or `authenticated` table access |
| `research_findings` | AI-discovered source content and review state | No direct `anon` or `authenticated` table access |
| `verification_results` | AI verification notes and factual issues | No direct `anon` or `authenticated` table access |

The public app reads policy data through `/api/policies` and can also read published rows directly through the Supabase Data API with the anon key. Admin and cron writes go through authenticated Next.js routes and use a server-only service-role client.

## Environment

Production Supabase deployments need:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY` must be configured only in server environments, such as Vercel project environment variables. Do not add it to browser code and do not prefix it with `NEXT_PUBLIC_`.

## SQL to Run

Run the migration in `supabase/migrations/002_enable_rls.sql` in the Supabase SQL editor or with the Supabase CLI:

```bash
supabase db push
```

If you are not using the Supabase CLI, paste the contents of:

```text
supabase/migrations/002_enable_rls.sql
```

into the Supabase SQL editor and run it once. The migration is idempotent: it skips missing optional tables, enables RLS, removes existing policies on the known tables, reapplies the intended policies, and revokes direct `anon`/`authenticated` table privileges before granting back only the public `SELECT` permissions.

## Expected Access After Migration

Use the anon key:

```sql
select * from public.policies;
```

returns only rows whose status is `proposed`, `active`, `amended`, or `repealed`.

Use the anon key:

```sql
select * from public.policies where status = 'trashed';
select * from public.agencies;
select * from public.scraper_runs;
select * from public.pipeline_runs;
select * from public.research_findings;
select * from public.verification_results;
```

returns no data or a permission error.

Admin and cron routes continue to write through the server-only service-role client after `SUPABASE_SERVICE_ROLE_KEY` is configured.

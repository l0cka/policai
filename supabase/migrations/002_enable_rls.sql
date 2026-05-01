-- Enable least-privilege RLS for Policai public-schema tables.
--
-- Public Data API access is intentionally narrow:
-- - anon/authenticated can read only published policy rows.
-- - anon/authenticated can read published news and timeline rows when those
--   tables exist.
-- - agencies, scraper logs, and AI pipeline tables are server-only because
--   they can contain operational notes, source content, or sensitive fields.
--
-- Server-side admin and cron paths should use SUPABASE_SERVICE_ROLE_KEY.

do $$
declare
  table_name text;
  policy_record record;
begin
  foreach table_name in array array[
    'policies',
    'agencies',
    'news_items',
    'timeline_events',
    'scraper_runs',
    'pipeline_runs',
    'research_findings',
    'verification_results',
    'source_reviews',
    'mcp_audit_log'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on table public.%I from anon, authenticated', table_name);

      for policy_record in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = table_name
      loop
        execute format(
          'drop policy if exists %I on public.%I',
          policy_record.policyname,
          table_name
        );
      end loop;
    end if;
  end loop;
end $$;

-- Published policy data is public. There is no separate published flag in the
-- current model, so the allow-list is the existing non-trash public statuses.
do $$
begin
  if to_regclass('public.policies') is not null then
    grant select on table public.policies to anon, authenticated;

    create policy "Public can read published policies"
      on public.policies
      for select
      to anon, authenticated
      using (
        status in ('proposed', 'active', 'amended', 'repealed')
      );

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'policies'
        and column_name = 'status'
    ) then
      create index if not exists idx_policies_public_status
        on public.policies (status);
    end if;
  end if;
end $$;

-- Optional public catalog tables. These are safe to expose as full rows because
-- they model already-published content and do not contain operational source
-- material.
do $$
begin
  if to_regclass('public.news_items') is not null then
    grant select on table public.news_items to anon, authenticated;

    create policy "Public can read news items"
      on public.news_items
      for select
      to anon, authenticated
      using (true);
  end if;

  if to_regclass('public.timeline_events') is not null then
    grant select on table public.timeline_events to anon, authenticated;

    create policy "Public can read timeline events"
      on public.timeline_events
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

-- Staged source review and local MCP audit tables.
-- These tables are server-managed only; public clients must not read or write.

create table if not exists public.source_reviews (
  id text primary key,
  "sourceUrl" text not null unique,
  title text not null,
  "entryKind" text not null check ("entryKind" in ('policy', 'timeline_event')),
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'published', 'rejected')),
  "discoveredAt" timestamptz not null,
  "createdBy" text not null,
  notes text,
  analysis jsonb not null default '{}'::jsonb,
  "proposedRecord" jsonb not null default '{}'::jsonb,
  "publishedAt" timestamptz,
  "rejectionReason" text,
  "updatedAt" timestamptz not null
);

create table if not exists public.mcp_audit_log (
  id text primary key,
  "createdAt" timestamptz not null,
  actor text not null,
  "toolName" text not null,
  "sourceUrl" text,
  status text not null check (status in ('success', 'error')),
  "errorSummary" text
);

create index if not exists idx_source_reviews_status
  on public.source_reviews (status);

create index if not exists idx_source_reviews_discovered_at
  on public.source_reviews ("discoveredAt" desc);

create index if not exists idx_mcp_audit_log_created_at
  on public.mcp_audit_log ("createdAt" desc);

alter table public.source_reviews enable row level security;
alter table public.mcp_audit_log enable row level security;

revoke all on table public.source_reviews from anon, authenticated;
revoke all on table public.mcp_audit_log from anon, authenticated;

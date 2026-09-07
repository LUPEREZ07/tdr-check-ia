-- Historial de TDR analizados, aislado por usuario mediante Supabase Auth + RLS.
create extension if not exists pgcrypto;

create table if not exists public.tdr_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'TDR sin título',
  tdr_text text not null,
  content_hash text not null,
  findings jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  engine text not null default 'ollama-cloud',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists tdr_analyses_user_created_at_idx
  on public.tdr_analyses (user_id, created_at desc);

create index if not exists tdr_analyses_user_content_hash_idx
  on public.tdr_analyses (user_id, content_hash, created_at desc);

alter table public.tdr_analyses enable row level security;

drop policy if exists "Users can read their own TDR analyses" on public.tdr_analyses;
create policy "Users can read their own TDR analyses"
  on public.tdr_analyses
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own TDR analyses" on public.tdr_analyses;
create policy "Users can create their own TDR analyses"
  on public.tdr_analyses
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on table public.tdr_analyses from anon;
grant select, insert on table public.tdr_analyses to authenticated;

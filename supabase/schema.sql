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

-- Caché canónica compartida: el resultado del mismo TDR es único para todos
-- los usuarios, sin exponer el texto del documento ni romper el aislamiento.
create table if not exists public.tdr_analysis_cache (
  content_hash text primary key,
  findings jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  engine text not null default 'ollama-cloud',
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.get_tdr_analysis_cache(p_content_hash text)
returns table(findings jsonb, summary jsonb, engine text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.findings, c.summary, c.engine, c.created_at
  from public.tdr_analysis_cache c
  where c.content_hash = p_content_hash
  limit 1;
$$;

create or replace function public.save_tdr_analysis_cache(
  p_content_hash text,
  p_tdr_text text,
  p_findings jsonb,
  p_summary jsonb,
  p_engine text
)
returns table(findings jsonb, summary jsonb, engine text, created_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  computed_hash text;
begin
  computed_hash := encode(
    extensions.digest(
      pg_catalog.btrim(
        pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(coalesce(p_tdr_text, ''), E'\\r\\n?', E'\\n', 'g'),
            E'[ \\t]+', ' ', 'g'
          ),
          E'\\n[ \\t]+', E'\\n', 'g'
        )
      ),
      'sha256'
    ),
    'hex'
  );

  if computed_hash <> p_content_hash then
    raise exception 'El hash del contenido no coincide.' using errcode = '22023';
  end if;

  insert into public.tdr_analysis_cache(content_hash, findings, summary, engine)
  values (p_content_hash, coalesce(p_findings, '[]'::jsonb), coalesce(p_summary, '{}'::jsonb), coalesce(nullif(p_engine, ''), 'ollama-cloud'))
  on conflict (content_hash) do nothing;

  return query
    select c.findings, c.summary, c.engine, c.created_at
    from public.tdr_analysis_cache c
    where c.content_hash = p_content_hash
    limit 1;
end;
$$;

alter table public.tdr_analysis_cache enable row level security;
revoke all on table public.tdr_analysis_cache from anon, authenticated;
revoke all on function public.get_tdr_analysis_cache(text) from public;
revoke all on function public.save_tdr_analysis_cache(text, text, jsonb, jsonb, text) from public;
grant execute on function public.get_tdr_analysis_cache(text) to authenticated;
grant execute on function public.save_tdr_analysis_cache(text, text, jsonb, jsonb, text) to authenticated;

-- Solo expone a usuarios autenticados el correo y la última conexión.
create or replace function public.list_registered_tdr_users()
returns table(user_id uuid, email text, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email, u.last_sign_in_at
  from auth.users u
  where u.email is not null
  order by u.last_sign_in_at desc nulls last, u.created_at asc;
$$;

revoke all on function public.list_registered_tdr_users() from public;
grant execute on function public.list_registered_tdr_users() to authenticated;

-- Carga inicial: conserva como canónico el registro más reciente por documento.
insert into public.tdr_analysis_cache(content_hash, findings, summary, engine, created_at)
select distinct on (content_hash) content_hash, findings, summary, engine, created_at
from public.tdr_analyses
order by content_hash, created_at desc, id desc
on conflict (content_hash) do nothing;

-- Homologa los registros históricos existentes con el resultado canónico.
update public.tdr_analyses a
set findings = c.findings,
    summary = c.summary,
    engine = c.engine
from public.tdr_analysis_cache c
where c.content_hash = a.content_hash;

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

drop policy if exists "Users can update their own TDR analyses" on public.tdr_analyses;
create policy "Users can update their own TDR analyses"
  on public.tdr_analyses
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own TDR analyses" on public.tdr_analyses;
create policy "Users can delete their own TDR analyses"
  on public.tdr_analyses
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.tdr_analyses from anon;
grant select, insert, update, delete on table public.tdr_analyses to authenticated;

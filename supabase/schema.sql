-- Historial durable de TDR analizados.
-- Ejecutar en el SQL Editor del proyecto Supabase elegido.
create extension if not exists pgcrypto;

create table if not exists public.tdr_analyses (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'TDR sin título',
  tdr_text text not null,
  findings jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  engine text not null default 'ollama-cloud',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists tdr_analyses_created_at_idx
  on public.tdr_analyses (created_at desc);

alter table public.tdr_analyses enable row level security;

-- No se habilita acceso anon/authenticated: la escritura y lectura pasan por
-- las Functions del servidor, que usan SUPABASE_SERVICE_ROLE_KEY.

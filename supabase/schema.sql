-- Run once (safe to rerun) in Supabase SQL Editor. No direct Postgres connection required.
begin;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
-- Works both on new projects and projects with vector already installed in public.
set local search_path = public, extensions;

create table if not exists public.recipients (
  id text primary key, name text not null, created_at timestamptz not null default now(),
  timezone text not null default 'UTC', is_demo boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(), recipient_id text not null references public.recipients(id),
  activity text not null, start_time timestamptz not null, end_time timestamptz not null,
  duration_minutes numeric check (duration_minutes >= 0), metadata jsonb not null default '{}'::jsonb,
  check (end_time >= start_time)
);
create index if not exists events_recipient_activity_time on public.events(recipient_id, activity, start_time);
create index if not exists events_recipient_end on public.events(recipient_id, end_time desc);
create table if not exists public.baselines (
  id uuid primary key default gen_random_uuid(), recipient_id text not null references public.recipients(id),
  activity text not null, mean_duration numeric, std_duration numeric, mean_frequency numeric,
  window_days int, updated_at timestamptz not null default now(),
  window_start timestamptz not null, window_end timestamptz not null, sample_count int not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(recipient_id, activity, window_start, window_end)
);
create table if not exists public.activity_embeddings (
  id uuid primary key default gen_random_uuid(), recipient_id text not null references public.recipients(id),
  content text not null, embedding vector(1536), metadata jsonb not null default '{}'::jsonb
);
create index if not exists activity_embeddings_cosine on public.activity_embeddings using hnsw (embedding vector_cosine_ops);
create index if not exists activity_embeddings_recipient on public.activity_embeddings(recipient_id);
create table if not exists public.recipient_access (
  user_id uuid references auth.users(id) on delete cascade,
  recipient_id text references public.recipients(id) on delete cascade,
  primary key(user_id, recipient_id)
);
-- Two fixed rows per provider: bounded storage and independent atomic limits.
create table if not exists public.api_budgets (
  name text primary key, window_start timestamptz not null, used int not null default 0
);
insert into public.api_budgets values ('minute', now(), 0), ('day', now(), 0), ('groq-minute', now(), 0), ('groq-day', now(), 0) on conflict do nothing;

alter table public.recipients enable row level security;
alter table public.events enable row level security;
alter table public.baselines enable row level security;
alter table public.activity_embeddings enable row level security;
alter table public.recipient_access enable row level security;
alter table public.api_budgets enable row level security;
-- Browser keys have no direct data access. Route handlers authorize before service-role queries.
revoke all on public.recipients, public.events, public.baselines, public.activity_embeddings, public.recipient_access, public.api_budgets from anon, authenticated;
grant all on public.recipients, public.events, public.baselines, public.activity_embeddings, public.recipient_access, public.api_budgets to service_role;

create or replace function public.match_activity_embeddings(
  query_embedding vector(1536), match_threshold float, match_count int, filter_recipient_id text
) returns table(id uuid, recipient_id text, content text, metadata jsonb, similarity float)
language sql stable security invoker set search_path = public, extensions
as $$
  select ae.id, ae.recipient_id, ae.content, ae.metadata, 1 - (ae.embedding <=> query_embedding)
  from public.activity_embeddings ae
  where ae.recipient_id = filter_recipient_id and 1 - (ae.embedding <=> query_embedding) > match_threshold
  order by ae.embedding <=> query_embedding limit least(greatest(match_count, 0), 6);
$$;
revoke all on function public.match_activity_embeddings(vector, float, int, text) from public, anon, authenticated;
grant execute on function public.match_activity_embeddings(vector, float, int, text) to service_role;

create or replace function public.reserve_provider_budget(provider_name text, minute_limit int, day_limit int)
returns boolean language plpgsql security invoker set search_path = public as $$
declare m public.api_budgets; d public.api_budgets; minute_name text; day_name text;
begin
  if provider_name is null or provider_name not in ('gemini', 'groq') then return false; end if;
  if minute_limit is null or day_limit is null then return false; end if;
  minute_name := case when provider_name = 'gemini' then 'minute' else 'groq-minute' end;
  day_name := case when provider_name = 'gemini' then 'day' else 'groq-day' end;
  select * into m from public.api_budgets where name = minute_name for update;
  select * into d from public.api_budgets where name = day_name for update;
  if m.name is null or d.name is null then return false; end if;
  if m.window_start < date_trunc('minute', now()) then m.used := 0; end if;
  if d.window_start < date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' then d.used := 0; end if;
  if m.used >= least(greatest(minute_limit, 0), 30) or d.used >= least(greatest(day_limit, 0), 1000) then return false; end if;
  update public.api_budgets set used = m.used + 1, window_start = date_trunc('minute', now()) where name = minute_name;
  update public.api_budgets set used = d.used + 1, window_start = date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' where name = day_name;
  return true;
end $$;
revoke all on function public.reserve_provider_budget(text, int, int) from public, anon, authenticated;
grant execute on function public.reserve_provider_budget(text, int, int) to service_role;
-- Compatibility wrapper for the original seed command and existing Gemini deployments.
create or replace function public.reserve_gemini_budget(minute_limit int, day_limit int)
returns boolean language sql security invoker set search_path = public as $$
  select public.reserve_provider_budget('gemini', minute_limit, day_limit);
$$;
revoke all on function public.reserve_gemini_budget(int, int) from public, anon, authenticated;
grant execute on function public.reserve_gemini_budget(int, int) to service_role;
commit;

-- Mappin cloud sync (optional). Paste into Supabase → SQL Editor → New query → Run.
-- Free tier is enough for personal use and small tests.

-- Trips: each signed-in person can only see and change their own.
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'My trip',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.trips enable row level security;

drop policy if exists "Own trips" on public.trips;
create policy "Own trips" on public.trips
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Shares: short links. Anyone with a link can open that one share (via get_share), but nobody can list them.
create table if not exists public.shares (
  id text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.shares enable row level security;

drop policy if exists "Create own shares" on public.shares;
create policy "Create own shares" on public.shares
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "See own shares" on public.shares;
create policy "See own shares" on public.shares
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Delete own shares" on public.shares;
create policy "Delete own shares" on public.shares
  for delete to authenticated
  using (auth.uid() = user_id);

create or replace function public.get_share(share_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select data from public.shares where id = share_id
$$;

revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;

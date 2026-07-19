-- Enable Row Level Security on all public tables.
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Prereq: the app must send the user's JWT on REST calls (App.jsx supa.req does since 2026-07-10).

-- users: profile row, primary key = auth user id
alter table public.users enable row level security;
drop policy if exists "users select own" on public.users;
drop policy if exists "users insert own" on public.users;
drop policy if exists "users update own" on public.users;
create policy "users select own" on public.users
  for select using (auth.uid() = id);
create policy "users insert own" on public.users
  for insert with check (auth.uid() = id);
create policy "users update own" on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- habits
alter table public.habits enable row level security;
drop policy if exists "habits own rows" on public.habits;
create policy "habits own rows" on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- checkins
alter table public.checkins enable row level security;
drop policy if exists "checkins own rows" on public.checkins;
create policy "checkins own rows" on public.checkins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- fund_uses
alter table public.fund_uses enable row level security;
drop policy if exists "fund_uses own rows" on public.fund_uses;
create policy "fund_uses own rows" on public.fund_uses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

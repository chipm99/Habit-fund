-- vacations：全域休假模式（一個使用者可有多段休假區間）
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- 規則：一年（最近 365 天）最多 3 段；每段最多 14 天（end_date - start_date <= 13）。
-- 休假期間，寵物 gap 計算會扣掉落在區間內的天數，使寵物不會因休假變餓/死。
-- 孵化看打卡次數不看時間，不受休假影響。

create table if not exists public.vacations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  start_date  date not null,                      -- 休假起始日（含）
  end_date    date not null,                      -- 休假結束日（含）
  created_at  timestamptz not null default now()
);

create index if not exists vacations_user_id_idx on public.vacations (user_id);

-- RLS：只能讀寫自己的休假（select / insert / delete / update 皆限本人）
alter table public.vacations enable row level security;
drop policy if exists "vacations own rows" on public.vacations;
create policy "vacations own rows" on public.vacations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

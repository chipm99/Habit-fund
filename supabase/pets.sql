-- pets：電子寵物（一個習慣一隻，1:1）
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- 注意：本表與捐款基金（fund_uses / calcFund）完全分離，寵物幣只記在 pets.coins_spent。

create table if not exists public.pets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  habit_id      uuid not null unique,
  species_tier  text not null default 'egg',        -- 'egg'|'insect'|'cute'|'rare'|'spirit'
  species_key   text,                                -- 例 'firefly'|'cat'|'blackbear'|'sprite_leaf'
  hue           int  not null,                       -- 0-359，決定花色（每隻不同）
  pattern       text not null,                       -- 'dots'|'stripes'|'speckle'|'swirl'|'plain'
  xp            int  not null default 0,             -- 成長點數
  gift_log      jsonb not null default '[]'::jsonb,  -- [{week,gift,rarity,cost,at}]
  coins_spent   int  not null default 0,             -- 寵物幣已花費（與 fund_uses 分離）
  hatched_at    timestamptz,                         -- null = 還在蛋期
  memorials     jsonb not null default '[]'::jsonb,  -- [{species_key,tier,days,hue,pattern,died_at}] 曾經陪過你的
  xp_base       int  not null default 0,             -- 上一隻留下的 30% 經驗
  revived_at    timestamptz,                         -- 最近一次重生時間，null = 從未死過
  created_at    timestamptz not null default now()
);

-- 既有資料表升級（第一版 pets 沒有飢餓／死亡欄位時補上）
alter table public.pets add column if not exists memorials  jsonb not null default '[]'::jsonb;
alter table public.pets add column if not exists xp_base    int  not null default 0;
alter table public.pets add column if not exists revived_at timestamptz;

-- 外鍵（若 habits/auth.users 表存在；已存在同名 constraint 就跳過）
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pets_habit_id_fkey') then
    alter table public.pets
      add constraint pets_habit_id_fkey
      foreign key (habit_id) references public.habits(id) on delete cascade;
  end if;
end $$;

create index if not exists pets_user_id_idx on public.pets (user_id);
create index if not exists pets_habit_id_idx on public.pets (habit_id);

-- 值域保護
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pets_tier_chk') then
    alter table public.pets add constraint pets_tier_chk
      check (species_tier in ('egg','insect','cute','rare','spirit'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pets_pattern_chk') then
    alter table public.pets add constraint pets_pattern_chk
      check (pattern in ('dots','stripes','speckle','swirl','plain'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pets_hue_chk') then
    alter table public.pets add constraint pets_hue_chk
      check (hue >= 0 and hue <= 359);
  end if;
end $$;

-- RLS：只能讀寫自己的寵物
alter table public.pets enable row level security;
drop policy if exists "pets own rows" on public.pets;
create policy "pets own rows" on public.pets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

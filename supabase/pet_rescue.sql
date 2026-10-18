-- 寵物救援機制所需欄位
--   last_cared_at：急救照顧／復活時寫入的「照顧時間戳」。petGap 以 max(最後打卡, last_cared_at) 為基準，
--                  讓花金幣的緊急照顧能重置飢餓／死亡倒數（孵化看打卡次數，不受影響）。
--   died_at：寵物進入「已死亡、等待玩家選擇復活或重生」狀態的時間戳（null = 存活或已處理）。
--            死亡不再自動重生，改由玩家在 UI 選擇。
--   rescue_spent：花在急救照顧／復活的金幣（從可用金幣池扣除，但「不」計入進化門檻的 coins_spent，
--                 避免付費就能推進進化）。進化只看 coins_spent（餵食禮物投入）。
alter table public.pets add column if not exists last_cared_at timestamptz;
alter table public.pets add column if not exists died_at timestamptz;
alter table public.pets add column if not exists rescue_spent integer not null default 0;

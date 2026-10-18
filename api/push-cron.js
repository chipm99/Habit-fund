// Nightly reminder cron (Vercel Cron → 21:30 Asia/Taipei).
// Priority: 虛弱寵物（今晚不打卡就會餓死）> 肚子餓的寵物 > 一般「今天還沒打卡」提醒。
// 已經餓死的寵物不再推播（避免鞭屍）。
// Protected by CRON_SECRET. Reads via Supabase service-role key (bypasses RLS).
import webpush from 'web-push';

// ── Rotating copy (day-of-year % pool). All ≤20 zh-TW chars, no lecturing. ──
const COPY_STREAK = [
  '🔥 連續紀錄今晚要斷了——開一格就算贏',
  '🔥 昨天你做到了，今天也留個位子吧',
  '🔥 別讓連續歸零，開一格就夠了',
  '🔥 今晚補一格，紀錄就接著走',
  '🔥 差一步就斷鏈，輕輕開一格',
  '🔥 你的連續還在等你，一格就好',
  '🔥 連著的手感別斷，今晚一格接上',
  '🔥 你已經連這麼多天了，今天也別漏掉',
];
const COPY_RESTART = [
  '🌱 今天還空著。5 分鐘，一格就好',
  '🌱 小小一格，今天也算數',
  '🌱 還沒開始也沒關係，現在剛好',
  '🌱 給自己五分鐘，開一格吧',
  '🌱 一格就好，今天輕輕開始',
  '🌱 今天留了一格空位給你',
  '🌱 哪怕只是小小一步，今天也值得一格',
  '🌱 重新開始永遠不嫌晚，就現在',
];

// 寵物瀕死：今天不打卡就會離開（最急，點名習慣）
const COPY_DYING = [
  '🕯️ 今天不打卡，「{habit}」的夥伴就要離開了…',
  '🕯️ 最後一晚了——開一格，別讓「{habit}」的牠走',
  '🕯️ 「{habit}」的小傢伙在倒數了，一次打卡就能留住牠',
  '🕯️ 再不打卡，「{habit}」的夥伴撐不過今晚',
  '🕯️ 牠快不行了，「{habit}」只要一格就能救回來',
];
// 寵物虛弱：今晚不打卡就會離開（最後機會，溫柔但急）
const COPY_WEAK = [
  '🥺 小傢伙快撐不住了——今晚打一次卡就能救牠',
  '🥺 牠等你等到沒力氣了，一格就能把牠救回來',
  '🥺 今晚是最後機會，開一格陪陪牠',
  '🥺 牠還在等你回來，一次打卡就夠了',
  '🥺 「{habit}」的牠虛弱了，今晚一格就能好轉',
  '🥺 別讓「{habit}」的夥伴再撐下去，開一格吧',
];
// 寵物肚子餓
const COPY_HUNGRY = [
  '🍚 你的寵物餓了，開一格餵餵牠',
  '🍚 牠肚子咕嚕叫了，今天陪牠一下吧',
  '🍚 小夥伴在等飯吃，一格就好',
  '🍚 牠有點餓了，開一格就會好起來',
  '🍚 「{habit}」的小傢伙餓了，開一格餵餵牠',
  '🍚 「{habit}」的夥伴想你了，順手打個卡吧',
];

// 飢餓門檻（與 App/Pet.jsx 的 petHealth 同一把尺）：每日 3 餓 / 6 虛弱 / 9 死；每週 ×2
const healthOf = (gap, weekly) => {
  const m = weekly ? 2 : 1;
  if (gap >= 9 * m) return 'dead';
  if (gap >= 6 * m) return 'weak';
  if (gap >= 3 * m) return 'hungry';
  return 'ok';
};

const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);

// YYYY-MM-DD for a Date in Asia/Taipei (UTC+8, no DST).
const taipeiDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d);

export default async function handler(req, res) {
  // ── Auth gate ──
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── Env validation (never crash; report clearly) ──
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  const missing = Object.entries({
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
  }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    return res.status(500).json({ error: 'Missing env', missing });
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const sb = async (path, opts = {}) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: SERVICE_KEY,
        // New-style sb_secret_* keys must NOT be sent as a Bearer token (that header expects a JWT);
        // legacy service_role JWTs still need it.
        ...(SERVICE_KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${SERVICE_KEY}` }),
        'Content-Type': 'application/json',
        ...opts.headers,
      },
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  };

  const today = taipeiDate(new Date());
  const yesterday = taipeiDate(new Date(Date.now() - 86400000));
  const [y, m, d] = today.split('-').map(Number);
  const doy = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000);

  try {
    // 20 天視窗：足以算出所有還活著的寵物的 gap（超過 20 天沒打卡的一定已經餓死）
    const windowStart = taipeiDate(new Date(Date.now() - 20 * 86400000));
    const [subs, activeHabits, recentCheckins, petRows, vacationRows] = await Promise.all([
      sb('push_subscriptions?select=user_id,subscription,endpoint'),
      sb('habits?is_active=eq.true&select=id,user_id,frequency,title'),
      sb(`checkins?checked_date=gte.${windowStart}&select=user_id,habit_id,checked_date`),
      sb('pets?select=user_id,habit_id,species_tier,hatched_at,last_cared_at,died_at').catch(() => []), // pets.sql 未執行時降級為一般提醒
      sb(`vacations?end_date=gte.${windowStart}&select=user_id,start_date,end_date`).catch(() => []), // vacations.sql 未執行時當作沒休假
    ]);

    // 休假：以 user 分組，gap 計算時扣掉落在休假區間的天數（與前端 petGap 同一把尺）
    const toIdx = (s) => Math.round(Date.parse(s + 'T00:00:00Z') / 86400000);
    const vacByUser = new Map();
    for (const v of vacationRows || []) {
      if (!v.start_date || !v.end_date) continue;
      if (!vacByUser.has(v.user_id)) vacByUser.set(v.user_id, []);
      vacByUser.get(v.user_id).push(v);
    }
    // [winA..winB]（含兩端，日序號）內落在任一休假區間的天數（去重）
    const vacDaysInRange = (vacs, winA, winB) => {
      if (!vacs || winB < winA) return 0;
      const covered = new Set();
      for (const v of vacs) {
        const a = Math.max(winA, toIdx(v.start_date));
        const b = Math.min(winB, toIdx(v.end_date));
        for (let dd = a; dd <= b; dd++) covered.add(dd);
      }
      return covered.size;
    };

    const usersWithHabits = new Set((activeHabits || []).map(h => h.user_id));
    const habitById = new Map((activeHabits || []).map(h => [h.id, h]));
    const checkedToday = new Set();
    const checkedYesterday = new Set();
    const lastByHabit = new Map();
    for (const c of recentCheckins || []) {
      if (c.checked_date === today) checkedToday.add(c.user_id);
      if (c.checked_date === yesterday) checkedYesterday.add(c.user_id);
      const prev = lastByHabit.get(c.habit_id);
      if (!prev || c.checked_date > prev) lastByHabit.set(c.habit_id, c.checked_date);
    }

    // 每個 user 最緊急的寵物（只看已孵化、還活著的；死掉的跳過不鞭屍）
    // 優先序 dying > weak > hungry，並記住該寵物的習慣名，推播文案帶 {habit}
    const LEVEL_RANK = { hungry: 1, weak: 2, dying: 3 };
    const urgent = new Map(); // user_id → { level, habit }
    for (const p of petRows || []) {
      if (!p.hatched_at || p.species_tier === 'egg') continue;
      if (p.died_at) continue; // 已標記死亡、等玩家選擇復活/重生，不再推播
      const habit = habitById.get(p.habit_id);
      if (!habit) continue;
      // 基準日取 max(最後打卡日, last_cared_at 當天)，與前端 petGap 同一把尺（急救/復活會重置倒數）
      let last = lastByHabit.get(p.habit_id) || null;
      const caredDay = p.last_cared_at ? String(p.last_cared_at).split('T')[0] : null;
      if (caredDay && (!last || caredDay > last)) last = caredDay;
      // gap 扣掉休假天數（[基準日+1 .. 今天]），休假中的寵物不會被誤判為餓/虛弱
      const rawGap = last ? dayDiff(today, last) : 99;
      const vacDays = last ? vacDaysInRange(vacByUser.get(p.user_id), toIdx(last) + 1, toIdx(today)) : 0;
      const gap = Math.max(0, rawGap - vacDays);
      const weekly = habit.frequency && habit.frequency.type === 'weekly';
      const m = weekly ? 2 : 1;
      const base = healthOf(gap, weekly);
      if (base === 'dead') continue;                       // 已離開，不鞭屍
      const daysToDead = 9 * m - gap;
      let level;
      if (daysToDead >= 1 && daysToDead <= 2) level = 'dying'; // 1~2 天內會死 → 瀕死
      else if (base === 'weak') level = 'weak';
      else if (base === 'hungry') level = 'hungry';
      else continue;                                       // 健康，不推寵物提醒
      const cur = urgent.get(p.user_id);
      if (!cur || LEVEL_RANK[level] > LEVEL_RANK[cur.level]) {
        urgent.set(p.user_id, { level, habit: habit.title || '' });
      }
    }

    let sent = 0, skipped = 0, pruned = 0, failed = 0;
    const staleEndpoints = [];

    for (const s of subs || []) {
      const uid = s.user_id;
      if (!usersWithHabits.has(uid)) { skipped++; continue; }

      // 寵物狀態優先：瀕死 > 虛弱 > 肚子餓 > 一般提醒（一般提醒仍只在今天零打卡時送）
      const u = urgent.get(uid);
      let pool, habitName = '';
      if (u) {
        habitName = u.habit || '';
        pool = u.level === 'dying' ? COPY_DYING : u.level === 'weak' ? COPY_WEAK : COPY_HUNGRY;
      } else if (checkedToday.has(uid)) { skipped++; continue; }
      else pool = checkedYesterday.has(uid) ? COPY_STREAK : COPY_RESTART;
      let body = pool[doy % pool.length];
      body = body.replace(/\{habit\}/g, habitName); // 文案裡的 {habit} 換成該習慣 title
      const payload = JSON.stringify({ title: '好習慣基金', body, data: { url: '/' } });

      try {
        await webpush.sendNotification(s.subscription, payload);
        sent++;
      } catch (err) {
        const code = err && err.statusCode;
        if (code === 404 || code === 410) {
          if (s.endpoint) staleEndpoints.push(s.endpoint);
        } else {
          failed++;
        }
      }
    }

    // Prune dead subscriptions.
    for (const ep of staleEndpoints) {
      try {
        await sb(`push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
        pruned++;
      } catch { /* best-effort cleanup */ }
    }

    return res.status(200).json({ ok: true, date: today, sent, skipped, pruned, failed });
  } catch (err) {
    return res.status(500).json({ error: 'Cron failed', detail: String(err && err.message || err) });
  }
}

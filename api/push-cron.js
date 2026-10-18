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
];
const COPY_RESTART = [
  '🌱 今天還空著。5 分鐘，一格就好',
  '🌱 小小一格，今天也算數',
  '🌱 還沒開始也沒關係，現在剛好',
  '🌱 給自己五分鐘，開一格吧',
  '🌱 一格就好，今天輕輕開始',
  '🌱 今天留了一格空位給你',
];

// 寵物虛弱：今晚不打卡就會離開（最後機會，溫柔但急）
const COPY_WEAK = [
  '🥺 小傢伙快撐不住了——今晚打一次卡就能救牠',
  '🥺 牠等你等到沒力氣了，一格就能把牠救回來',
  '🥺 今晚是最後機會，開一格陪陪牠',
  '🥺 牠還在等你回來，一次打卡就夠了',
];
// 寵物肚子餓
const COPY_HUNGRY = [
  '🍚 你的寵物餓了，開一格餵餵牠',
  '🍚 牠肚子咕嚕叫了，今天陪牠一下吧',
  '🍚 小夥伴在等飯吃，一格就好',
  '🍚 牠有點餓了，開一格就會好起來',
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
      sb('habits?is_active=eq.true&select=id,user_id,frequency'),
      sb(`checkins?checked_date=gte.${windowStart}&select=user_id,habit_id,checked_date`),
      sb('pets?select=user_id,habit_id,species_tier,hatched_at').catch(() => []), // pets.sql 未執行時降級為一般提醒
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

    // 每個 user 最緊急的寵物狀態（只看已孵化、還活著的；死掉的跳過不鞭屍）
    const urgent = new Map(); // user_id → 'weak' | 'hungry'
    for (const p of petRows || []) {
      if (!p.hatched_at || p.species_tier === 'egg') continue;
      const habit = habitById.get(p.habit_id);
      if (!habit) continue;
      const last = lastByHabit.get(p.habit_id);
      // gap 扣掉休假天數（[最後打卡日+1 .. 今天]），休假中的寵物不會被誤判為餓/虛弱
      const rawGap = last ? dayDiff(today, last) : 99;
      const vacDays = last ? vacDaysInRange(vacByUser.get(p.user_id), toIdx(last) + 1, toIdx(today)) : 0;
      const gap = Math.max(0, rawGap - vacDays);
      const state = healthOf(gap, habit.frequency && habit.frequency.type === 'weekly');
      if (state === 'weak') urgent.set(p.user_id, 'weak');
      else if (state === 'hungry' && urgent.get(p.user_id) !== 'weak') urgent.set(p.user_id, 'hungry');
    }

    let sent = 0, skipped = 0, pruned = 0, failed = 0;
    const staleEndpoints = [];

    for (const s of subs || []) {
      const uid = s.user_id;
      if (!usersWithHabits.has(uid)) { skipped++; continue; }

      // 寵物狀態優先：虛弱 > 肚子餓 > 一般提醒（一般提醒仍只在今天零打卡時送）
      const state = urgent.get(uid);
      let pool;
      if (state === 'weak') pool = COPY_WEAK;
      else if (state === 'hungry') pool = COPY_HUNGRY;
      else if (checkedToday.has(uid)) { skipped++; continue; }
      else pool = checkedYesterday.has(uid) ? COPY_STREAK : COPY_RESTART;
      const body = pool[doy % pool.length];
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

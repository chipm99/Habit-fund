// Nightly reminder cron (Vercel Cron → 21:30 Asia/Taipei).
// For each user with active habits and ZERO check-ins today, send a gentle push.
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
    const [subs, activeHabits, recentCheckins] = await Promise.all([
      sb('push_subscriptions?select=user_id,subscription,endpoint'),
      sb('habits?is_active=eq.true&select=user_id'),
      sb(`checkins?checked_date=in.(${today},${yesterday})&select=user_id,checked_date`),
    ]);

    const usersWithHabits = new Set((activeHabits || []).map(h => h.user_id));
    const checkedToday = new Set();
    const checkedYesterday = new Set();
    for (const c of recentCheckins || []) {
      if (c.checked_date === today) checkedToday.add(c.user_id);
      else if (c.checked_date === yesterday) checkedYesterday.add(c.user_id);
    }

    let sent = 0, skipped = 0, pruned = 0, failed = 0;
    const staleEndpoints = [];

    for (const s of subs || []) {
      const uid = s.user_id;
      // Only nudge users who have something to check in and haven't yet today.
      if (!usersWithHabits.has(uid) || checkedToday.has(uid)) { skipped++; continue; }

      const pool = checkedYesterday.has(uid) ? COPY_STREAK : COPY_RESTART;
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

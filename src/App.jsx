import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from '@supabase/supabase-js';
import FluidBackground from './FluidBackground.jsx';
import CheckinCelebration from './CheckinCelebration.jsx';
import {
  Pet, Egg, GIFTS, HATCH_DAYS, STAGE_LABEL, TIER_LABEL,
  speciesLabel, pickSpecies, stageIndex, petXp, evolveTier, nextTierGoal,
  isoWeek, nextMondayLabel, hueFromId, patternFromId,
  diffMult, petHealth, HEALTH_LABEL,
} from './Pet.jsx';

const SUPABASE_URL = 'https://keenwhiygrrnxhllibxa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ZrftrM1kZGX3odvfJQG0Pw_jNriTgc6';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ── Supabase client ──────────────────────────────────────
const supa = {
  async req(path, opts = {}) {
    // RLS: authenticate REST calls as the logged-in user, not the anon key
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      ...opts,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + (session?.access_token || SUPABASE_KEY),
        'Content-Type': 'application/json',
        Prefer: opts.prefer || 'return=representation',
        ...opts.headers,
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text);
    return text ? JSON.parse(text) : null;
  },
  get: (t, q = '') => supa.req(t + (q ? '?' + q : ''), { method: 'GET' }),
  post: (t, d) => supa.req(t, { method: 'POST', body: JSON.stringify(d) }),
  patch: (t, q, d) => supa.req(t + '?' + q, { method: 'PATCH', body: JSON.stringify(d) }),
  del: (t, q) => supa.req(t + '?' + q, { method: 'DELETE', prefer: '' }),
};

// ── Helpers ──────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0];
const diffLabel = d => ({ easy: '輕鬆', medium: '適中', hard: '挑戰' }[d] || d);
const diffFund = d => ({ easy: 5, medium: 10, hard: 20 }[d] || 10);
const diffColor = d => ({ easy: '#5AA37F', medium: '#C89043', hard: '#D98368' }[d]);
const diffBg = d => ({ easy: '#E6F2EB', medium: '#FBF3D8', hard: '#F8E7DC' }[d]);

// Web Push: VAPID applicationServerKey must be a Uint8Array (URL-safe base64 → bytes).
const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const weekStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.toISOString().split('T')[0];
};

const getWeeklyCount = (habitId, checkins) => {
  const ws = weekStart();
  const we = todayStr();
  return checkins.filter(c =>
    c.habit_id === habitId &&
    c.checked_date >= ws &&
    c.checked_date <= we
  ).length;
};

const getWeeklyStreak = (habitId, checkins, times) => {
  // Count consecutive past weeks (not including current) where target was met
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let w = 1; w <= 52; w++) {
    const end = new Date(d);
    end.setDate(d.getDate() - ((d.getDay() + 6) % 7) - (w - 1) * 7 - 1); // Sunday of week w ago (Mon–Sun weeks, aligned with getWeeklyCount/getWeeklyStatus)
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    const ws = start.toISOString().split('T')[0];
    const we = end.toISOString().split('T')[0];
    const count = checkins.filter(c =>
      c.habit_id === habitId &&
      c.checked_date >= ws &&
      c.checked_date <= we
    ).length;
    if (count >= times) streak++;
    else break;
  }
  return streak;
};

// Return 'green'|'yellow'|'red'|null for a weekly habit on a given weekOffset (0=this week, -1=last week…)
// Week boundaries mirror getWeeklyStreak exactly (Monday-start, end = last Monday + 6 days back).
const getWeeklyStatus = (habit, checkins, weekOffset = 0) => {
  const freq = habit.frequency;
  if (!freq || freq.type !== 'weekly') return null;
  const times = freq.times || 1;
  const createdAt = habit.created_at ? habit.created_at.split('T')[0] : '1970-01-01';
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const mondayOffset = (d.getDay() + 6) % 7;
  const thisMon = new Date(d); thisMon.setDate(d.getDate() - mondayOffset);
  // Shift back by weekOffset weeks (weekOffset=0 → thisMon, weekOffset=-1 → thisMon-7)
  const weekStart = new Date(thisMon); weekStart.setDate(thisMon.getDate() + weekOffset * 7);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const ws = weekStart.toISOString().split('T')[0];
  const we = weekEnd.toISOString().split('T')[0];
  if (we < createdAt) return null;
  const count = checkins.filter(c => c.habit_id === habit.id && c.checked_date >= ws && c.checked_date <= we).length;
  if (count >= times) return 'green';
  if (count >= Math.max(2, times - 1)) return 'yellow';
  return 'red';
};

function getStreak(habitId, checkins) {
  const dates = checkins
    .filter(c => c.habit_id === habitId)
    .map(c => c.checked_date)
    .sort().reverse();
  if (!dates.length) return 0;
  let streak = 0;
  let cur = new Date();
  for (const ds of dates) {
    const d = new Date(ds + 'T00:00:00');
    cur.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((cur - d) / 86400000);
    if (diff === 0 || diff === streak) { streak++; cur = new Date(d); cur.setDate(cur.getDate() - 1); }
    else break;
  }
  return streak;
}

// Count consecutive daily checkins for a habit ending on `asOf` (YYYY-MM-DD)
function getStreakAsOf(habitId, checkins, asOf) {
  const checkedSet = new Set(
    checkins.filter(c => c.habit_id === habitId && c.checked_date <= asOf).map(c => c.checked_date)
  );
  let streak = 0;
  const d = new Date(asOf + 'T00:00:00');
  while (checkedSet.has(d.toISOString().split('T')[0])) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ── Toast ────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const toast = useCallback((m) => {
    setMsg(m); setShow(true);
    setTimeout(() => setShow(false), 2500);
  }, []);
  return { msg, show, toast };
}

// ── Cozy Morning Sun palette ─────────────────────────────
const C = {
  cream:    '#FDFBF7', // page base
  ivory:    '#F7F4EB', // warm ivory
  paper:    '#FFFDF9', // card paper
  lemon:    '#FBE790', // soft lemon (primary sunshine)
  lemonDeep:'#E8C94F', // readable lemon (weekly "yellow" status)
  mint:     '#A8D8B9', // mint accent
  leaf:     '#5AA37F', // readable mint-green (positive / "green" status)
  sky:      '#A5DEE4', // sky blue accent
  cinnamon: '#8A6B58', // soft text + hand-drawn borders
  ink:      '#4A3B31', // body text (deep cocoa)
  muted:    '#A08B7A', // muted text
  line:     '#EADFCF', // hairline dividers
  border:   '#E7D8C4', // hand-drawn card border
  coral:    '#E8A08A', // soft coral ("red" status)
  coralDeep:'#D98368', // warm button / spend
  honey:    '#C89043', // fund gold numbers
};

// ── Styles (inline) — Japanese hand-drawn "zakka" look ────
const S = {
  // transparent so the paper canvas (fixed, z-index bottom) shows through.
  bg: { background: 'transparent', minHeight: '100vh', fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", fontSize: 15, color: C.ink },
  app: { maxWidth: 680, margin: '0 auto', padding: '28px 20px 108px', position: 'relative', zIndex: 1 },
  // torn-sketchbook card: warm paper, softly irregular hand-drawn corners, and a hard 0-blur
  // cinnamon "outline copy" offset down-right that mimics stacked paper (not a normal box-shadow).
  card: { background: C.paper, border: `1.5px solid ${C.border}`, borderRadius: '20px 22px 16px 24px', padding: 22, boxShadow: `3px 4px 0 #EFE1CE, 0 2px 8px rgba(138,107,88,0.05)`, marginBottom: 14 },
  btn: (type = 'primary') => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '11px 22px', borderRadius: '16px 14px 17px 13px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
    cursor: 'pointer',
    background: type === 'primary' ? C.lemon : type === 'warm' ? '#F6B7A6' : C.ivory,
    color: type === 'warm' ? '#7A3A2A' : type === 'secondary' ? C.cinnamon : '#5A4433',
    border: `1.5px solid ${type === 'primary' ? '#E8C05A' : type === 'warm' ? '#E79A82' : C.border}`,
    boxShadow: type === 'secondary' ? `2px 3px 0 #EBDFCE` : type === 'warm' ? `2px 3px 0 #E4A08C` : `2px 3px 0 #E8C05A`,
  }),
  input: { width: '100%', padding: '11px 14px', border: `1.5px solid ${C.border}`, borderRadius: '13px 11px 14px 12px', fontFamily: 'inherit', fontSize: 15, outline: 'none', background: C.paper, color: C.ink, boxSizing: 'border-box' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: C.cinnamon, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' },
  chip: (sel) => ({ padding: '8px 16px', borderRadius: '15px 12px 16px 13px', border: `1.5px solid ${sel ? C.leaf : C.border}`, background: sel ? '#E6F2EB' : C.paper, color: sel ? C.leaf : C.ink, cursor: 'pointer', fontSize: 14, fontWeight: sel ? 600 : 400, whiteSpace: 'nowrap', boxShadow: sel ? `2px 2px 0 #CDE7D8` : 'none' }),
  display: { fontFamily: "'Zen Maru Gothic', 'DM Sans', sans-serif", fontSize: '2.05rem', lineHeight: 1.28, fontWeight: 700, letterSpacing: '0.005em' },
  h2: { fontFamily: "'Zen Maru Gothic', 'DM Sans', sans-serif", fontSize: '1.5rem', fontWeight: 700, marginBottom: 6, letterSpacing: '0.005em' },
  muted: { color: C.muted },
  // nav: warm paper bar with a hand-drawn top edge.
  nav: { position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,253,249,0.9)', backdropFilter: 'blur(12px) saturate(1.05)', WebkitBackdropFilter: 'blur(12px) saturate(1.05)', borderTop: `2px dashed ${C.border}`, display: 'flex', zIndex: 100 },
  navBtn: (active) => ({ flex: 1, padding: '11px 8px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: active ? C.leaf : C.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontFamily: "'Zen Maru Gothic', 'DM Sans', sans-serif" }),
  row: { display: 'flex', alignItems: 'center', gap: 12 },
  modalBg: { position: 'fixed', inset: 0, background: 'rgba(74,59,49,0.3)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', zIndex: 200, display: 'flex', alignItems: 'flex-end' },
  modal: { background: C.cream, border: `1.5px solid ${C.border}`, borderBottom: 'none', borderRadius: '26px 22px 0 0', padding: '28px 24px', width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 -6px 30px rgba(138,107,88,0.14)' },
};

// ── Login ────────────────────────────────────────────────
function Login({ toast }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [sent, setSent] = useState(false);
  const [magicOpen, setMagicOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const sendLink = async () => {
    if (!email.trim()) { toast('請輸入 Email'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin }
    });
    setLoading(false);
    if (error) { toast('發送失敗：' + error.message); return; }
    setSent(true);
  };

  const signIn = async () => {
    if (!email.trim() || !password) { toast('請輸入 Email 與密碼'); return; }
    setLoading(true); setErrorMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setErrorMsg('帳號或密碼不正確。若你是用 Email 連結登入的舊帳號、還沒設定過密碼，請改用下方「用 Email 連結登入」。');
    }
  };

  const signUp = async () => {
    if (!email.trim() || !password) { toast('請輸入 Email 與密碼'); return; }
    if (password.length < 8) { setErrorMsg('密碼至少需要 8 個字'); return; }
    setLoading(true); setErrorMsg('');
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    setLoading(false);
    if (error) { setErrorMsg('註冊失敗：' + error.message); return; }
    toast('📬 請收信驗證你的 Email，完成後即可用密碼登入');
    setMode('login');
  };

  if (sent) return (
    <div style={{ ...S.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ ...S.app, textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 24 }}>📬</div>
        <div style={S.h2}>確認信已寄出</div>
        <p style={{ ...S.muted, marginTop: 12, lineHeight: 1.7 }}>
          請到 <strong>{email}</strong> 收取登入連結<br />點擊信件中的按鈕即可登入
        </p>
        <button style={{ ...S.btn('secondary'), marginTop: 24 }} onClick={() => setSent(false)}>重新發送</button>
      </div>
    </div>
  );

  return (
    <div style={{ ...S.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={S.app}>
        <div style={{ padding: '16px 0 36px' }}>
          <div style={S.display}>好習慣基金<br /><em style={{ color: '#5AA37F', fontStyle: 'italic' }}>Habit Fund</em></div>
          <p style={{ ...S.muted, marginTop: 14, lineHeight: 1.7 }}>每一個你堅持的小習慣，<br />都能化成對世界的溫柔行動。</p>
        </div>
        <div className="cozy-card" style={S.card}>
          <label style={S.label}>Email</label>
          <input
            style={S.input}
            type="email"
            autoComplete="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <label style={{ ...S.label, marginTop: 14 }}>密碼</label>
          <input
            style={S.input}
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder={mode === 'signup' ? '至少 8 個字' : '••••••••'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (mode === 'signup' ? signUp() : signIn())}
          />
          {errorMsg && <p style={{ color: C.coralDeep, fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>{errorMsg}</p>}
        </div>
        <button
          style={{ ...S.btn('primary'), width: '100%', marginTop: 8, justifyContent: 'center' }}
          onClick={mode === 'signup' ? signUp : signIn}
          disabled={loading}
        >
          {loading ? '處理中…' : mode === 'signup' ? '註冊 →' : '登入 →'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          {mode === 'login' ? (
            <span onClick={() => { setMode('signup'); setErrorMsg(''); }} style={{ fontSize: 12, color: C.muted, cursor: 'pointer', textDecoration: 'underline' }}>沒有密碼？註冊新帳號</span>
          ) : (
            <span onClick={() => { setMode('login'); setErrorMsg(''); }} style={{ fontSize: 12, color: C.muted, cursor: 'pointer', textDecoration: 'underline' }}>已有帳號？登入</span>
          )}
        </div>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <span onClick={() => setMagicOpen(o => !o)} style={{ fontSize: 12, color: C.muted, cursor: 'pointer', textDecoration: 'underline' }}>用 Email 連結登入（免密碼）</span>
        </div>
        {magicOpen && (
          <div className="cozy-card" style={{ ...S.card, marginTop: 12 }}>
            <p style={{ ...S.muted, fontSize: 12, marginBottom: 10 }}>我們會寄一封免密碼的登入連結到 {email || '你的信箱'}</p>
            <button style={{ ...S.btn('secondary'), width: '100%', justifyContent: 'center' }} onClick={sendLink} disabled={loading}>
              {loading ? '寄送中…' : '寄送登入連結 →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Onboarding ───────────────────────────────────────────

const GOAL_CATEGORIES = [
  { emoji: '📚', label: '語言學習', examples: '考 JLPT N2、DELE B1、多益 800' },
  { emoji: '💰', label: '財務投資', examples: '學美股、存到第一桶金、理財規劃' },
  { emoji: '🎙️', label: '自媒體創作', examples: 'YouTube、Podcast、IG 經營' },
  { emoji: '💪', label: '健康體態', examples: '減重、馬拉松、重訓、瑜珈' },
  { emoji: '🧠', label: '技能進修', examples: '寫程式、設計、行銷、考證照' },
  { emoji: '🧘', label: '身心平衡', examples: '冥想、減壓、睡眠品質' },
  { emoji: '🤝', label: '人際與關係', examples: '改善溝通、維繫友誼、家庭連結' },
  { emoji: '✍️', label: '創意表達', examples: '寫作、繪畫、音樂、攝影' },
  { emoji: '🌍', label: '其他目標', examples: '旅行計劃、環保生活、讀書習慣' },
];

const DEADLINE_OPTIONS = ['3 個月內', '6 個月內', '年底前', '1 年以上', '沒有特定期限'];
const TIME_OPTIONS = ['15 分鐘以內', '30 分鐘', '1 小時', '1-2 小時', '彈性不固定'];
const SCHEDULE_OPTIONS = ['早晨（起床後）', '中午休息時', '下班後傍晚', '睡前', '零碎時間穿插'];
const OBSTACLE_OPTIONS = ['很難開始行動', '開始了但容易放棄', '時間總是不夠', '太容易分心', '對自己期待太高', '不知道從何下手'];
const STYLE_OPTIONS = ['需要明確步驟', '喜歡有彈性', '靠數字和數據激勵', '靠成就感和打卡激勵', '需要外部壓力（截止日）'];

// 目標卡元件
function GoalCard({ index, goal, onChange }) {
  const cat = GOAL_CATEGORIES.find(c => c.label === goal.category);
  return (
    <div className="cozy-card" style={{ ...S.card, border: '1.5px solid #EADFCF' }}>
      <div style={{ ...S.row, marginBottom: 16 }}>
        <div style={{ background: '#FDFBF7', borderRadius: 10, padding: '8px 12px', fontSize: 20 }}>{cat?.emoji || '🎯'}</div>
        <div style={{ flex: 1, fontWeight: 500 }}>目標 {index + 1}</div>
        {index > 0 && (
          <button onClick={() => onChange(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A08B7A', fontSize: 20 }}>×</button>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={S.label}>類別</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {GOAL_CATEGORIES.map(c => (
            <div key={c.label}
              style={{ ...S.chip(goal.category === c.label), fontSize: 13, padding: '6px 12px' }}
              onClick={() => onChange({ ...goal, category: c.label })}>
              {c.emoji} {c.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={S.label}>具體目標 <span style={{ color: '#5AA37F' }}>*</span></label>
        <input style={S.input}
          placeholder={cat ? `例：${cat.examples.split('、')[0]}` : '請描述你的具體目標'}
          value={goal.text || ''}
          onChange={e => onChange({ ...goal, text: e.target.value })} />
        {cat && <p style={{ ...S.muted, fontSize: 12, marginTop: 6 }}>參考：{cat.examples}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div>
          <label style={S.label}>希望達成時間</label>
          <select style={S.input} value={goal.deadline || ''} onChange={e => onChange({ ...goal, deadline: e.target.value })}>
            <option value="">請選擇</option>
            {DEADLINE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>目前程度</label>
          <input style={S.input} placeholder="例：完全零基礎" value={goal.level || ''} onChange={e => onChange({ ...goal, level: e.target.value })} />
        </div>
      </div>

      <div>
        <label style={S.label}>每天可投入時間</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {TIME_OPTIONS.map(o => (
            <div key={o} style={{ ...S.chip(goal.timePerDay === o), fontSize: 12, padding: '5px 11px' }}
              onClick={() => onChange({ ...goal, timePerDay: o })}>{o}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Quick-start templates — data-driven wall (no hand-coded cards)
const QUICK_TEMPLATES = [
  { emoji: '🧘', title: '冥想',     desc: '每天靜心 10 分鐘', difficulty: 'easy',   frequency: { type: 'daily' },            goal_label: '身心平衡' },
  { emoji: '🏃', title: '運動',     desc: '每週運動 3 次',   difficulty: 'medium', frequency: { type: 'weekly', times: 3 }, goal_label: '健康體態' },
  { emoji: '🇯🇵', title: '日文',     desc: '每天日文 30 分鐘', difficulty: 'medium', frequency: { type: 'daily' },            goal_label: '語言學習' },
  { emoji: '📖', title: '閱讀',     desc: '每天閱讀 20 分鐘', difficulty: 'easy',   frequency: { type: 'daily' },            goal_label: '技能進修' },
  { emoji: '💧', title: '喝水',     desc: '每天喝水 8 杯',   difficulty: 'easy',   frequency: { type: 'daily' },            goal_label: '健康體態' },
  { emoji: '🌙', title: '早睡',     desc: '每天 11 點前入睡', difficulty: 'medium', frequency: { type: 'daily' },            goal_label: '身心平衡' },
  { emoji: '✍️', title: '寫日記',   desc: '每天寫日記',     difficulty: 'easy',   frequency: { type: 'daily' },            goal_label: '創意表達' },
  { emoji: '🎯', title: '求職行動', desc: '每週求職行動 1 次', difficulty: 'medium', frequency: { type: 'weekly', times: 1 }, goal_label: '技能進修' },
];

// Quick questionnaire: domains → concrete habit chips (same shape as templates)
const SURVEY_DOMAINS = [
  { key: '健康', emoji: '💪', habits: [
    { emoji: '🏃', title: '運動', desc: '每週運動 3 次', difficulty: 'medium', frequency: { type: 'weekly', times: 3 }, goal_label: '健康體態' },
    { emoji: '💧', title: '喝水', desc: '每天喝水 8 杯', difficulty: 'easy', frequency: { type: 'daily' }, goal_label: '健康體態' },
    { emoji: '🌙', title: '早睡', desc: '每天 11 點前入睡', difficulty: 'medium', frequency: { type: 'daily' }, goal_label: '健康體態' },
  ] },
  { key: '學習', emoji: '📚', habits: [
    { emoji: '🇯🇵', title: '日文', desc: '每天日文 30 分鐘', difficulty: 'medium', frequency: { type: 'daily' }, goal_label: '語言學習' },
    { emoji: '📖', title: '閱讀', desc: '每天閱讀 20 分鐘', difficulty: 'easy', frequency: { type: 'daily' }, goal_label: '技能進修' },
    { emoji: '💻', title: '寫程式', desc: '每天寫程式 30 分鐘', difficulty: 'hard', frequency: { type: 'daily' }, goal_label: '技能進修' },
  ] },
  { key: '工作', emoji: '💼', habits: [
    { emoji: '🎯', title: '求職行動', desc: '每週求職行動 1 次', difficulty: 'medium', frequency: { type: 'weekly', times: 1 }, goal_label: '技能進修' },
    { emoji: '🍅', title: '番茄鐘', desc: '每天 1 個專注番茄鐘', difficulty: 'easy', frequency: { type: 'daily' }, goal_label: '技能進修' },
    { emoji: '📝', title: '列待辦', desc: '每天列出今日待辦', difficulty: 'easy', frequency: { type: 'daily' }, goal_label: '技能進修' },
  ] },
  { key: '心靈', emoji: '🧘', habits: [
    { emoji: '🧘', title: '冥想', desc: '每天靜心 10 分鐘', difficulty: 'easy', frequency: { type: 'daily' }, goal_label: '身心平衡' },
    { emoji: '✍️', title: '寫日記', desc: '每天寫日記', difficulty: 'easy', frequency: { type: 'daily' }, goal_label: '創意表達' },
    { emoji: '🙏', title: '感恩', desc: '每天寫下 3 件感恩', difficulty: 'easy', frequency: { type: 'daily' }, goal_label: '身心平衡' },
  ] },
];

// Web Speech API — null in unsupported browsers, so the mic button hides itself
const SpeechRec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

// Map a template/chip object to a habits-table row (schema-matching)
const habitRow = (t) => ({
  title: `${t.emoji} ${t.title}`,
  description: t.desc || '',
  difficulty: t.difficulty || 'medium',
  fund_per_day: diffFund(t.difficulty || 'medium'),
  frequency: t.frequency || { type: 'daily' },
  goal_label: t.goal_label || null,
  is_active: true,
});

function Onboarding({ authUser, onDone, toast }) {
  // ── All hooks (must precede any return) ──
  const [entry, setEntry] = useState(null); // null=hub | 'quick' | 'survey' | 'ai'
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  // quick
  const [quickSel, setQuickSel] = useState(new Set());
  // survey
  const [surveyStep, setSurveyStep] = useState(0);
  const [domains, setDomains] = useState([]);
  const [surveySel, setSurveySel] = useState(new Set());
  const [customText, setCustomText] = useState('');
  const [customHabits, setCustomHabits] = useState([]);
  const recRef = useRef(null);
  // ai
  const [aiStep, setAiStep] = useState(0);
  const [goals, setGoals] = useState([{ category: '', text: '', deadline: '', level: '', timePerDay: '' }]);
  const [schedule, setSchedule] = useState([]);
  const [obstacles, setObstacles] = useState([]);
  const [style, setStyle] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [aiError, setAiError] = useState(false);

  // Shared: create the user row, insert the chosen habits, then finish.
  const createAll = async (rows, values = {}) => {
    if (!rows.length) { toast('請至少選擇一個習慣 😊'); return; }
    setLoading(true);
    try {
      const users = await supa.post('users', {
        id: authUser.id,
        name: name.trim() || authUser.email?.split('@')[0] || '朋友',
        values_answers: values,
      });
      const user = users[0];
      for (const r of rows) await supa.post('habits', { ...r, user_id: user.id });
      onDone(user);
      toast('歡迎！你的習慣旅程開始了 🌱');
    } catch (e) {
      console.error('createAll error:', e);
      const msg = e?.message || '';
      if (msg.includes('row-level security') || msg.includes('RLS') || msg.includes('permission')) toast('⚠️ 資料庫權限錯誤：請在 Supabase 關閉 RLS');
      else if (msg.includes('relation') || msg.includes('does not exist')) toast('⚠️ 資料表不存在：請先執行建表 SQL');
      else toast('儲存失敗：' + (msg.slice(0, 50) || '請查看 console'));
      setLoading(false);
    }
  };

  // Shared header with a "back to hub" link
  const header = (kicker, title, subtitle) => (
    <div style={{ padding: '8px 0 16px' }}>
      <button onClick={() => setEntry(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A08B7A', fontSize: 13, padding: 0, marginBottom: 10, fontFamily: 'inherit' }}>← 換個方式</button>
      {kicker && <p style={{ ...S.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{kicker}</p>}
      <div style={{ ...S.h2, marginTop: 6 }}>{title}</div>
      {subtitle && <p style={{ ...S.muted, fontSize: 13, marginTop: 6 }}>{subtitle}</p>}
    </div>
  );

  // ── Hub: three big cards ──
  if (entry === null) return (
    <div style={S.bg}><div style={S.app}>
      <div style={{ padding: '16px 0 22px' }}>
        <div style={S.display}>你好，<br />準備好<br /><em style={{ color: '#5AA37F', fontStyle: 'italic' }}>開始了嗎？</em></div>
        <p style={{ ...S.muted, marginTop: 14, lineHeight: 1.7 }}>選一個最適合你的方式，<br />30 秒內就能開始。</p>
      </div>
      {[
        { key: 'quick', emoji: '⚡', title: '快速開始', sub: '從熱門習慣挑選，一鍵建立', badge: '最快 · 推薦', hi: true },
        { key: 'survey', emoji: '📝', title: '快速問卷', sub: '回答 3 個問題，全程用點的', badge: '3 步' },
        { key: 'ai', emoji: '✨', title: 'AI 幫我規劃', sub: '描述你的目標，AI 客製化', badge: '客製化' },
      ].map(c => (
        <div key={c.key} className="cozy-card" onClick={() => setEntry(c.key)}
          style={{ ...S.card, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, border: `2px solid ${c.hi ? C.leaf : C.border}`, background: c.hi ? '#E6F2EB' : C.paper }}>
          <div style={{ fontSize: 34 }}>{c.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{c.title}</div>
            <div style={{ ...S.muted, fontSize: 13, marginTop: 2 }}>{c.sub}</div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: c.hi ? C.leaf : C.muted, background: c.hi ? '#CDE7D8' : '#FDFBF7', padding: '4px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>{c.badge}</div>
        </div>
      ))}
    </div></div>
  );

  // ── Mode 1: quick-start template wall (zero typing) ──
  if (entry === 'quick') {
    const toggle = i => setQuickSel(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
    return (
      <div style={S.bg}><div style={S.app}>
        {header('快速開始', <>挑幾個想養成的<br />好習慣</>, '點一下就選取，選完直接建立（可多選）')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          {QUICK_TEMPLATES.map((t, i) => {
            const sel = quickSel.has(i);
            return (
              <div key={i} className="cozy-card" onClick={() => toggle(i)}
                style={{ ...S.card, marginBottom: 0, padding: 16, cursor: 'pointer', textAlign: 'center', border: `1.5px solid ${sel ? C.leaf : C.border}`, background: sel ? '#E6F2EB' : C.paper }}>
                <div style={{ fontSize: 30, marginBottom: 6 }}>{t.emoji}</div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{t.title}</div>
                <div style={{ ...S.muted, fontSize: 12, marginTop: 2 }}>{t.desc}</div>
                {sel && <div style={{ color: C.leaf, fontWeight: 700, marginTop: 6 }}>✓</div>}
              </div>
            );
          })}
        </div>
        <button style={{ ...S.btn('primary'), width: '100%', marginTop: 20 }} disabled={loading}
          onClick={() => createAll([...quickSel].map(i => habitRow(QUICK_TEMPLATES[i])), { mode: 'quick' })}>
          {loading ? '建立中…' : `建立${quickSel.size ? ` (${quickSel.size})` : ''} →`}
        </button>
      </div></div>
    );
  }

  // ── Mode 2: quick questionnaire (≤3 chip-only steps) ──
  if (entry === 'survey') {
    const chosen = SURVEY_DOMAINS.filter(d => domains.includes(d.key));
    const toggleDomain = k => setDomains(a => a.includes(k) ? a.filter(x => x !== k) : [...a, k]);
    const toggleHab = k => setSurveySel(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
    const rows = () => {
      const out = [];
      chosen.forEach(d => d.habits.forEach((h, hi) => { if (surveySel.has(`${d.key}-${hi}`)) out.push(habitRow(h)); }));
      customHabits.forEach(c => out.push(habitRow({ emoji: '⭐', title: c, desc: '', difficulty: 'medium', frequency: { type: 'daily' }, goal_label: '自訂' })));
      return out;
    };
    const addCustom = () => { const v = customText.trim(); if (!v) return; setCustomHabits(a => [...a, v]); setCustomText(''); };
    const startMic = () => {
      if (!SpeechRec) return;
      try {
        const rec = new SpeechRec();
        rec.lang = 'zh-TW'; rec.interimResults = false; rec.maxAlternatives = 1;
        rec.onresult = e => setCustomText(e.results[0][0].transcript);
        rec.onerror = () => toast('語音辨識失敗，請再試一次');
        rec.start(); recRef.current = rec;
      } catch { toast('語音辨識無法啟動'); }
    };

    const steps = [
      // Step 0: pick domains
      <div key={0}>
        {header('快速問卷', <>你想從哪些<br />領域開始？</>, '選擇你感興趣的方向（可多選）')}
        <div className="cozy-card" style={S.card}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SURVEY_DOMAINS.map(d => (
              <div key={d.key} style={S.chip(domains.includes(d.key))} onClick={() => toggleDomain(d.key)}>{d.emoji} {d.key}</div>
            ))}
          </div>
        </div>
        <button style={{ ...S.btn('primary'), width: '100%', marginTop: 8 }} onClick={() => { if (!domains.length) { toast('請至少選一個領域'); return; } setSurveyStep(1); }}>繼續 →</button>
      </div>,
      // Step 1: pick concrete habits + custom (with mic)
      <div key={1}>
        {header('快速問卷', <>挑選具體<br />習慣</>, '每個領域選你想做的，或自己新增')}
        {chosen.map(d => (
          <div key={d.key} className="cozy-card" style={S.card}>
            <label style={S.label}>{d.emoji} {d.key}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {d.habits.map((h, hi) => {
                const k = `${d.key}-${hi}`;
                return <div key={k} style={S.chip(surveySel.has(k))} onClick={() => toggleHab(k)}>{h.emoji} {h.title}</div>;
              })}
            </div>
          </div>
        ))}
        <div className="cozy-card" style={S.card}>
          <label style={S.label}>自訂習慣（選填）</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input style={{ ...S.input, flex: 1 }} placeholder="例：每天散步 15 分鐘" value={customText}
              onChange={e => setCustomText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustom()} />
            {SpeechRec && <button onClick={startMic} title="語音輸入" style={{ ...S.btn('secondary'), padding: '0 14px' }}>🎤</button>}
            <button onClick={addCustom} style={{ ...S.btn('secondary'), padding: '0 16px' }}>＋</button>
          </div>
          {customHabits.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {customHabits.map((c, ci) => (
                <span key={ci} style={{ ...S.chip(true), display: 'inline-flex', gap: 6 }}>
                  ⭐ {c}<span onClick={() => setCustomHabits(a => a.filter((_, x) => x !== ci))} style={{ cursor: 'pointer' }}>×</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ ...S.row, marginTop: 8 }}>
          <button style={S.btn('secondary')} onClick={() => setSurveyStep(0)}>← 返回</button>
          <button style={{ ...S.btn('primary'), flex: 1 }} onClick={() => { if (!rows().length) { toast('請至少選一個習慣'); return; } setSurveyStep(2); }}>繼續 →</button>
        </div>
      </div>,
      // Step 2: confirm + create
      (() => {
        const r = rows();
        return (
          <div key={2}>
            {header('快速問卷', <>確認你的<br />習慣清單</>, `共 ${r.length} 個習慣，開始養成吧`)}
            {r.map((h, ri) => (
              <div key={ri} className="cozy-card" style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, fontWeight: 600 }}>{h.title}</div>
                <span style={{ ...S.muted, fontSize: 12 }}>{h.frequency.type === 'daily' ? '每天' : `每週 ${h.frequency.times} 次`}</span>
              </div>
            ))}
            <div style={{ ...S.row, marginTop: 8 }}>
              <button style={S.btn('secondary')} onClick={() => setSurveyStep(1)}>← 返回</button>
              <button style={{ ...S.btn('primary'), flex: 1 }} disabled={loading} onClick={() => createAll(r, { mode: 'survey', domains })}>{loading ? '建立中…' : '建立我的習慣 →'}</button>
            </div>
          </div>
        );
      })(),
    ];
    return <div style={S.bg}><div style={S.app}>{steps[surveyStep]}</div></div>;
  }

  // ── Mode 3: AI planning (condensed to 3 steps, with fallback on failure) ──
  const validGoals = goals.filter(g => g.text.trim());
  const toggleArr = (arr, set) => v => set(a => a.includes(v) ? a.filter(x => x !== v) : [...a, v]);

  const generate = async () => {
    setAiStep(2); setLoading(true); setAiError(false); setSuggestions([]);
    try {
      const goalsText = validGoals.map((g, i) =>
        `目標${i + 1}：${g.category ? `【${g.category}】` : ''}${g.text}` +
        (g.deadline ? `，希望在${g.deadline}達成` : '') +
        (g.level ? `，目前程度：${g.level}` : '') +
        (g.timePerDay ? `，每天可投入：${g.timePerDay}` : '')
      ).join('\n');
      const prompt = `你是一位專業的習慣設計師。請根據以下使用者資訊，為他設計每日微習慣計劃。

【使用者資料】
名字：${name || '朋友'}
具體目標：
${goalsText}
最佳作息時段：${schedule.join('、') || '未填寫'}
主要障礙：${obstacles.join('、') || '未填寫'}
學習風格：${style.length ? style.join('、') : '未填寫'}

【設計原則】
1. 每個習慣必須「非常具體」，包含：具體行動 + 工具/方式 + 時間長度 + 執行時機
2. 習慣要直接對應使用者的目標，不能泛泛而談
3. 要針對使用者的障礙設計克服策略
4. 習慣要小到「今天就能開始」

請回傳純 JSON 陣列（不含任何 markdown 或其他文字），提供 6 個習慣建議：
[
  {
    "title": "習慣名稱（10字以內）",
    "description": "具體執行方式：什麼時候、用什麼工具、做什麼、做多久",
    "why": "這個習慣如何幫助達成目標（1句話）",
    "difficulty": "easy|medium|hard",
    "duration": "每天所需時間",
    "timing": "建議執行時機",
    "goal_index": 0
  }
]
goal_index 對應上面目標的序號（從 0 開始）`;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await res.json();
      if (!res.ok || !data.content) throw new Error(data.error?.message || data.error || `API error ${res.status}`);
      const text = data.content.map(i => i.text || '').join('').replace(/```json|```/g, '').trim();
      setSuggestions(JSON.parse(text));
    } catch (e) {
      console.error('AI generate error:', e);
      setAiError(true);
    }
    setLoading(false);
  };

  const buildAiRows = () => [...selected].map(idx => {
    const h = suggestions[idx];
    return {
      title: h.title,
      description: `${h.description}${h.why ? '｜' + h.why : ''}`,
      difficulty: h.difficulty,
      fund_per_day: diffFund(h.difficulty),
      frequency: { type: 'daily' },
      goal_label: validGoals[Number(h.goal_index)]?.text || null,
      is_active: true,
    };
  });

  const aiSteps = [
    // Step 0: goals (+ optional name)
    <div key={0}>
      {header('AI 規劃', <>告訴我你的<br />目標</>, '越具體，AI 的建議越貼近你')}
      <div className="cozy-card" style={S.card}>
        <label style={S.label}>你的名字（選填）</label>
        <input style={S.input} placeholder="怎麼稱呼你？" value={name} onChange={e => setName(e.target.value)} />
      </div>
      {goals.map((g, i) => (
        <GoalCard key={i} index={i} goal={g}
          onChange={v => setGoals(gs => v === null ? gs.filter((_, x) => x !== i) : gs.map((g2, x) => x === i ? v : g2))} />
      ))}
      {goals.length < 3 && (
        <button onClick={() => setGoals(g => [...g, { category: '', text: '', deadline: '', level: '', timePerDay: '' }])}
          style={{ width: '100%', padding: 16, background: 'none', border: '1.5px dashed #EADFCF', borderRadius: 16, cursor: 'pointer', color: '#A08B7A', fontSize: 14, fontFamily: 'inherit', marginBottom: 14 }}>
          + 新增目標（最多 3 個）
        </button>
      )}
      <button style={{ ...S.btn('primary'), width: '100%' }} onClick={() => { if (!validGoals.length) { toast('請至少填寫一個目標'); return; } setAiStep(1); }}>繼續 →</button>
    </div>,
    // Step 1: rhythm + challenges (one screen)
    <div key={1}>
      {header('AI 規劃', <>你的節奏與<br />挑戰</>, '幫 AI 把習慣排進你的生活（皆可多選）')}
      <div className="cozy-card" style={S.card}>
        <label style={S.label}>最佳執行時段</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{SCHEDULE_OPTIONS.map(o => <div key={o} style={S.chip(schedule.includes(o))} onClick={() => toggleArr(schedule, setSchedule)(o)}>{o}</div>)}</div>
      </div>
      <div className="cozy-card" style={S.card}>
        <label style={S.label}>主要障礙</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{OBSTACLE_OPTIONS.map(o => <div key={o} style={S.chip(obstacles.includes(o))} onClick={() => toggleArr(obstacles, setObstacles)(o)}>{o}</div>)}</div>
      </div>
      <div className="cozy-card" style={S.card}>
        <label style={S.label}>激勵風格（選填）</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>{STYLE_OPTIONS.map(o => <div key={o} style={S.chip(style.includes(o))} onClick={() => toggleArr(style, setStyle)(o)}>{o}</div>)}</div>
      </div>
      <div style={{ ...S.row, marginTop: 8 }}>
        <button style={S.btn('secondary')} onClick={() => setAiStep(0)}>← 返回</button>
        <button style={{ ...S.btn('primary'), flex: 1 }} disabled={loading} onClick={generate}>{loading ? '分析中…' : '生成我的習慣 ✦'}</button>
      </div>
    </div>,
    // Step 2: suggestions / loading / graceful failure fallback
    <div key={2}>
      {header('AI 規劃', <>專屬你的<br />每日微習慣</>, loading || aiError ? '' : '選擇你想開始的（可多選）')}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 56, color: '#A08B7A' }}>
          <div style={{ fontSize: 36, marginBottom: 16, animation: 'spin 2s linear infinite', display: 'inline-block' }}>✦</div>
          <p style={{ fontWeight: 500 }}>正在為你設計習慣…</p>
        </div>
      ) : aiError ? (
        <div className="cozy-card" style={{ ...S.card, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌧️</div>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>AI 暫時累了</div>
          <p style={{ ...S.muted, fontSize: 13, lineHeight: 1.7, marginBottom: 18 }}>沒關係，我們可以先從熱門習慣開始，<br />之後隨時能再讓 AI 幫你規劃。</p>
          <button style={{ ...S.btn('primary'), width: '100%' }} onClick={() => { setAiError(false); setEntry('quick'); }}>⚡ 改用快速開始 →</button>
          <button style={{ ...S.btn('secondary'), width: '100%', marginTop: 10 }} onClick={generate}>再試一次</button>
        </div>
      ) : (
        <>
          {suggestions.map((h, idx) => {
            const sel = selected.has(idx);
            return (
              <div key={idx} className="cozy-card"
                onClick={() => setSelected(s => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; })}
                style={{ ...S.card, cursor: 'pointer', border: `1.5px solid ${sel ? '#5AA37F' : '#EADFCF'}`, background: sel ? '#E6F2EB' : '#FFFDF9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ background: diffBg(h.difficulty), color: diffColor(h.difficulty), padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 500 }}>{diffLabel(h.difficulty)}</span>
                  {h.duration && <span style={{ color: '#A08B7A', fontSize: 12 }}>{h.duration}</span>}
                  {h.timing && <span style={{ color: '#A08B7A', fontSize: 12 }}>⏰ {h.timing}</span>}
                  <div style={{ flex: 1 }} />
                  {sel && <span style={{ color: '#5AA37F', fontWeight: 700, fontSize: 16 }}>✓</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{h.title}</div>
                <div style={{ fontSize: 13, color: '#6B5A4C', lineHeight: 1.6, marginBottom: 6 }}>{h.description}</div>
                {h.why && <div style={{ fontSize: 12, color: '#5AA37F', background: '#E6F2EB', padding: '4px 10px', borderRadius: 8, display: 'inline-block' }}>💡 {h.why}</div>}
              </div>
            );
          })}
          <div style={{ ...S.row, marginTop: 8 }}>
            <button style={S.btn('secondary')} onClick={() => setAiStep(1)}>← 返回</button>
            <button style={{ ...S.btn('primary'), flex: 1 }} disabled={loading} onClick={() => createAll(buildAiRows(), { mode: 'ai', goals, schedule, obstacles, style })}>開始我的旅程 →</button>
          </div>
        </>
      )}
    </div>,
  ];

  return <div style={S.bg}><div style={S.app}>{aiSteps[aiStep]}</div></div>;
}


// ── Password settings card (for magic-link accounts) ─────
function PasswordCard({ toast }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (pw.length < 8) { toast('密碼至少需要 8 個字'); return; }
    if (pw !== pw2) { toast('兩次輸入的密碼不一樣'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast('設定失敗：' + error.message); return; }
    toast('🔑 密碼已設定，下次可直接用密碼登入');
    setPw(''); setPw2(''); setOpen(false);
  };

  return (
    <div className="cozy-card" style={{ ...S.card, marginTop: 14 }}>
      <div style={{ ...S.row, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ fontWeight: 500, fontSize: 15 }}>🔑 密碼</div>
        <span style={{ ...S.muted, fontSize: 12, marginLeft: 'auto' }}>{open ? '收起' : '設定 / 修改'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <input style={S.input} type="password" autoComplete="new-password" placeholder="新密碼（至少 8 個字）"
            value={pw} onChange={e => setPw(e.target.value)} />
          <input style={{ ...S.input, marginTop: 8 }} type="password" autoComplete="new-password" placeholder="再輸入一次"
            value={pw2} onChange={e => setPw2(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} />
          <button style={{ ...S.btn('primary'), width: '100%', marginTop: 10 }} onClick={save} disabled={busy}>
            {busy ? '儲存中…' : '儲存密碼'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Month Calendar (all habits merged into one) ──────────
const HABIT_DOT_COLORS = ['#A8D8B9', '#FBE790', '#A5DEE4', '#E8A08A', '#C9A98F', '#B5A8D9'];

function MonthCalendar({ habits, checkins }) {
  const [offset, setOffset] = useState(0); // 0 = this month, negative = past months
  const days = ['日','一','二','三','四','五','六'];
  const today = todayStr();

  const base = new Date(); base.setHours(0, 0, 0, 0);
  const first = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const year = first.getFullYear();
  const month = first.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const colorOf = {};
  habits.forEach((h, i) => { colorOf[h.id] = HABIT_DOT_COLORS[i % HABIT_DOT_COLORS.length]; });

  const byDate = {};
  checkins.forEach(c => {
    if (!colorOf[c.habit_id]) return; // ignore checkins of deleted habits
    (byDate[c.checked_date] = byDate[c.checked_date] || []).push(c.habit_id);
  });

  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  const arrow = (label, enabled, onClick) => (
    <button onClick={enabled ? onClick : undefined} style={{
      border: '1.6px solid #EADFCF', background: '#FFFDF9', color: '#8A6B58',
      borderRadius: '10px 6px 12px 7px', width: 30, height: 30, fontSize: 15, lineHeight: 1,
      cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.3, padding: 0,
    }}>{label}</button>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        {arrow('‹', true, () => setOffset(o => o - 1))}
        <div style={{ fontFamily: "'Zen Maru Gothic', sans-serif", fontWeight: 700, fontSize: 15, color: '#6B5544' }}>
          {year} 年 {month + 1} 月
        </div>
        {arrow('›', offset < 0, () => setOffset(o => o + 1))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
        {days.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 10, color: '#A08B7A', fontWeight: 500 }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
        {cells.map((ds, i) => {
          const ids = ds ? (byDate[ds] || []) : [];
          const isFuture = ds && offset === 0 && ds > today;
          return (
            <div key={i} style={{
              aspectRatio: '1', borderRadius: 8, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
              outline: ds === today ? '2px solid #5AA37F' : 'none', outlineOffset: -2,
              opacity: ds ? (isFuture ? 0.35 : 1) : 0,
            }}>
              <div style={{ fontSize: 11, color: '#8A6B58' }}>{ds ? parseInt(ds.slice(8), 10) : ''}</div>
              <div style={{ display: 'flex', gap: 2, height: 5, alignItems: 'center' }}>
                {ids.slice(0, 4).map((id, j) => (
                  <span key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: colorOf[id], display: 'inline-block' }} />
                ))}
                {ids.length > 4 && <span style={{ fontSize: 8, color: '#A08B7A' }}>+{ids.length - 4}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {habits.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 10 }}>
          {habits.map(h => (
            <span key={h.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#8A6B58' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: colorOf[h.id], display: 'inline-block' }} />
              {h.title}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={S.modalBg} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={{ width: 40, height: 4, background: '#EADFCF', borderRadius: 2, margin: '0 auto 24px' }} />
        <div style={{ ...S.h2, marginBottom: 20 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

// ── SMART Review helper ───────────────────────────────────
async function callSmartReview(goals) {
  const goalLines = goals.map((g, i) =>
    `目標${i + 1}：${g.category ? `【${g.category}】` : ''}${g.text}` +
    (g.deadline ? `，期限：${g.deadline}` : '') +
    (g.timePerDay ? `，每天可投入：${g.timePerDay}` : '')
  ).join('\n');

  const prompt = `分析以下目標清單，為每個目標進行 SMART 分析。回傳純 JSON 陣列（不含 markdown），陣列長度必須等於目標數量：
[
  {
    "specific": "從目標中提取的具體描述，或 null 若不夠具體",
    "measurable": "可衡量的具體指標（數字/標準），或 null 若缺少",
    "timeBound": "從目標中提取的時限，或 null 若未提及",
    "identity": "建議身份認同句，以「我是一個」開頭，20字以內",
    "rewrite": "若目標太模糊，提供更具體的改寫建議；否則為 null"
  }
]

目標清單：
${goalLines}`;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  if (!res.ok || !data.content) throw new Error(data.error?.message || 'API error');
  const text = data.content.map(i => i.text || '').join('').replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

// ── Quick Add Habit Modal (manual, no AI) ─────────────────
function QuickAddModal({ user, onClose, onSaved, onUseAI, toast }) {
  const [title, setTitle] = useState('');
  const [freqType, setFreqType] = useState('daily'); // 'daily' | 'weekly'
  const [times, setTimes] = useState(3);
  const [difficulty, setDifficulty] = useState('medium');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!title.trim()) { toast('請填寫習慣名稱'); return; }
    setBusy(true);
    try {
      await supa.post('habits', {
        user_id: user.id,
        title: title.trim(),
        description: desc.trim(),
        difficulty,
        fund_per_day: diffFund(difficulty),
        is_active: true,
        goal_label: null,
        frequency: freqType === 'weekly' ? { type: 'weekly', times } : { type: 'daily' },
      });
      await onSaved();
      onClose();
      toast('已新增 ✨');
    } catch { toast('新增失敗'); }
    setBusy(false);
  };

  return (
    <div style={S.modalBg} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={{ width: 40, height: 4, background: '#EADFCF', borderRadius: 2, margin: '0 auto 24px' }} />
        <div style={{ ...S.h2, marginBottom: 20 }}>快速新增習慣</div>

        <label style={S.label}>習慣名稱</label>
        <input autoFocus style={{ ...S.input, marginTop: 4, marginBottom: 14 }}
          value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：每天喝水 2000ml" />

        <label style={S.label}>頻率</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 14 }}>
          <div style={S.chip(freqType === 'daily')} onClick={() => setFreqType('daily')}>每天</div>
          <div style={S.chip(freqType === 'weekly')} onClick={() => setFreqType('weekly')}>每週</div>
        </div>
        {freqType === 'weekly' && (
          <div style={{ ...S.row, marginBottom: 14 }}>
            <button style={S.btn('secondary')} onClick={() => setTimes(n => Math.max(1, n - 1))}>−</button>
            <span style={{ fontSize: 15, fontWeight: 600 }}>每週 {times} 次</span>
            <button style={S.btn('secondary')} onClick={() => setTimes(n => Math.min(7, n + 1))}>＋</button>
          </div>
        )}

        <label style={S.label}>難度</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, marginBottom: 14 }}>
          {['easy', 'medium', 'hard'].map(d => (
            <div key={d} style={S.chip(difficulty === d)} onClick={() => setDifficulty(d)}>{diffLabel(d)}</div>
          ))}
        </div>

        <label style={S.label}>描述（選填）</label>
        <input style={{ ...S.input, marginTop: 4, marginBottom: 20 }}
          value={desc} onChange={e => setDesc(e.target.value)} placeholder="一行說明，例如：起床後先喝一杯水" />

        <button style={{ ...S.btn('primary'), width: '100%', justifyContent: 'center' }} onClick={create} disabled={busy}>
          {busy ? '建立中…' : '建立'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 14 }}>
          <span onClick={onUseAI} style={{ fontSize: 12, color: '#A08B7A', cursor: 'pointer', textDecoration: 'underline' }}>
            ✨ 用 AI 幫我設計習慣
          </span>
        </p>
      </div>
    </div>
  );
}

// ── Add Habit Modal (AI-assisted) ────────────────────────
function AddHabitModal({ user, onClose, onSaved, toast }) {
  const [step, setStep] = useState(0); // 0=choose, 1=pick/create goal, 2=suggestions
  const [mode, setMode] = useState(null); // 'existing' | 'new'
  const [selectedGoal, setSelectedGoal] = useState(null); // {text, category}
  const [newGoal, setNewGoal] = useState({ category: '', text: '', timePerDay: '' });
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [freqMap, setFreqMap] = useState({}); // idx -> {type, times}
  const [cueMap, setCueMap] = useState({});   // idx -> string
  const [rewardMap, setRewardMap] = useState({}); // idx -> string
  const [newGoalReview, setNewGoalReview] = useState(null); // SMART review for new goal
  const [newGoalIdentity, setNewGoalIdentity] = useState('');
  const [newGoalMeasurable, setNewGoalMeasurable] = useState('');

  const userGoals = (user.values_answers?.goals || []).filter(g => g.text?.trim());

  const generateSuggestions = async (goal) => {
    setStep(2); setLoading(true);
    try {
      const prompt = `你是習慣設計師。請針對以下單一目標，設計 5 個每日或每週微習慣。

目標：${goal.category ? `【${goal.category}】` : ''}${goal.text}
${goal.timePerDay ? `每天可投入時間：${goal.timePerDay}` : ''}
${goal.identity ? `身份認同：${goal.identity}` : ''}

請回傳純 JSON 陣列（不含 markdown）：
[
  {
    "title": "習慣名稱（10字以內）",
    "description": "具體執行方式：什麼時候、用什麼工具、做什麼、做多久",
    "why": "如何幫助達成目標（1句話）",
    "difficulty": "easy|medium|hard",
    "suggested_frequency": "daily|weekly",
    "suggested_times": 3,
    "cue": "習慣堆疊觸發時機，格式：在「___」之後（10字以內，例：早上刷牙後）",
    "reward": "完成後的即時小獎勵（10字以內，例：喝一杯喜歡的飲料）"
  }
]
suggested_frequency 為 weekly 時，suggested_times 為每週建議次數（1-7）。`;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await res.json();
      if (!res.ok || !data.content) throw new Error(data.error?.message || 'API error');
      const text = data.content.map(i => i.text || '').join('').replace(/```json|```/g, '').trim();
      setSuggestions(JSON.parse(text));
      // init freqMap with suggested defaults
      const fm = {};
      JSON.parse(text).forEach((s, i) => {
        fm[i] = s.suggested_frequency === 'weekly'
          ? { type: 'weekly', times: s.suggested_times || 3 }
          : { type: 'daily' };
      });
      setFreqMap(fm);
      const cm = {}, rm = {};
      JSON.parse(text).forEach((s, i) => {
        cm[i] = s.cue || '';
        rm[i] = s.reward || '';
      });
      setCueMap(cm);
      setRewardMap(rm);
    } catch (e) {
      console.error(e);
      toast('建議生成失敗，請重試');
      setStep(1);
    }
    setLoading(false);
  };

  const handleGoalChosen = (goal) => {
    setSelectedGoal(goal);
    generateSuggestions(goal);
  };

  const handleNewGoalSubmit = async () => {
    if (!newGoal.text.trim()) { toast('請填寫目標'); return; }
    setLoading(true);
    try {
      const [review] = await callSmartReview([newGoal]);
      setNewGoalReview(review);
      setNewGoalIdentity(review.identity || '');
      setNewGoalMeasurable(review.measurable || '');
      setStep('1b-smart');
    } catch (e) {
      console.error(e);
      toast('目標分析失敗，請重試');
    }
    setLoading(false);
  };

  const confirmNewGoalSmart = async () => {
    if (!newGoalMeasurable.trim()) { toast('請填寫可衡量指標'); return; }
    const enrichedGoal = {
      ...newGoal,
      identity: newGoalIdentity,
      smart: {
        specific: newGoalReview.specific,
        measurable: newGoalMeasurable,
        timeBound: newGoalReview.timeBound,
      }
    };
    // Save enriched goal to user's values_answers
    const va = user.values_answers || {};
    const updatedGoals = [...(va.goals || []), enrichedGoal];
    try {
      await supa.patch('users', `id=eq.${user.id}`, {
        values_answers: { ...va, goals: updatedGoals }
      });
      user.values_answers = { ...va, goals: updatedGoals };
    } catch { toast('儲存目標失敗'); return; }
    setSelectedGoal(enrichedGoal);
    generateSuggestions(enrichedGoal);
  };

  const saveSelected = async () => {
    if (!selected.size) { toast('請至少選擇一個習慣'); return; }
    setLoading(true);
    const goal = selectedGoal || newGoal;
    try {
      for (const idx of selected) {
        const h = suggestions[idx];
        const freq = freqMap[idx] || { type: 'daily' };
        const cue = cueMap[idx] || '';
        const reward = rewardMap[idx] || '';
        const descParts = [
          h.description,
          h.why ? h.why : null,
          cue ? `觸發：${cue}` : null,
          reward ? `獎勵：${reward}` : null,
        ].filter(Boolean);
        await supa.post('habits', {
          user_id: user.id,
          title: h.title,
          description: descParts.join('｜'),
          difficulty: h.difficulty,
          fund_per_day: diffFund(h.difficulty),
          goal_label: goal.text,
          frequency: freq,
        });
      }
      toast('習慣新增成功 🌱');
      onSaved();
      onClose();
    } catch { toast('新增失敗'); }
    setLoading(false);
  };

  return (
    <div style={S.modalBg} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modal, maxHeight: '90vh' }}>
        <div style={{ width: 40, height: 4, background: '#EADFCF', borderRadius: 2, margin: '0 auto 24px' }} />

        {/* Step 0: Choose mode */}
        {step === 0 && (
          <>
            <div style={{ ...S.h2, marginBottom: 20 }}>新增習慣</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <button
                className="cozy-card" style={{ ...S.card, cursor: 'pointer', border: '1.5px solid #5AA37F', textAlign: 'center', padding: 20 }}
                onClick={() => { setMode('existing'); setStep(1); }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>🎯</div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>加到現有目標</div>
                <div style={{ fontSize: 12, color: '#A08B7A', marginTop: 4 }}>AI 針對你的目標建議習慣</div>
              </button>
              <button
                className="cozy-card" style={{ ...S.card, cursor: 'pointer', border: '1.5px solid #D98368', textAlign: 'center', padding: 20 }}
                onClick={() => { setMode('new'); setStep(1); }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>✨</div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>建立新目標</div>
                <div style={{ fontSize: 12, color: '#A08B7A', marginTop: 4 }}>設定新目標並生成習慣</div>
              </button>
            </div>
          </>
        )}

        {/* Step 1a: Pick existing goal */}
        {step === 1 && mode === 'existing' && (
          <>
            <div style={{ ...S.h2, marginBottom: 16 }}>選擇目標</div>
            {userGoals.length === 0 ? (
              <p style={S.muted}>還沒有設定目標，請選「建立新目標」</p>
            ) : userGoals.map(g => (
              <div key={g.text}
                className="cozy-card" style={{ ...S.card, cursor: 'pointer', marginBottom: 10 }}
                onClick={() => handleGoalChosen(g)}
              >
                <div style={{ ...S.row }}>
                  <span style={{ fontSize: 20 }}>{GOAL_CATEGORIES.find(c => c.label === g.category)?.emoji || '🎯'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{g.text}</div>
                    {g.category && <div style={{ fontSize: 12, color: '#A08B7A' }}>{g.category}</div>}
                  </div>
                  <span style={{ color: '#A08B7A' }}>→</span>
                </div>
              </div>
            ))}
            <button style={{ ...S.btn('secondary'), marginTop: 8 }} onClick={() => setStep(0)}>← 返回</button>
          </>
        )}

        {/* Step 1b: Create new goal */}
        {step === 1 && mode === 'new' && (
          <>
            <div style={{ ...S.h2, marginBottom: 16 }}>新目標</div>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>類別</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {GOAL_CATEGORIES.map(c => (
                  <div key={c.label}
                    style={{ ...S.chip(newGoal.category === c.label), fontSize: 12, padding: '5px 10px' }}
                    onClick={() => setNewGoal(g => ({ ...g, category: c.label }))}>
                    {c.emoji} {c.label}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>具體目標 *</label>
              <input style={S.input} placeholder="例：考 JLPT N2" value={newGoal.text}
                onChange={e => setNewGoal(g => ({ ...g, text: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={S.label}>每天可投入時間</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {['15 分鐘以內', '30 分鐘', '1 小時', '1-2 小時', '彈性不固定'].map(o => (
                  <div key={o} style={{ ...S.chip(newGoal.timePerDay === o), fontSize: 12, padding: '5px 10px' }}
                    onClick={() => setNewGoal(g => ({ ...g, timePerDay: o }))}>{o}</div>
                ))}
              </div>
            </div>
            <div style={S.row}>
              <button style={{ ...S.btn('secondary'), flex: 1 }} onClick={() => setStep(0)}>← 返回</button>
              <button style={{ ...S.btn('primary'), flex: 1 }} onClick={handleNewGoalSubmit} disabled={loading}>{loading ? '分析中…' : '生成習慣建議 ✦'}</button>
            </div>
          </>
        )}

        {/* Step 1b-smart: SMART review for new goal */}
        {step === '1b-smart' && newGoalReview && (
          <>
            <div style={{ ...S.h2, marginBottom: 8 }}>目標審視</div>
            <p style={{ ...S.muted, fontSize: 13, marginBottom: 16 }}>確認你的目標具體可執行</p>
            <div className="cozy-card" style={S.card}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 12 }}>
                {GOAL_CATEGORIES.find(c => c.label === newGoal.category)?.emoji || '🎯'} {newGoal.text}
              </div>
              {newGoalReview.rewrite && (
                <div style={{ background: '#FBF3D8', border: '1px solid #EBD9B2', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#C89043' }}>
                  💡 建議改寫：「{newGoalReview.rewrite}」
                </div>
              )}
              {[
                { label: 'S 具體', value: newGoalReview.specific },
                { label: 'T 有時限', value: newGoalReview.timeBound },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{value ? '✅' : '❌'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#A08B7A', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13, color: value ? '#4A3B31' : '#A08B7A' }}>
                      {value || '未偵測到，可在確認後補充'}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{newGoalReview.measurable ? '✅' : '❌'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#A08B7A', marginBottom: 3 }}>M 可衡量 *</div>
                  {newGoalReview.measurable ? (
                    <input style={{ ...S.input, fontSize: 13 }} value={newGoalMeasurable}
                      onChange={e => setNewGoalMeasurable(e.target.value)} />
                  ) : (
                    <input style={{ ...S.input, fontSize: 13 }}
                      placeholder="請填入具體數字或標準，例：每週跑 3 次"
                      value={newGoalMeasurable}
                      onChange={e => setNewGoalMeasurable(e.target.value)} />
                  )}
                </div>
              </div>
              <div>
                <label style={S.label}>身份認同句</label>
                <input style={{ ...S.input, marginTop: 6 }}
                  value={newGoalIdentity}
                  onChange={e => setNewGoalIdentity(e.target.value)}
                  placeholder="我是一個..." />
              </div>
            </div>
            <div style={{ ...S.row, marginTop: 16 }}>
              <button style={{ ...S.btn('secondary'), flex: 1 }} onClick={() => { setStep(1); setNewGoalReview(null); }}>← 返回</button>
              <button style={{ ...S.btn('primary'), flex: 1 }} onClick={confirmNewGoalSmart} disabled={loading}>
                生成習慣建議 ✦
              </button>
            </div>
          </>
        )}

        {/* Step 2: AI suggestions */}
        {step === 2 && (
          <>
            <div style={{ ...S.h2, marginBottom: 8 }}>習慣建議</div>
            <p style={{ ...S.muted, fontSize: 13, marginBottom: 16 }}>選擇你想開始的習慣，並設定頻率</p>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#A08B7A' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
                <p>AI 正在生成建議…</p>
              </div>
            ) : (
              <>
                {suggestions.map((h, idx) => {
                  const isSel = selected.has(idx);
                  const freq = freqMap[idx] || { type: 'daily' };
                  return (
                    <div key={idx}
                      className="cozy-card" style={{ ...S.card, cursor: 'pointer', border: `1.5px solid ${isSel ? '#5AA37F' : '#EADFCF'}`, background: isSel ? '#E6F2EB' : '#FFFDF9', marginBottom: 10 }}
                      onClick={() => setSelected(s => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; })}>
                      <div style={{ ...S.row, marginBottom: 6 }}>
                        <span style={{ background: diffBg(h.difficulty), color: diffColor(h.difficulty), padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 500 }}>{diffLabel(h.difficulty)}</span>
                        <div style={{ flex: 1 }} />
                        {isSel && <span style={{ color: '#5AA37F', fontWeight: 700 }}>✓</span>}
                      </div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{h.title}</div>
                      <div style={{ fontSize: 13, color: '#6B5A4C', lineHeight: 1.6, marginBottom: 8 }}>{h.description}</div>
                      {h.why && <div style={{ fontSize: 12, color: '#5AA37F', background: '#E6F2EB', padding: '4px 10px', borderRadius: 8, display: 'inline-block', marginBottom: 10 }}>💡 {h.why}</div>}
                      {/* Cue + Reward */}
                      <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, borderTop: '1px solid #EADFCF', paddingTop: 10 }}>
                        <div style={{ marginBottom: 10 }}>
                          <label style={S.label}>觸發提示（習慣堆疊）</label>
                          <input
                            style={{ ...S.input, fontSize: 13, marginTop: 4 }}
                            placeholder="在「___」之後，我會做這個習慣"
                            value={cueMap[idx] || ''}
                            onChange={e => setCueMap(m => ({ ...m, [idx]: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label style={S.label}>即時小獎勵（選填）</label>
                          <input
                            style={{ ...S.input, fontSize: 13, marginTop: 4 }}
                            placeholder="完成後：例如喝一杯喜歡的飲料"
                            value={rewardMap[idx] || ''}
                            onChange={e => setRewardMap(m => ({ ...m, [idx]: e.target.value }))}
                          />
                        </div>
                      </div>
                      {/* Frequency selector — always visible */}
                      <div onClick={e => e.stopPropagation()} style={{ marginTop: 10 }}>
                        <label style={S.label}>頻率</label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                          <div style={S.chip(freq.type === 'daily')}
                            onClick={() => setFreqMap(m => ({ ...m, [idx]: { type: 'daily' } }))}>每天</div>
                          {[2, 3, 4, 5].map(n => (
                            <div key={n} style={S.chip(freq.type === 'weekly' && freq.times === n)}
                              onClick={() => setFreqMap(m => ({ ...m, [idx]: { type: 'weekly', times: n } }))}>
                              每週 {n} 次
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ ...S.row, marginTop: 8 }}>
                  <button style={{ ...S.btn('secondary'), flex: 1 }} onClick={() => setStep(1)}>← 返回</button>
                  <button style={{ ...S.btn('primary'), flex: 1 }} onClick={saveSelected} disabled={loading}>
                    新增選取的習慣
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Chain Broken Modal ────────────────────────────────────
function ChainBrokenModal({ broken, onDismiss }) {
  const [idx, setIdx] = useState(0);
  if (!broken.length) return null;
  const item = broken[idx];

  const next = () => {
    if (idx + 1 < broken.length) setIdx(i => i + 1);
    else onDismiss();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#4A3B31', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>😢</div>
        <div style={{ fontFamily: "'Zen Maru Gothic', 'DM Sans', sans-serif", fontSize: '2rem', color: '#FFFDF9', marginBottom: 20 }}>哭哭</div>
        <div style={{ color: '#A08B7A', fontSize: 14, marginBottom: 6 }}>「{item.habitTitle}」</div>
        <div style={{ color: '#FFFDF9', fontSize: 16, marginBottom: 28 }}>習慣中斷啦</div>
        <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ color: '#A08B7A', fontSize: 13, marginBottom: 6 }}>你曾連續堅持了</div>
          <div style={{ fontFamily: "'Zen Maru Gothic', 'DM Sans', sans-serif", fontSize: '3rem', color: '#FFFDF9' }}>
            {item.peakStreak} 天
          </div>
          {item.lostAmount > 0 && (
            <div style={{ color: '#D98368', fontSize: 14, marginTop: 12 }}>
              NT${item.lostAmount} 的累積已歸零
            </div>
          )}
        </div>
        <div style={{ color: '#A08B7A', fontSize: 13, lineHeight: 1.9, marginBottom: 28 }}>
          損失不可挽回。<br />但今天可以重新開始。
        </div>
        <button
          style={{ display: 'block', width: '100%', padding: '14px 24px', borderRadius: 100, border: 'none', background: '#D98368', color: '#FFFDF9', fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          onClick={next}
        >
          我知道了，重新開始
        </button>
        {broken.length > 1 && (
          <div style={{ color: '#A08B7A', fontSize: 12, marginTop: 14 }}>
            {idx + 1} / {broken.length}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────
function MainApp({ user, toast, onSignOut }) {
  const [tab, setTab] = useState('today');
  const [habits, setHabits] = useState([]);
  const [pausedHabits, setPausedHabits] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [fundUses, setFundUses] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [collapsed, setCollapsed] = useState({});
  const toggleCollapse = (key) => setCollapsed(s => ({ ...s, [key]: !s[key] }));
  const [showCapWarning, setShowCapWarning] = useState(false);
  const [chainBroken, setChainBroken] = useState([]); // [{habitTitle, peakStreak, lostAmount}]
  const chainChecked = useRef(false);
  const celebRef = useRef(null); // check-in celebration canvas
  const [confirmChainHabit, setConfirmChainHabit] = useState(null); // habitId | null
  // ── 電子寵物 ──
  const [pets, setPets] = useState([]);
  const [petsError, setPetsError] = useState(false); // pets 表還沒建（supabase/pets.sql 未執行）
  const [giftHabitId, setGiftHabitId] = useState(null); // 禮物商店 modal 對應的習慣
  const [evolveNews, setEvolveNews] = useState(null);   // {from, to} 進化提示
  const [mourn, setMourn] = useState([]);               // [{name, days, habit}] 哀悼 modal
  const petSyncing = useRef(false);

  const parseDesc = (raw) => {
    if (!raw) return { desc: '', cue: '', reward: '' };
    const parts = raw.split('｜');
    const desc = parts[0] || '';
    const cue = parts.find(p => p.startsWith('觸發：'))?.replace('觸發：', '') || '';
    const reward = parts.find(p => p.startsWith('獎勵：'))?.replace('獎勵：', '') || '';
    return { desc, cue, reward };
  };

  const groupByGoal = (items) => {
    const groups = {};
    for (const h of items) {
      const key = h.goal_label || '其他';
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    }
    // Put '其他' last
    const ordered = {};
    for (const k of Object.keys(groups).filter(k => k !== '其他')) ordered[k] = groups[k];
    if (groups['其他']) ordered['其他'] = groups['其他'];
    return ordered;
  };

  const goalEmoji = (label) => {
    const v = user.values_answers || {};
    const g = (v.goals || []).find(g => g.text === label);
    if (!g) return '📌';
    return GOAL_CATEGORIES.find(c => c.label === g.category)?.emoji || '🎯';
  };

  const load = useCallback(async () => {
    const [h, c, f, p] = await Promise.all([
      supa.get('habits', `user_id=eq.${user.id}&is_active=eq.true&order=created_at.asc`),
      supa.get('checkins', `user_id=eq.${user.id}&order=checked_date.desc`),
      supa.get('fund_uses', `user_id=eq.${user.id}&order=created_at.desc`),
      supa.get('habits', `user_id=eq.${user.id}&is_active=eq.false&order=created_at.asc`),
    ]);
    setHabits(h || []); setCheckins(c || []); setFundUses(f || []); setPausedHabits(p || []);
    // pets 單獨抓：若 supabase/pets.sql 還沒執行，整頁其他功能不受影響
    try {
      const pt = await supa.get('pets', `user_id=eq.${user.id}`);
      setPets(pt || []); setPetsError(false);
    } catch { setPets([]); setPetsError(true); }
  }, [user.id]);

  const detectChainBreaks = useCallback(async () => {
    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    })();
    const dayBeforeYesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      return d.toISOString().split('T')[0];
    })();

    const chainHabits = habits.filter(h =>
      h.chain_mode &&
      (h.frequency?.type === 'daily' || !h.frequency) &&
      h.created_at.split('T')[0] < yesterday &&
      !(h.chain_broken_at && h.chain_broken_at >= yesterday)
    );

    const broken = [];
    for (const h of chainHabits) {
      const hadCheckin = checkins.some(c => c.habit_id === h.id && c.checked_date === yesterday);
      if (!hadCheckin) {
        const peakStreak = getStreakAsOf(h.id, checkins, dayBeforeYesterday);
        const relevant = h.chain_broken_at
          ? checkins.filter(c => c.habit_id === h.id && c.checked_date > h.chain_broken_at)
          : checkins.filter(c => c.habit_id === h.id);
        const lostAmount = relevant.length * h.fund_per_day;
        try {
          await supa.patch('habits', `id=eq.${h.id}`, {
            chain_broken_at: yesterday,
            chain_peak_streak: peakStreak,
          });
          broken.push({ habitTitle: h.title, peakStreak, lostAmount });
        } catch (e) {
          console.error('chain break update failed:', e);
        }
      }
    }

    if (broken.length > 0) {
      setChainBroken(broken);
      await load();
    }
  }, [habits, checkins, load]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!chainChecked.current && habits.length >= 0 && checkins !== undefined) {
      chainChecked.current = true;
      detectChainBreaks();
    }
  }, [habits, checkins, detectChainBreaks]);

  const todayCheckins = new Set(checkins.filter(c => c.checked_date === todayStr()).map(c => c.habit_id));

  const calcFund = () => {
    const earned = habits.reduce((s, h) => {
      const relevant = h.chain_mode && h.chain_broken_at
        ? checkins.filter(c => c.habit_id === h.id && c.checked_date > h.chain_broken_at)
        : checkins.filter(c => c.habit_id === h.id);
      return s + relevant.length * h.fund_per_day;
    }, 0);
    const used = fundUses.reduce((s, u) => s + Number(u.amount), 0);
    return { earned, used, balance: earned - used };
  };

  // ── 電子寵物：資料與規則（與 calcFund 的捐款基金完全分離）──────
  const petOf = (habitId) => pets.find(p => p.habit_id === habitId) || null;
  const totalChecks = (habitId) => checkins.filter(c => c.habit_id === habitId).length;
  // 成長用的 days：重生後只算 revived_at 之後的打卡（沒死過就是全部）
  const petDays = (habitId) => {
    const from = petOf(habitId)?.revived_at;
    if (!from) return totalChecks(habitId);
    const fromDate = String(from).split('T')[0];
    return checkins.filter(c => c.habit_id === habitId && c.checked_date >= fromDate).length;
  };
  // 寵物幣＝該習慣打卡數×fund_per_day − 已花費；不動 fund_uses，也不影響捐款餘額
  const petCoins = (h) => totalChecks(h.id) * h.fund_per_day - (Number(petOf(h.id)?.coins_spent) || 0);
  const totalPetCoins = habits.reduce((s, h) => s + petCoins(h), 0);

  // gap = 今天 − 最後打卡日（從未打卡則自 created_at 起算）
  const petGap = (h) => {
    const dates = checkins.filter(c => c.habit_id === h.id).map(c => c.checked_date).sort();
    const base = dates.length ? dates[dates.length - 1] : (h.created_at || '').split('T')[0];
    if (!base) return 0;
    return Math.max(0, Math.round((new Date(todayStr() + 'T00:00:00') - new Date(base + 'T00:00:00')) / 86400000));
  };
  const petHealthOf = (h) => petHealth(petGap(h), h.frequency?.type === 'weekly');
  const petXpOf = (h, p) =>
    petXp(petDays(h.id), Array.isArray(p?.gift_log) ? p.gift_log : [], diffMult(h.difficulty), p?.xp_base || 0);

  // 載入時：① 沒寵物的 active 習慣自動建蛋 ② days>=14 自動孵化 ③ 餓死→留紀念並重新孵蛋
  const syncPets = useCallback(async () => {
    if (petsError || petSyncing.current || !habits.length) return;
    const missing = habits.filter(h => !pets.some(p => p.habit_id === h.id));
    const hatchedPets = habits
      .map(h => ({ h, p: pets.find(p => p.habit_id === h.id) }))
      .filter(x => x.p);
    const toHatch = hatchedPets.filter(({ h, p }) =>
      !p.hatched_at && petDays(h.id) >= HATCH_DAYS
    );
    // 只有「已孵化」的寵物會餓死；還沒破殼的蛋只是停在原地等你回來
    const toDie = hatchedPets.filter(({ h, p }) =>
      p.hatched_at && p.species_tier !== 'egg' && petHealthOf(h) === 'dead'
    );
    if (!missing.length && !toHatch.length && !toDie.length) return;
    petSyncing.current = true;
    try {
      for (const h of missing) {
        await supa.post('pets', {
          user_id: user.id, habit_id: h.id, species_tier: 'egg',
          hue: hueFromId(h.id), pattern: patternFromId(h.id), // 由 habit.id hash 決定，穩定不隨機
        });
      }
      for (const { h, p } of toHatch) {
        await supa.patch('pets', `id=eq.${p.id}`, {
          hatched_at: new Date().toISOString(),
          species_tier: 'insect',
          species_key: pickSpecies('insect', p.hue),
          xp: petXpOf(h, p),
        });
      }
      // 死亡 → 留下紀念、保留 30% 經驗、換新花色重新孵蛋
      const gone = [];
      for (const { h, p } of toDie) {
        const lived = petDays(h.id);
        const keptXp = Math.floor(petXpOf(h, p) * 0.3);
        const memorials = [
          ...(Array.isArray(p.memorials) ? p.memorials : []),
          { species_key: p.species_key, tier: p.species_tier, days: lived, hue: p.hue, pattern: p.pattern, died_at: new Date().toISOString() },
        ];
        const seed = `${h.id}:${memorials.length}`; // 新蛋換花色，穩定不隨機
        await supa.patch('pets', `id=eq.${p.id}`, {
          memorials,
          xp_base: keptXp,
          xp: keptXp,
          revived_at: new Date().toISOString(),
          hatched_at: null,
          gift_log: [],
          species_tier: 'egg',
          species_key: null,
          hue: hueFromId(seed),
          pattern: patternFromId(seed),
        });
        gone.push({ name: speciesLabel(p.species_tier, p.species_key), days: lived, habit: h.title });
      }
      if (toHatch.length) { celebRef.current?.fire(); toast('蛋孵化了！小夥伴誕生 🐣'); }
      if (gone.length) setMourn(gone);
      await load();
    } catch (e) { console.error('pet sync failed:', e); setPetsError(true); }
    finally { petSyncing.current = false; }
  }, [habits, pets, checkins, petsError, user.id, load, toast]);

  useEffect(() => { syncPets(); }, [syncPets]);

  // 餵食：每隻每週限一次（ISO 週），費用從全域寵物幣扣、記在被餵的那隻
  const feedPet = async (giftKey) => {
    const h = habits.find(x => x.id === giftHabitId);
    const p = h ? petOf(h.id) : null;
    const gift = GIFTS.find(g => g.key === giftKey);
    if (!h || !p || !gift) return;
    const log = Array.isArray(p.gift_log) ? p.gift_log : [];
    if (log.some(g => g.week === isoWeek())) { toast('本週已經餵過了，下週一再來 🍃'); return; }
    if (totalPetCoins < gift.cost) { toast('寵物幣不夠，再多打幾天卡吧 🌱'); return; }
    const newLog = [...log, { week: isoWeek(), gift: gift.key, rarity: gift.rarity, cost: gift.cost, at: new Date().toISOString() }];
    const xp = petXp(petDays(h.id), newLog, diffMult(h.difficulty), p.xp_base || 0);
    const nextTier = evolveTier(p.species_tier, xp, newLog, h.difficulty);
    const evolved = nextTier !== p.species_tier;
    const patch = { gift_log: newLog, xp, coins_spent: (Number(p.coins_spent) || 0) + gift.cost };
    if (evolved) { patch.species_tier = nextTier; patch.species_key = pickSpecies(nextTier, p.hue); }
    try {
      await supa.patch('pets', `id=eq.${p.id}`, patch);
      await load();
      setGiftHabitId(null);
      if (evolved) {
        celebRef.current?.fire();
        setEvolveNews({ from: speciesLabel(p.species_tier, p.species_key), to: speciesLabel(nextTier, patch.species_key) });
      } else {
        toast(`${gift.emoji} 餵食成功，牠很開心！`);
      }
    } catch { toast('餵食失敗'); }
  };

  const toggleCheckin = async (hId, done, origin) => {
    try {
      if (done) await supa.del('checkins', `habit_id=eq.${hId}&checked_date=eq.${todayStr()}`);
      else {
        await supa.post('checkins', { habit_id: hId, user_id: user.id, checked_date: todayStr() });
        if (origin) celebRef.current?.fire(origin.x, origin.y); // 🎉 hand-drawn particle burst
        toast('打卡成功！繼續保持 🌟');
      }
      await load();
    } catch { toast('操作失敗'); }
  };

  const saveHabit = async () => {
    if (!form.title?.trim()) { toast('請填寫習慣名稱'); return; }
    try {
      await supa.post('habits', { user_id: user.id, title: form.title, description: form.desc || '', difficulty: form.diff || 'medium', fund_per_day: diffFund(form.diff || 'medium') });
      await load(); setModal(null); toast('習慣新增成功 🌱');
    } catch { toast('新增失敗'); }
  };

  const saveGoalLabel = async (habitId, goalLabel) => {
    try {
      await supa.patch('habits', `id=eq.${habitId}`, { goal_label: goalLabel || null });
      await load();
    } catch { toast('更新失敗'); }
  };

  const pauseHabit = async (id) => {
    if (!confirm('確定要暫停這個習慣嗎？紀錄會保留，之後可以恢復。')) return;
    try { await supa.patch('habits', `id=eq.${id}`, { is_active: false }); await load(); toast('已暫停，紀錄保留 🌙'); } catch { toast('暫停失敗'); }
  };

  const resumeHabit = async (id) => {
    if (habits.length >= 5) { setShowCapWarning(true); return; }
    try { await supa.patch('habits', `id=eq.${id}`, { is_active: true }); await load(); toast('已恢復 🌱'); } catch { toast('恢復失敗'); }
  };

  const enableChainMode = async (habitId) => {
    try {
      await supa.patch('habits', `id=eq.${habitId}`, { chain_mode: true });
      await load();
      setConfirmChainHabit(null);
      toast('不斷鏈模式已啟用 ⛓️');
    } catch { toast('操作失敗'); }
  };

  const disableChainMode = async (habitId) => {
    try {
      await supa.patch('habits', `id=eq.${habitId}`, { chain_mode: false });
      await load();
      toast('不斷鏈模式已停用');
    } catch { toast('操作失敗'); }
  };

  const useFund = async (type) => {
    const amt = parseInt(form.amount);
    const { balance } = calcFund();
    if (!amt || amt <= 0) { toast('請填寫金額'); return; }
    if (amt > balance) { toast('金額超過基金餘額'); return; }
    const desc = type === 'charity' ? `捐給 ${form.org}` : `送 ${form.who} ${form.what}`;
    try {
      await supa.post('fund_uses', { user_id: user.id, amount: amt, type, description: desc });
      await load(); setModal(null);
      toast(type === 'charity' ? '感謝你的善意 🌍' : `愛傳出去了 💝 ${form.who} 很幸運有你`);
    } catch { toast('操作失敗'); }
  };

  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? '早安' : hour < 18 ? '午安' : '晚安';
  const { balance } = calcFund();
  const doneCount = habits.filter(h => todayCheckins.has(h.id)).length;

  // ── TODAY ─────────────────────────────────────────────
  const TodayTab = () => (
    <div>
      <div style={{ padding: '12px 0 24px' }}>
        <p style={{ ...S.muted, fontSize: 13 }}>{now.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</p>
        <div style={{ ...S.display, marginTop: 4, fontSize: '1.75rem' }}>{greet}，<em style={{ color: '#5AA37F', fontStyle: 'italic' }}>{user.name}</em> 👋</div>
      </div>

      {habits.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#A08B7A' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
          <p>去「習慣」頁面新增你的第一個習慣吧！</p>
        </div>
      ) : (<>
        <div className="cozy-card" style={S.card}>
          <div style={{ ...S.row, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: '#A08B7A', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>今日完成</div>
              <div style={{ fontSize: 17, fontWeight: 500, marginTop: 2 }}>{doneCount} / {habits.length} 個習慣</div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 28 }}>{doneCount === habits.length ? '🎉' : '💪'}</div>
          </div>
          <div style={{ background: '#EADFCF', borderRadius: 100, height: 5, overflow: 'hidden' }}>
            <div style={{ background: '#5AA37F', height: 5, borderRadius: 100, width: `${habits.length ? (doneCount / habits.length * 100) : 0}%`, transition: 'width .5s ease' }} />
          </div>
        </div>

        {Object.entries(groupByGoal(habits)).map(([goalLabel, groupHabits]) => (
          <div key={goalLabel} style={{ marginBottom: 8 }}>
            <div
              onClick={() => toggleCollapse('today-' + goalLabel)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', cursor: 'pointer', userSelect: 'none' }}
            >
              <span style={{ fontSize: 16 }}>{goalEmoji(goalLabel)}</span>
              <span style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{goalLabel}</span>
              <span style={{ color: '#A08B7A', fontSize: 13 }}>{collapsed['today-' + goalLabel] ? '▶' : '▼'}</span>
            </div>
            {!collapsed['today-' + goalLabel] && (
              <div className="cozy-card" style={S.card}>
                {groupHabits.map(h => {
                  const freq = h.frequency || { type: 'daily' };
                  const isWeekly = freq.type === 'weekly';
                  const weeklyCount = isWeekly ? getWeeklyCount(h.id, checkins) : 0;
                  const weeklyDone = isWeekly && weeklyCount >= freq.times;
                  const done = isWeekly ? weeklyDone : todayCheckins.has(h.id);
                  const streak = isWeekly
                    ? getWeeklyStreak(h.id, checkins, freq.times)
                    : getStreak(h.id, checkins);
                  return (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid #EADFCF' }}>
                      <button
                        onClick={(e) => {
                          if (isWeekly && weeklyDone && !todayCheckins.has(h.id)) return; // can't uncheck weekly via today
                          const r = e.currentTarget.getBoundingClientRect();
                          toggleCheckin(h.id, isWeekly ? todayCheckins.has(h.id) : done, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                        }}
                        style={{
                          width: 46, height: 46, borderRadius: '50% 48% 52% 47%', flexShrink: 0,
                          border: `2.5px solid ${done ? C.leaf : C.mint}`,
                          background: done ? C.leaf : C.paper, cursor: (isWeekly && weeklyDone && !todayCheckins.has(h.id)) ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: done ? '#FFFDF9' : 'transparent', fontSize: 20, fontWeight: 700,
                          boxShadow: done ? `2px 2px 0 #CDE7D8` : `2px 2px 0 #EDE3D4`,
                        }}>✓</button>
                      {petOf(h.id) && (
                        <div
                          onClick={() => setTab('pet')}
                          title="看看牠"
                          style={{ flexShrink: 0, width: 32, height: 32, cursor: 'pointer', marginLeft: -4 }}
                        >
                          <Pet pet={petOf(h.id)} days={petDays(h.id)} size={32} health={petHealthOf(h)} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, opacity: done ? 0.4 : 1, textDecoration: done ? 'line-through' : 'none' }}>{h.title}</div>
                        {isWeekly ? (
                          <div style={{ marginTop: 6 }}>
                            <div style={{ fontSize: 12, color: '#A08B7A', marginBottom: 4 }}>
                              NT${h.fund_per_day}/次 · {weeklyCount} / {freq.times} 次（本週）
                            </div>
                            <div style={{ background: '#EADFCF', borderRadius: 100, height: 4, overflow: 'hidden', maxWidth: 120 }}>
                              <div style={{ background: '#5AA37F', height: 4, borderRadius: 100, width: `${Math.min(100, weeklyCount / freq.times * 100)}%`, transition: 'width .4s ease' }} />
                            </div>
                            {(() => {
                              const ws = getWeeklyStatus(h, checkins, 0);
                              const dotColor = ws === 'green' ? '#5AA37F' : ws === 'yellow' ? '#E8C94F' : '#D98368';
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
                                  <span style={{ fontSize: 11, color: dotColor, fontWeight: 500 }}>{weeklyCount}/{freq.times}</span>
                                  {ws === 'green' && <span style={{ fontSize: 11 }}>🌸</span>}
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#A08B7A', marginTop: 2 }}>NT${h.fund_per_day}/天 · {diffLabel(h.difficulty)}</div>
                        )}
                      </div>
                      {streak > 0 && (
                        <div style={{ background: '#FBF3D8', color: '#C89043', padding: '4px 10px', borderRadius: 100, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
                          🔥 {streak}{isWeekly ? '週' : '天'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        <div className="cozy-card" style={{ ...S.card, display: 'flex', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: '#A08B7A', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>今日可累積</div>
            <div style={{ fontFamily: "'Zen Maru Gothic', 'DM Sans', sans-serif", fontSize: '2rem', color: '#C89043', marginTop: 2 }}>NT${habits.filter(h => todayCheckins.has(h.id)).reduce((s, h) => s + h.fund_per_day, 0)}</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 32 }}>🌱</div>
        </div>
      </>)}
    </div>
  );

  // ── PET ───────────────────────────────────────────────
  const PetTab = () => (
    <div>
      <div style={{ ...S.row, padding: '12px 0 20px' }}>
        <div>
          <div style={S.h2}>我的小夥伴</div>
          <p style={{ ...S.muted, fontSize: 13 }}>每個習慣養一隻，打卡讓牠慢慢長大</p>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.05em' }}>寵物幣</div>
          <div style={{ fontFamily: "'Zen Maru Gothic', 'DM Sans', sans-serif", fontSize: '1.4rem', color: C.honey }}>🪙 {totalPetCoins}</div>
        </div>
      </div>

      {petsError && (
        <div className="cozy-card" style={{ ...S.card, background: '#FBF3D8' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>還沒建立寵物資料表 🛠️</div>
          <p style={{ ...S.muted, fontSize: 13, lineHeight: 1.75 }}>
            請到 Supabase → SQL Editor 執行專案裡的 supabase/pets.sql，回來重新整理就會看到蛋。
          </p>
        </div>
      )}

      {habits.length === 0 && !petsError && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: C.muted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🥚</div>
          <p>先新增一個習慣，就會有一顆蛋在等你</p>
        </div>
      )}

      {habits.map(h => {
        const p = petOf(h.id);
        if (!p) return null;
        const days = petDays(h.id);
        const log = Array.isArray(p.gift_log) ? p.gift_log : [];
        const hatched = !!p.hatched_at && p.species_tier !== 'egg';
        const daysLeft = Math.max(0, HATCH_DAYS - days);
        const xp = petXpOf(h, p);
        const fed = log.some(g => g.week === isoWeek());
        const coins = petCoins(h);
        const stage = stageIndex(days);
        const health = hatched ? petHealthOf(h) : 'ok';
        const goal = hatched ? nextTierGoal(p.species_tier, xp, log, h.difficulty) : null;
        return (
          <div key={h.id} className="cozy-card" style={{ ...S.card, textAlign: 'center', paddingTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: 172, height: 172, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '50% 47% 53% 48%',
                background: `radial-gradient(60% 60% at 50% 45%, hsl(${p.hue},60%,95%) 0%, rgba(255,253,249,0) 72%)`,
              }}>
                <Pet pet={p} days={days} size={142} health={health} />
              </div>
            </div>

            <div style={{ fontWeight: 600, fontSize: 16, marginTop: 2 }}>{h.title}</div>

            {/* 飢餓／虛弱警示（溫柔但有急迫感） */}
            {health !== 'ok' && (
              <div style={{
                margin: '10px auto 0', maxWidth: 300, padding: '9px 14px',
                borderRadius: '15px 12px 16px 13px', fontSize: 13, fontWeight: 500,
                background: health === 'weak' ? '#F8E7DC' : '#FBF3D8',
                color: health === 'weak' ? C.coralDeep : C.honey,
                border: `1.5px solid ${health === 'weak' ? '#EFC4B2' : '#EFE0B4'}`,
              }}>
                {health === 'weak'
                  ? '🥺 牠快撐不住了——今天打一次卡就能救牠'
                  : '🍚 肚子餓了，開一格陪陪牠吧'}
              </div>
            )}

            {!hatched ? (
              <>
                <div style={{ ...S.muted, fontSize: 13, margin: '8px 0 8px' }}>
                  {daysLeft > 0 ? `還要 ${daysLeft} 天孵化` : '就快破殼了…'}
                </div>
                <div style={{ background: '#EADFCF', borderRadius: 100, height: 6, overflow: 'hidden', maxWidth: 220, margin: '0 auto' }}>
                  <div style={{ background: C.leaf, height: 6, borderRadius: 100, width: `${Math.min(100, days / HATCH_DAYS * 100)}%`, transition: 'width .5s ease' }} />
                </div>
                <div style={{ ...S.muted, fontSize: 11, marginTop: 6 }}>已累積 {days} / {HATCH_DAYS} 次打卡</div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', margin: '10px 0 8px' }}>
                  <span style={{ ...S.chip(true), padding: '5px 12px', fontSize: 12 }}>{speciesLabel(p.species_tier, p.species_key)}</span>
                  <span style={{ ...S.chip(false), padding: '5px 12px', fontSize: 12 }}>{TIER_LABEL[p.species_tier]}</span>
                  <span style={{ ...S.chip(false), padding: '5px 12px', fontSize: 12 }}>{STAGE_LABEL[stage]}體型</span>
                </div>
                <div style={{ ...S.muted, fontSize: 12 }}>XP {xp} · 已收到 {log.length} 份禮物 · 打卡 {days} 次 · 難度 {diffLabel(h.difficulty)}（xp ×{diffMult(h.difficulty)}）</div>
                {/* 進化進度 */}
                {goal && (
                  <div style={{ ...S.muted, fontSize: 12, marginTop: 6, lineHeight: 1.7 }}>
                    {goal.capped
                      ? '輕鬆難度最高可達保育類；想養出精靈種，把習慣難度調到適中以上 ✨'
                      : `距離「${goal.label}」：${[
                          goal.needXp > 0 ? `xp 還差 ${goal.needXp}` : null,
                          goal.needGifts > 0 ? `還差 ${goal.needGifts} 次餵食` : null,
                          goal.needAvg > 0 ? `平均稀有度需 ${goal.needAvg.toFixed(1)}（目前 ${goal.avg.toFixed(1)}）` : null,
                        ].filter(Boolean).join('、') || '條件已達成，下次餵食就會進化 🎉'}`}
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, justifyContent: 'center' }}>
              <span style={{ fontSize: 13, color: C.honey, fontWeight: 600 }}>🪙 {coins}</span>
              <button
                style={{
                  ...S.btn(hatched && !fed ? 'primary' : 'secondary'),
                  padding: '9px 18px', fontSize: 13,
                  opacity: hatched && !fed ? 1 : 0.55,
                  cursor: hatched && !fed ? 'pointer' : 'default',
                }}
                onClick={() => { if (hatched && !fed) setGiftHabitId(h.id); }}
              >
                {!hatched ? '🥚 孵化後才能餵食' : fed ? `🍃 本週已餵食（${nextMondayLabel()} 開放）` : '🎁 餵食'}
              </button>
            </div>
          </div>
        );
      })}

      {/* 回憶相簿：曾經陪過你的小夥伴 */}
      {(() => {
        const memos = habits.flatMap(h => {
          const p = petOf(h.id);
          return (Array.isArray(p?.memorials) ? p.memorials : []).map((m, i) => ({ ...m, habit: h.title, key: `${h.id}-${i}` }));
        });
        if (!memos.length) return null;
        return (
          <div className="cozy-card" style={S.card}>
            <div onClick={() => toggleCollapse('pet-memorial')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ fontSize: 16 }}>🕊️</span>
              <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>回憶相簿（{memos.length}）</span>
              <span style={{ color: C.muted, fontSize: 13 }}>{collapsed['pet-memorial'] ? '▶' : '▼'}</span>
            </div>
            {!collapsed['pet-memorial'] && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14 }}>
                {memos.map(m => (
                  <div key={m.key} style={{ width: 78, textAlign: 'center' }}>
                    <div style={{ filter: 'grayscale(1)', opacity: 0.5, display: 'flex', justifyContent: 'center' }}>
                      <Pet
                        pet={{ hue: m.hue, pattern: m.pattern, species_tier: m.tier, species_key: m.species_key, hatched_at: m.died_at }}
                        days={m.days} size={56}
                      />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2 }}>{speciesLabel(m.tier, m.species_key)}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>陪伴 {m.days} 天</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );

  // ── HABITS ────────────────────────────────────────────
  const HabitsTab = () => (
    <div>
      <div style={{ ...S.row, padding: '12px 0 24px' }}>
        <div><div style={S.h2}>習慣管理</div><p style={S.muted}>管理你的所有習慣</p></div>
        <div style={{ flex: 1 }} />
        <button style={{ ...S.btn('primary'), padding: '9px 18px', fontSize: 13 }} onClick={() => {
          if (habits.length >= 5) { setShowCapWarning(true); }
          else setModal('quickadd');
        }}>+ 新增</button>
      </div>
      {habits.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#A08B7A' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div><p>點擊右上角新增你的第一個習慣</p>
        </div>
      ) : Object.entries(groupByGoal(habits)).map(([goalLabel, groupHabits]) => (
        <div key={goalLabel} style={{ marginBottom: 8 }}>
          <div
            onClick={() => toggleCollapse('habits-' + goalLabel)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{ fontSize: 16 }}>{goalEmoji(goalLabel)}</span>
            <span style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{goalLabel}</span>
            <span style={{ color: '#A08B7A', fontSize: 13 }}>{collapsed['habits-' + goalLabel] ? '▶' : '▼'}</span>
          </div>
          {!collapsed['habits-' + goalLabel] && groupHabits.map(h => {
            const freq = h.frequency || { type: 'daily' };
            const isWeekly = freq.type === 'weekly';
            const streak = isWeekly
              ? getWeeklyStreak(h.id, checkins, freq.times)
              : getStreak(h.id, checkins);
            // lifetimeTotal: all checkins ever (for 📅 display)
            // chainFundCheckins: post-break only for chain-mode habits (for 💰 display)
            const lifetimeTotal = checkins.filter(c => c.habit_id === h.id).length;
            const chainFundCheckins = h.chain_mode && h.chain_broken_at
              ? checkins.filter(c => c.habit_id === h.id && c.checked_date > h.chain_broken_at)
              : checkins.filter(c => c.habit_id === h.id);
            const total = lifetimeTotal; // keep for 📅 累計 display (lifetime)
            const userGoals = (user.values_answers?.goals || []).filter(g => g.text?.trim());
            return (
              <div key={h.id} className="cozy-card" style={S.card}>
                <div style={{ ...S.row, marginBottom: 10 }}>
                  <span style={{ background: diffBg(h.difficulty), color: diffColor(h.difficulty), padding: '3px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500 }}>{diffLabel(h.difficulty)}</span>
                  <span style={{ ...S.muted, fontSize: 12, flex: 1, textAlign: 'right' }}>
                    {isWeekly ? `NT$${h.fund_per_day}/次 · 每週${freq.times}次` : `NT$${h.fund_per_day}/天`}
                  </span>
                  <button onClick={() => pauseHabit(h.id)} title="暫停" aria-label="暫停" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A08B7A', fontSize: 16, lineHeight: 1 }}>⏸</button>
                </div>
                <div style={{ fontWeight: 500, fontSize: 15 }}>{h.title}</div>
                {(() => {
                  const { desc, cue, reward } = parseDesc(h.description);
                  return (
                    <>
                      {desc && <div style={{ fontSize: 13, color: '#A08B7A', marginTop: 4 }}>{desc}</div>}
                      {cue && <div style={{ fontSize: 12, color: '#5AA37F', marginTop: 4 }}>⚡ 觸發：{cue}</div>}
                      {reward && <div style={{ fontSize: 12, color: '#C89043', marginTop: 2 }}>🎁 完成後：{reward}</div>}
                    </>
                  );
                })()}
                <div style={{ ...S.row, marginTop: 12 }}>
                  <span style={{ ...S.muted, fontSize: 12 }}>🔥 連續 {streak}{isWeekly ? '週' : '天'}</span>
                  <span style={{ ...S.muted, fontSize: 12 }}>📅 累計 {total} 次</span>
                  <span style={{ ...S.muted, fontSize: 12 }}>💰 NT${chainFundCheckins.length * h.fund_per_day}</span>
                </div>
                {(!h.frequency || h.frequency?.type === 'daily') && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #EADFCF', paddingTop: 10 }}>
                    {h.chain_mode ? (
                      <button
                        style={{ background: 'none', border: '1px solid #EADFCF', borderRadius: 100, padding: '5px 14px', fontSize: 12, color: '#A08B7A', cursor: 'pointer', fontFamily: 'inherit' }}
                        onClick={() => disableChainMode(h.id)}
                      >
                        ⛓️ 不斷鏈中（點擊停用）
                      </button>
                    ) : (
                      <button
                        style={{ background: 'none', border: '1px solid #EADFCF', borderRadius: 100, padding: '5px 14px', fontSize: 12, color: '#A08B7A', cursor: 'pointer', fontFamily: 'inherit' }}
                        onClick={() => setConfirmChainHabit(h.id)}
                      >
                        🔗 開啟不斷鏈
                      </button>
                    )}
                  </div>
                )}
                {userGoals.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <label style={S.label}>歸屬目標</label>
                    <select
                      style={{ ...S.input, marginTop: 4 }}
                      value={h.goal_label || ''}
                      onChange={e => saveGoalLabel(h.id, e.target.value)}
                    >
                      <option value="">（未分組）</option>
                      {userGoals.map(g => (
                        <option key={g.text} value={g.text}>{g.text}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {pausedHabits.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div
            onClick={() => toggleCollapse('paused-section')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px', cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{ fontSize: 16 }}>⏸</span>
            <span style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>已暫停的習慣</span>
            <span style={{ color: '#A08B7A', fontSize: 13 }}>{collapsed['paused-section'] ? '▶' : '▼'}</span>
          </div>
          {!collapsed['paused-section'] && pausedHabits.map(h => {
            const total = checkins.filter(c => c.habit_id === h.id).length;
            return (
              <div key={h.id} className="cozy-card" style={{ ...S.card, opacity: 0.7 }}>
                <div style={S.row}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 15 }}>{h.title}</div>
                    <div style={{ ...S.muted, fontSize: 12, marginTop: 4 }}>📅 累計 {total} 次</div>
                  </div>
                  <button style={{ ...S.btn('secondary'), padding: '7px 14px', fontSize: 12 }} onClick={() => resumeHabit(h.id)}>▶ 恢復</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── FUND ──────────────────────────────────────────────
  const FundTab = () => {
    const { balance } = calcFund();
    return (
      <div>
        <div style={{ padding: '12px 0 24px' }}><div style={S.h2}>愛的基金</div><p style={S.muted}>你的習慣，轉化為對世界的好</p></div>
        <div className="cozy-card" style={{ ...S.card, textAlign: 'center', padding: 36 }}>
          <div style={{ fontSize: 12, color: '#A08B7A', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>基金餘額</div>
          <div style={{ fontFamily: "'Zen Maru Gothic', 'DM Sans', sans-serif", fontSize: '3rem', color: '#C89043', margin: '10px 0 6px' }}>NT${balance}</div>
          <p style={{ ...S.muted, fontSize: 13 }}>每一分都來自你的堅持</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <button style={{ ...S.btn('primary'), width: '100%', justifyContent: 'center' }} onClick={() => { setForm({}); setModal('donate'); }}>🌍 捐給慈善</button>
          <button style={{ ...S.btn('warm'), width: '100%', justifyContent: 'center' }} onClick={() => { setForm({}); setModal('gift'); }}>🎁 買小禮物</button>
        </div>
        <div className="cozy-card" style={{ ...S.card, marginTop: 14 }}>
          <div style={{ fontWeight: 500, marginBottom: 16 }}>使用紀錄</div>
          {fundUses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#A08B7A' }}><div style={{ fontSize: 28, marginBottom: 8 }}>✨</div><p>還沒有任何紀錄</p></div>
          ) : fundUses.map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #EADFCF' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{u.type === 'charity' ? '🌍 ' : '🎁 '}{u.description}</div>
                <div style={{ fontSize: 12, color: '#A08B7A' }}>{new Date(u.created_at).toLocaleDateString('zh-TW')}</div>
              </div>
              <div style={{ fontWeight: 500, color: '#D98368' }}>-NT${u.amount}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── 提醒卡：Web Push 訂閱 ───────────────────────────────
  const ReminderCard = () => {
    const supported = typeof window !== 'undefined'
      && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    // VAPID public key is not a secret; hardcoded fallback so cloud builds (no .env.local) still work
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      || 'BKW7jALJCHxiAHg2PNjvbvgLqe_Zf8WOlWX6RIR2uN943UBOsBT65fMolN1gSww0EhvUcmp2cqG9W_CDEYyKTB0';
    const [state, setState] = useState('loading'); // loading | off | on | denied | busy
    const [endpoint, setEndpoint] = useState(null);

    useEffect(() => {
      let alive = true;
      if (!supported) { setState('unsupported'); return; }
      if (Notification.permission === 'denied') { setState('denied'); return; }
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => {
          if (!alive) return;
          if (sub) { setEndpoint(sub.endpoint); setState('on'); }
          else setState('off');
        })
        .catch(() => alive && setState('off'));
      return () => { alive = false; };
    }, []);

    const enable = async () => {
      if (!vapidKey) { toast('⚠️ 尚未設定推播金鑰'); return; }
      setState('busy');
      try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return; }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        const json = sub.toJSON();
        await supa.req('push_subscriptions', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=minimal',
          body: JSON.stringify({ user_id: user.id, subscription: json, endpoint: json.endpoint }),
        });
        setEndpoint(json.endpoint);
        setState('on');
        toast('🔔 已開啟每日提醒');
      } catch (e) {
        setState('off');
        toast('⚠️ 開啟失敗，請再試一次');
      }
    };

    const disable = async () => {
      setState('busy');
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const ep = sub?.endpoint || endpoint;
        if (sub) await sub.unsubscribe();
        if (ep) await supa.del('push_subscriptions', `endpoint=eq.${encodeURIComponent(ep)}`);
        setEndpoint(null);
        setState('off');
        toast('已關閉提醒');
      } catch (e) {
        setState('on');
        toast('⚠️ 關閉失敗，請再試一次');
      }
    };

    if (!supported) return null;

    return (
      <div className="cozy-card" style={{ ...S.card, marginTop: 14 }}>
        <div style={{ fontWeight: 500, marginBottom: 6, fontSize: 15 }}>🔔 每日提醒</div>
        <p style={{ ...S.muted, fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
          每晚 21:30，如果今天還沒打卡，輕輕提醒你一下。
        </p>
        {state === 'on' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: '#5AA37F', fontWeight: 500 }}>✓ 已開啟</span>
            <div style={{ flex: 1 }} />
            <button onClick={disable} style={{ background: 'none', border: '1px solid #EADFCF', borderRadius: 100, padding: '7px 16px', fontSize: 12, color: '#A08B7A', cursor: 'pointer', fontFamily: 'inherit' }}>關閉</button>
          </div>
        ) : state === 'denied' ? (
          <p style={{ fontSize: 12, color: '#D98368', lineHeight: 1.7, margin: 0 }}>
            通知權限已被封鎖。請到瀏覽器設定重新允許本站通知，再回來開啟。
          </p>
        ) : (
          <button onClick={enable} disabled={state === 'busy' || state === 'loading'}
            style={{ ...S.btn('primary'), width: '100%', justifyContent: 'center', opacity: (state === 'busy' || state === 'loading') ? 0.6 : 1 }}>
            {state === 'busy' ? '開啟中…' : '開啟每日提醒'}
          </button>
        )}
      </div>
    );
  };

  // ── DASHBOARD ─────────────────────────────────────────
  const DashboardTab = () => {
    const totalDays = new Set(checkins.map(c => c.checked_date)).size;
    const maxStreak = habits.length ? Math.max(0, ...habits.map(h => getStreak(h.id, checkins))) : 0;
    const { balance } = calcFund();
    const v = user.values_answers || {};
    return (
      <div>
        <div style={{ ...S.row, padding: '12px 0 24px' }}>
        <div><div style={S.h2}>成長總覽</div><p style={S.muted}>你一直都在往前走</p></div>
        <div style={{ flex: 1 }} />
        <button onClick={onSignOut} style={{ background: 'none', border: '1px solid #EADFCF', borderRadius: 100, padding: '7px 16px', fontSize: 12, color: '#A08B7A', cursor: 'pointer', fontFamily: 'inherit' }}>登出</button>
      </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: '總打卡天數', val: totalDays, unit: '天' },
            { label: '最長連續', val: maxStreak, unit: '天' },
            { label: '進行中習慣', val: habits.length, unit: '個' },
            { label: '基金餘額', val: `NT$${balance}`, unit: '' },
          ].map(s => (
            <div key={s.label} className="cozy-card" style={{ ...S.card, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#A08B7A', fontWeight: 500, marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontFamily: "'Zen Maru Gothic', 'DM Sans', sans-serif", fontSize: '2rem', color: '#C89043' }}>{s.val}</div>
              {s.unit && <div style={{ ...S.muted, fontSize: 12 }}>{s.unit}</div>}
            </div>
          ))}
        </div>
        <ReminderCard />
        <PasswordCard toast={toast} />
        {/* ── 週節奏卡片 ── */}
        {(() => {
          const weeklyHabits = habits.filter(h => h.frequency?.type === 'weekly');
          const dotColor = s => s === 'green' ? '#5AA37F' : s === 'yellow' ? '#E8C94F' : s === 'red' ? '#D98368' : null;
          return (
            <div className="cozy-card" style={{ ...S.card, marginTop: 14 }}>
              <div style={{ fontWeight: 500, marginBottom: 14, fontSize: 15 }}>🌸 週節奏</div>
              {weeklyHabits.length === 0 ? (
                <div style={{ color: '#A08B7A', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>還沒有週習慣，新增一個來追蹤節奏吧 ✨</div>
              ) : weeklyHabits.map(h => {
                const lastWeekStatus = getWeeklyStatus(h, checkins, -1);
                const dots = Array.from({ length: 8 }, (_, i) => {
                  const offset = i - 7; // i=0 → offset=-7 (7 weeks ago), i=7 → offset=0 (this week)
                  return { offset, status: getWeeklyStatus(h, checkins, offset) };
                });
                return (
                  <div key={h.id} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{h.title}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {dots.map(({ offset, status }) => {
                        const isThisWeek = offset === 0;
                        const color = dotColor(status);
                        return color ? (
                          <span key={offset} style={{
                            width: isThisWeek ? 13 : 10, height: isThisWeek ? 13 : 10,
                            borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0,
                            boxShadow: isThisWeek ? `0 0 0 2px #FFFDF9, 0 0 0 3.5px ${color}` : 'none',
                          }} />
                        ) : (
                          <span key={offset} style={{
                            width: isThisWeek ? 13 : 10, height: isThisWeek ? 13 : 10,
                            borderRadius: '50%', border: '1.5px solid #E0D4C2', display: 'inline-block', flexShrink: 0,
                          }} />
                        );
                      })}
                    </div>
                    {lastWeekStatus === 'red' && (
                      <div style={{ fontSize: 11, color: '#C89043', marginTop: 5 }}>這週是保底週——出席 {Math.max(2, (h.frequency.times || 1) - 1)} 次就贏 🌱</div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
        <div className="cozy-card" style={{ ...S.card, marginTop: 14 }}>
          <div style={{ fontWeight: 500, marginBottom: 14, fontSize: 15 }}>🗓️ 打卡月曆</div>
          <MonthCalendar habits={habits} checkins={checkins} />
        </div>
        {v.goals?.filter(g => g.text?.trim()).length > 0 && (
          <div className="cozy-card" style={{ ...S.card, marginTop: 14 }}>
            <div style={{ fontWeight: 500, marginBottom: 14 }}>你的目標</div>
            {v.goals.filter(g => g.text?.trim()).map((g, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12, paddingBottom: 12, borderBottom: i < v.goals.filter(g2 => g2.text?.trim()).length - 1 ? "1px solid #EADFCF" : "none" }}>
                <div style={{ fontSize: 20, flexShrink: 0 }}>{GOAL_CATEGORIES.find(c => c.label === g.category)?.emoji || "🎯"}</div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{g.text}</div>
                  <div style={{ color: "#A08B7A", fontSize: 12, marginTop: 3 }}>{[g.category, g.deadline, g.timePerDay].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const tabs = { today: <TodayTab />, pet: <PetTab />, habits: <HabitsTab />, fund: <FundTab />, dashboard: <DashboardTab /> };

  return (
    <div style={S.bg}>
      <div style={S.app}>{tabs[tab]}</div>

      <CheckinCelebration ref={celebRef} />

      <ChainBrokenModal broken={chainBroken} onDismiss={() => setChainBroken([])} />

      {confirmChainHabit && (
        <Modal open title="啟用不斷鏈模式？" onClose={() => setConfirmChainHabit(null)}>
          <p style={{ ...S.muted, lineHeight: 1.8, marginBottom: 20 }}>
            一旦啟用，只要有一天沒完成，<br />這個習慣的所有累積基金將歸零。
          </p>
          <div style={S.row}>
            <button style={{ ...S.btn('secondary'), flex: 1 }} onClick={() => setConfirmChainHabit(null)}>取消</button>
            <button style={{ ...S.btn('warm'), flex: 1 }} onClick={() => enableChainMode(confirmChainHabit)}>啟用，我做得到</button>
          </div>
        </Modal>
      )}

      {/* 禮物商店（每隻每週限兌一次） */}
      {giftHabitId && (() => {
        const h = habits.find(x => x.id === giftHabitId);
        const p = h ? petOf(h.id) : null;
        if (!h || !p) return null;
        const log = Array.isArray(p.gift_log) ? p.gift_log : [];
        const fed = log.some(g => g.week === isoWeek());
        return (
          <Modal open title="🎁 禮物商店" onClose={() => setGiftHabitId(null)}>
            <div style={{ ...S.row, marginBottom: 16 }}>
              <Pet pet={p} days={petDays(h.id)} size={54} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{speciesLabel(p.species_tier, p.species_key)}</div>
                <div style={{ ...S.muted, fontSize: 12 }}>{h.title}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: C.muted }}>可用寵物幣</div>
                <div style={{ color: C.honey, fontWeight: 700 }}>🪙 {totalPetCoins}</div>
              </div>
            </div>

            {fed ? (
              <div className="cozy-card" style={{ ...S.card, textAlign: 'center', background: '#E6F2EB' }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>🍃</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>本週已餵食</div>
                <p style={{ ...S.muted, fontSize: 13 }}>下週一（{nextMondayLabel()}）開放，讓牠好好消化 ✨</p>
              </div>
            ) : (
              GIFTS.map(g => {
                const afford = totalPetCoins >= g.cost;
                return (
                  <button
                    key={g.key}
                    onClick={() => afford && feedPet(g.key)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
                      background: C.paper, border: `1.5px solid ${C.border}`, borderRadius: '17px 14px 18px 13px',
                      padding: '12px 16px', marginBottom: 10, cursor: afford ? 'pointer' : 'default',
                      opacity: afford ? 1 : 0.42, fontFamily: 'inherit', color: C.ink,
                      boxShadow: afford ? '2px 3px 0 #EFE1CE' : 'none',
                    }}
                  >
                    <span style={{ fontSize: 26, flexShrink: 0 }}>{g.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{g.name}</span>
                      <span style={{ display: 'block', fontSize: 12, color: C.lemonDeep }}>{'★'.repeat(g.rarity)}<span style={{ color: C.line }}>{'★'.repeat(5 - g.rarity)}</span></span>
                    </span>
                    <span style={{ color: afford ? C.honey : C.muted, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>🪙 {g.cost}</span>
                  </button>
                );
              })
            )}
            <p style={{ ...S.muted, fontSize: 11, textAlign: 'center', marginTop: 6, lineHeight: 1.7 }}>
              寵物幣由打卡累積，與捐款基金分開計算，餵食不會減少你的捐款餘額。
            </p>
          </Modal>
        );
      })()}

      {/* 哀悼（溫柔、不責備） */}
      {mourn.length > 0 && (
        <Modal open title="🕊️ 道別" onClose={() => setMourn([])}>
          {mourn.map((m, i) => (
            <p key={i} style={{ fontSize: 15, lineHeight: 2, textAlign: 'center', marginBottom: 10 }}>
              <strong>{m.name}</strong> 離開了。<br />牠陪你走了 {m.days} 天。
            </p>
          ))}
          <div className="cozy-card" style={{ ...S.card, background: '#E6F2EB', textAlign: 'center' }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>🥚</div>
            <p style={{ fontSize: 13, lineHeight: 1.9, color: C.cinnamon }}>
              新的蛋已經在孵了。<br />牠會記得你學過的事（保留 30% 成長）。
            </p>
          </div>
          <button style={{ ...S.btn('primary'), width: '100%', marginTop: 4 }} onClick={() => { setMourn([]); setTab('pet'); }}>
            好好照顧下一隻 🌱
          </button>
        </Modal>
      )}

      {/* 進化提示 */}
      {evolveNews && (
        <Modal open title="🎉 進化了！" onClose={() => setEvolveNews(null)}>
          <p style={{ fontSize: 16, lineHeight: 1.9, marginBottom: 20, textAlign: 'center' }}>
            你的 <strong>{evolveNews.from}</strong><br />進化成 <strong style={{ color: C.leaf }}>{evolveNews.to}</strong> 了！
          </p>
          <button style={{ ...S.btn('primary'), width: '100%' }} onClick={() => setEvolveNews(null)}>太好了 ✨</button>
        </Modal>
      )}

      {/* Nav */}
      <nav style={S.nav}>
        {[
          { id: 'today', label: '今日', icon: '◷' },
          { id: 'pet', label: '寵物', icon: '🥚' },
          { id: 'habits', label: '習慣', icon: '✓' },
          { id: 'fund', label: '基金', icon: '◎' },
          { id: 'dashboard', label: '總覽', icon: '⊞' },
        ].map(n => (
          <button key={n.id} style={S.navBtn(tab === n.id)} onClick={() => setTab(n.id)}>
            <span style={{ fontSize: 18 }}>{n.icon}</span>{n.label}
          </button>
        ))}
      </nav>

      {/* Habit Cap Warning */}
      {showCapWarning && (
        <div style={S.modalBg} onClick={e => e.target === e.currentTarget && setShowCapWarning(false)}>
          <div style={S.modal}>
            <div style={{ width: 40, height: 4, background: '#EADFCF', borderRadius: 2, margin: '0 auto 24px' }} />
            <div style={{ ...S.h2, marginBottom: 8 }}>你已有 {habits.length} 個習慣</div>
            <p style={{ ...S.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.7 }}>
              建立習慣的科學建議：先穩固現有習慣，再加入新的。<br />「一次想改太多」是最常見的失敗原因。
            </p>
            <div className="cozy-card" style={{ ...S.card, marginBottom: 16 }}>
              {habits.map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #EADFCF' }}>
                  <span style={{ fontSize: 16 }}>{'🟢'}</span>
                  <span style={{ fontSize: 14, flex: 1 }}>{h.title}</span>
                </div>
              ))}
            </div>
            <div style={S.row}>
              <button style={{ ...S.btn('secondary'), flex: 1 }} onClick={() => setShowCapWarning(false)}>先不加了</button>
              <button style={{ ...S.btn('primary'), flex: 1 }} onClick={() => { setShowCapWarning(false); setModal('quickadd'); }}>我了解，繼續新增</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Habit Modal (manual, default entry) */}
      {modal === 'quickadd' && (
        <QuickAddModal
          user={user}
          onClose={() => setModal(null)}
          onSaved={load}
          onUseAI={() => setModal('add')}
          toast={toast}
        />
      )}

      {/* Add Habit Modal */}
      {modal === 'add' && (
        <AddHabitModal
          user={user}
          onClose={() => setModal(null)}
          onSaved={load}
          toast={toast}
        />
      )}

      {/* Donate Modal */}
      <Modal open={modal === 'donate'} onClose={() => setModal(null)} title="捐給慈善機構">
        <p style={{ ...S.muted, marginBottom: 20, fontSize: 14 }}>基金餘額：<strong style={{ color: '#4A3B31' }}>NT${balance}</strong></p>
        {[['org', '慈善機構名稱', '例：台灣世界展望會'], ['amount', '捐款金額 (NT$)', '0']].map(([k, l, p]) => (
          <div key={k} style={{ marginBottom: 18 }}>
            <label style={S.label}>{l}</label>
            <input style={S.input} placeholder={p} value={form[k] || ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
          </div>
        ))}
        <div style={{ ...S.row, marginTop: 8 }}>
          <button style={{ ...S.btn('secondary'), flex: 1 }} onClick={() => setModal(null)}>取消</button>
          <button style={{ ...S.btn('primary'), flex: 1 }} onClick={() => useFund('charity')}>確認捐款</button>
        </div>
      </Modal>

      {/* Gift Modal */}
      <Modal open={modal === 'gift'} onClose={() => setModal(null)} title="買小禮物給在乎的人">
        <p style={{ ...S.muted, marginBottom: 20, fontSize: 14 }}>基金餘額：<strong style={{ color: '#4A3B31' }}>NT${balance}</strong></p>
        {[['who', '送給誰', '例：媽媽、好友小美'], ['what', '禮物說明', '例：一束鮮花'], ['amount', '使用金額 (NT$)', '0']].map(([k, l, p]) => (
          <div key={k} style={{ marginBottom: 18 }}>
            <label style={S.label}>{l}</label>
            <input style={S.input} placeholder={p} value={form[k] || ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
          </div>
        ))}
        <div style={{ ...S.row, marginTop: 8 }}>
          <button style={{ ...S.btn('secondary'), flex: 1 }} onClick={() => setModal(null)}>取消</button>
          <button style={{ ...S.btn('warm'), flex: 1 }} onClick={() => useFund('gift')}>送出愛 💝</button>
        </div>
      </Modal>
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────
export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { msg, show, toast } = useToast();

  const loadProfile = useCallback(async (au) => {
    setAuthUser(au);
    try {
      const users = await supa.get('users', `id=eq.${au.id}`);
      setUser(users?.length ? users[0] : null);
    } catch {
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) loadProfile(session.user);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) loadProfile(session.user);
      else { setAuthUser(null); setUser(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setUser(null);
  };

  if (loading) return (
    <div style={{ ...S.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <FluidBackground />
      <div style={{ textAlign: 'center', color: '#A08B7A' }}>
        <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 2s linear infinite', display: 'inline-block' }}>✦</div>
        <p>載入中…</p>
      </div>
    </div>
  );

  return (
    <div>
      {/* Gallery-minimal warm-gold light-flow background (fixed, z-index bottom) */}
      <FluidBackground />
      {/* Toast */}
      <div style={{
        position: 'fixed', top: 24, left: '50%', transform: `translateX(-50%) translateY(${show ? 0 : -80}px)`,
        background: '#4A3B31', color: '#FFFDF9', padding: '12px 24px', borderRadius: 100,
        fontSize: 14, zIndex: 999, transition: 'transform .3s ease', whiteSpace: 'nowrap'
      }}>{msg}</div>

      {!authUser
        ? <Login toast={toast} />
        : user
          ? <MainApp user={user} toast={toast} onSignOut={handleSignOut} />
          : <Onboarding authUser={authUser} onDone={u => setUser(u)} toast={toast} />
      }
    </div>
  );
}

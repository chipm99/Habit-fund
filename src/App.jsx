import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from '@supabase/supabase-js';
import FluidBackground from './FluidBackground.jsx';
import CheckinCelebration from './CheckinCelebration.jsx';

const SUPABASE_URL = 'https://keenwhiygrrnxhllibxa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ZrftrM1kZGX3odvfJQG0Pw_jNriTgc6';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

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
          <label style={S.label}>以 Email 登入 / 註冊</label>
          <input
            style={S.input}
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendLink()}
          />
          <p style={{ ...S.muted, fontSize: 12, marginTop: 8 }}>我們會寄一封免密碼的登入連結到你的信箱</p>
        </div>
        <button
          style={{ ...S.btn('primary'), width: '100%', marginTop: 8, justifyContent: 'center' }}
          onClick={sendLink}
          disabled={loading}
        >
          {loading ? '寄送中…' : '寄送登入連結 →'}
        </button>
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

function Onboarding({ authUser, onDone, toast }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  // 最多 3 個目標
  const [goals, setGoals] = useState([{ category: '', text: '', deadline: '', level: '', timePerDay: '' }]);
  // 生活習慣
  const [schedule, setSchedule] = useState([]);
  const [obstacles, setObstacles] = useState([]);
  const [style, setStyle] = useState([]);
  // 結果
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [smartReviews, setSmartReviews] = useState(null); // null | Array<{specific,measurable,timeBound,identity,rewrite}>
  const [smartIdentities, setSmartIdentities] = useState([]); // user-edited identity per goal
  const [smartMeasurables, setSmartMeasurables] = useState([]); // user-filled measurable per goal

  const toggleArr = (arr, setArr) => v =>
    setArr(a => a.includes(v) ? a.filter(x => x !== v) : [...a, v]);

  const updateGoal = (i, val) => {
    if (val === null) {
      setGoals(g => g.filter((_, idx) => idx !== i));
    } else {
      setGoals(g => g.map((g2, idx) => idx === i ? val : g2));
    }
  };

  const addGoal = () => {
    if (goals.length >= 3) { toast('最多設定 3 個目標'); return; }
    setGoals(g => [...g, { category: '', text: '', deadline: '', level: '', timePerDay: '' }]);
  };

  const canProceed = () => {
    if (step === 0) return name.trim().length > 0;
    if (step === 1) return goals.every(g => g.text.trim()) && goals.some(g => g.text.trim());
    if (step === 2) return schedule.length > 0;
    if (step === 3) return obstacles.length > 0;
    return true;
  };

  const next = async () => {
    if (!canProceed()) {
      const msgs = ['請輸入你的名字 😊', '請至少填寫一個具體目標', '請選擇你的作息時段', '請選擇你面臨的障礙'];
      toast(msgs[step] || '請完成此步驟');
      return;
    }

    if (step === 3) {
      // Generate habits
      setStep(4); setLoading(true);
      try {
        const goalsText = goals.filter(g => g.text.trim()).map((g, i) =>
          `目標${i + 1}：${g.category ? `【${g.category}】` : ''}${g.text}` +
          (g.deadline ? `，希望在${g.deadline}達成` : '') +
          (g.level ? `，目前程度：${g.level}` : '') +
          (g.timePerDay ? `，每天可投入：${g.timePerDay}` : '')
        ).join('\n');

        const prompt = `你是一位專業的習慣設計師。請根據以下使用者資訊，為他設計每日微習慣計劃。

【使用者資料】
名字：${name}
具體目標：
${goalsText}
最佳作息時段：${schedule.join('、')}
主要障礙：${obstacles.join('、')}
學習風格：${style.length ? style.join('、') : '未填寫'}

【設計原則】
1. 每個習慣必須「非常具體」，要包含：具體行動 + 工具/方式 + 時間長度 + 執行時機
2. 習慣要直接對應使用者的目標，不能泛泛而談
3. 要針對使用者的障礙設計克服策略
4. 考慮使用者的可用時段安排執行時機
5. 習慣要小到「今天就能開始」

【範例格式（好的習慣）】
- 不好：「每天學英文」
- 好：「每天早上刷牙時，用 Anki App 複習 20 個西班牙文單字（約 10 分鐘）」

- 不好：「每天看投資資訊」  
- 好：「每天睡前用 YouTube 看一支美股分析影片（15-20分鐘），並在筆記本寫下 1 個今日學到的概念」

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
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        const data = await res.json();
        if (!res.ok || !data.content) throw new Error(data.error?.message || `API error ${res.status}`);
        let text = data.content.map(i => i.text || '').join('').replace(/```json|```/g, '').trim();
        setSuggestions(JSON.parse(text));
      } catch (e) {
        console.error(e);
        toast('建議生成失敗，請重試');
        setStep(3);
      }
      setLoading(false);
      return;
    }
    if (step === 1) {
      // Trigger SMART review before proceeding to step 2
      const validGoals = goals.filter(g => g.text.trim());
      setLoading(true);
      try {
        const reviews = await callSmartReview(validGoals);
        setSmartReviews(reviews);
        setSmartIdentities(reviews.map(r => r.identity || ''));
        setSmartMeasurables(reviews.map(r => r.measurable || ''));
      } catch (e) {
        console.error(e);
        toast('目標分析失敗，請重試');
      }
      setLoading(false);
      return;
    }
    setStep(s => s + 1);
  };

  const confirmSmartReview = () => {
    const validGoals = goals.filter(g => g.text.trim());
    // Check all measurables are filled
    const missing = smartMeasurables.findIndex((m, i) => !m.trim());
    if (missing !== -1) {
      toast(`請填寫目標 ${missing + 1} 的可衡量指標`);
      return;
    }
    // Merge identity and smart into goals
    const updatedGoals = goals.map(g => {
      const vi = validGoals.findIndex(vg => vg.text === g.text);
      if (vi === -1) return g;
      const review = smartReviews[vi];
      return {
        ...g,
        identity: smartIdentities[vi],
        smart: {
          specific: review.specific,
          measurable: smartMeasurables[vi],
          timeBound: review.timeBound,
        }
      };
    });
    setGoals(updatedGoals);
    setSmartReviews(null);
    setStep(2);
  };

  const confirmHabits = async () => {
    if (!selected.size) { toast('請至少選擇一個習慣 😊'); return; }
    setLoading(true);
    try {
      const users = await supa.post('users', {
        id: authUser.id,
        name: name.trim(),
        values_answers: { goals, schedule, obstacles, style }
      });
      const user = users[0];

      // Resolve selected sids back to habit objects
      const validGoals = goals.filter(g => g.text && g.text.trim());
      const selectedHabits = [];
      for (const sid of selected) {
        if (sid.startsWith('extra-')) {
          const hi = parseInt(sid.replace('extra-', ''));
          const extraSugs = suggestions.filter(s => {
            const gi = Number(s.goal_index);
            return isNaN(gi) || gi >= validGoals.length;
          });
          if (extraSugs[hi]) selectedHabits.push(extraSugs[hi]);
        } else {
          const [giStr, hiStr] = sid.split('-');
          const gi = parseInt(giStr), hi = parseInt(hiStr);
          const goalSugs = suggestions.filter(s => Number(s.goal_index) === gi);
          if (goalSugs[hi]) selectedHabits.push(goalSugs[hi]);
        }
      }

      for (const h of selectedHabits) {
        await supa.post('habits', {
          user_id: user.id,
          title: h.title,
          description: `${h.description}${h.why ? '｜' + h.why : ''}`,
          difficulty: h.difficulty,
          fund_per_day: diffFund(h.difficulty)
        });
      }
      onDone(user);
      toast('歡迎！你的習慣旅程開始了 🌱');
    } catch (e) {
      console.error('confirmHabits error:', e);
      const msg = e?.message || '';
      if (msg.includes('row-level security') || msg.includes('RLS') || msg.includes('permission')) {
        toast('⚠️ 資料庫權限錯誤：請在 Supabase 關閉 RLS');
      } else if (msg.includes('relation') || msg.includes('does not exist')) {
        toast('⚠️ 資料表不存在：請先執行建表 SQL');
      } else if (msg.includes('null value') || msg.includes('violates')) {
        toast('⚠️ 資料格式錯誤：' + msg.slice(0, 60));
      } else {
        toast('儲存失敗：' + (msg.slice(0, 50) || '請查看 console'));
      }
      setLoading(false);
    }
  };

  const STEPS = [
    { label: '你好', total: 4 },
    { label: '你的目標', total: 4 },
    { label: '生活節奏', total: 4 },
    { label: '你的挑戰', total: 4 },
    { label: '習慣建議', total: 4 },
  ];

  const stepContent = [
    // ── Step 0: Welcome + Name ──
    <div key={0}>
      <div style={{ padding: '16px 0 28px' }}>
        <div style={S.display}>你好，<br />歡迎來到<br /><em style={{ color: '#5AA37F', fontStyle: 'italic' }}>好習慣基金</em></div>
        <p style={{ ...S.muted, marginTop: 14, lineHeight: 1.7 }}>每一個你堅持的小習慣，<br />都能化成對世界的溫柔行動。</p>
      </div>
      <div className="cozy-card" style={S.card}>
        <label style={S.label}>先告訴我你的名字</label>
        <input style={S.input} placeholder="請輸入你的名字" value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && next()} />
      </div>
    </div>,

    // ── Step 1: Goals (up to 3) ──
    <div key={1}>
      <div style={{ padding: '8px 0 16px' }}>
        <p style={{ ...S.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>認識你的目標</p>
        <div style={{ ...S.h2, marginTop: 6 }}>今年你最想<br />達成什麼？</div>
        <p style={{ ...S.muted, fontSize: 13, marginTop: 6 }}>越具體越好，AI 才能給你真正有用的建議</p>
      </div>

      {goals.map((g, i) => (
        <GoalCard key={i} index={i} goal={g} onChange={v => updateGoal(i, v)} />
      ))}

      {goals.length < 3 && (
        <button onClick={addGoal}
          style={{ width: '100%', padding: 16, background: 'none', border: '1.5px dashed #EADFCF', borderRadius: 16, cursor: 'pointer', color: '#A08B7A', fontSize: 14, fontFamily: 'inherit' }}>
          + 新增第 {goals.length + 1} 個目標（最多 3 個）
        </button>
      )}
    </div>,

    // ── Step 2: Schedule ──
    <div key={2}>
      <div style={{ padding: '8px 0 16px' }}>
        <p style={{ ...S.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>了解你的生活</p>
        <div style={{ ...S.h2, marginTop: 6 }}>你通常什麼時候<br />最有精神、最有空？</div>
        <p style={{ ...S.muted, fontSize: 13, marginTop: 6 }}>AI 會把習慣安排在最適合你的時段（可多選）</p>
      </div>
      <div className="cozy-card" style={S.card}>
        <label style={S.label}>最佳執行時段</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {SCHEDULE_OPTIONS.map(o => (
            <div key={o} style={S.chip(schedule.includes(o))} onClick={() => toggleArr(schedule, setSchedule)(o)}>{o}</div>
          ))}
        </div>
      </div>
    </div>,

    // ── Step 3: Obstacles + Style ──
    <div key={3}>
      <div style={{ padding: '8px 0 16px' }}>
        <p style={{ ...S.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>了解你的挑戰</p>
        <div style={{ ...S.h2, marginTop: 6 }}>你最常在哪裡卡關？<br />你怎麼被激勵？</div>
      </div>
      <div className="cozy-card" style={S.card}>
        <label style={S.label}>主要障礙（可多選）</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {OBSTACLE_OPTIONS.map(o => (
            <div key={o} style={S.chip(obstacles.includes(o))} onClick={() => toggleArr(obstacles, setObstacles)(o)}>{o}</div>
          ))}
        </div>
      </div>
      <div className="cozy-card" style={S.card}>
        <label style={S.label}>你的學習與執行風格（選填）</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {STYLE_OPTIONS.map(o => (
            <div key={o} style={S.chip(style.includes(o))} onClick={() => toggleArr(style, setStyle)(o)}>{o}</div>
          ))}
        </div>
      </div>
    </div>,

    // ── Step 4: AI Suggestions ──
    <div key={4}>
      <div style={{ padding: '8px 0 16px' }}>
        <div style={S.h2}>專屬於你的<br />每日微習慣</div>
        <p style={{ ...S.muted, marginTop: 6 }}>根據你的目標和生活節奏量身設計，選擇你想開始的（可多選）</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 56, color: '#A08B7A' }}>
          <div style={{ fontSize: 36, marginBottom: 16, animation: 'spin 2s linear infinite', display: 'inline-block' }}>✦</div>
          <p style={{ fontWeight: 500 }}>正在分析你的目標…</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>設計最適合你的具體習慣計劃</p>
        </div>
      ) : (
        <>
          {/* Group by goal */}
          {goals.filter(g => g.text.trim()).map((g, gi) => {
            const goalSugs = suggestions.filter(s => s.goal_index === gi);
            if (!goalSugs.length) return null;
            return (
              <div key={gi}>
                <div style={{ ...S.row, marginBottom: 10, marginTop: gi > 0 ? 20 : 0 }}>
                  <div style={{ background: '#FDFBF7', borderRadius: 8, padding: '4px 10px', fontSize: 12, color: '#A08B7A', fontWeight: 500 }}>
                    {GOAL_CATEGORIES.find(c => c.label === g.category)?.emoji || '🎯'} 目標 {gi + 1}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{g.text}</div>
                </div>
                {goalSugs.map((h) => {
                  const idx = suggestions.indexOf(h);
                  const isSel = selected.has(idx);
                  return (
                    <div key={idx}
                      className="cozy-card" style={{ ...S.card, cursor: 'pointer', border: `1.5px solid ${isSel ? '#5AA37F' : '#EADFCF'}`, background: isSel ? '#E6F2EB' : '#FFFDF9', transition: 'all .2s' }}
                      onClick={() => setSelected(s => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; })}>
                      <div style={{ ...S.row, marginBottom: 8 }}>
                        <span style={{ background: diffBg(h.difficulty), color: diffColor(h.difficulty), padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 500 }}>{diffLabel(h.difficulty)}</span>
                        <span style={{ ...S.muted, fontSize: 12 }}>{h.duration}</span>
                        <span style={{ ...S.muted, fontSize: 12 }}>⏰ {h.timing}</span>
                        <div style={{ flex: 1 }} />
                        {isSel && <span style={{ color: '#5AA37F', fontWeight: 700, fontSize: 16 }}>✓</span>}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{h.title}</div>
                      <div style={{ fontSize: 13, color: '#6B5A4C', lineHeight: 1.6, marginBottom: 6 }}>{h.description}</div>
                      <div style={{ fontSize: 12, color: '#5AA37F', background: '#E6F2EB', padding: '4px 10px', borderRadius: 8, display: 'inline-block' }}>💡 {h.why}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {/* Show unmatched suggestions */}
          {suggestions.filter(s => s.goal_index >= goals.filter(g => g.text.trim()).length).map((h) => {
            const idx = suggestions.indexOf(h);
            const isSel = selected.has(idx);
            return (
              <div key={idx}
                className="cozy-card" style={{ ...S.card, cursor: 'pointer', border: `1.5px solid ${isSel ? '#5AA37F' : '#EADFCF'}`, background: isSel ? '#E6F2EB' : '#FFFDF9' }}
                onClick={() => setSelected(s => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; })}>
                <div style={{ ...S.row, marginBottom: 8 }}>
                  <span style={{ background: diffBg(h.difficulty), color: diffColor(h.difficulty), padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 500 }}>{diffLabel(h.difficulty)}</span>
                  <span style={{ ...S.muted, fontSize: 12 }}>{h.duration}</span>
                  {isSel && <span style={{ color: '#5AA37F', fontWeight: 700, fontSize: 16, marginLeft: 'auto' }}>✓</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{h.title}</div>
                <div style={{ fontSize: 13, color: '#6B5A4C', lineHeight: 1.6 }}>{h.description}</div>
              </div>
            );
          })}
        </>
      )}
    </div>,
  ];

  // Progress bar
  const progress = step < 4 ? (step / 4) * 100 : 100;

  // ── Step 4 rendered as live component (not static JSX) ──
  const Step4 = () => (
    <div>
      <div style={{ padding: '8px 0 16px' }}>
        <div style={S.h2}>專屬於你的<br />每日微習慣</div>
        <p style={{ ...S.muted, marginTop: 6 }}>根據你的目標和生活節奏量身設計，選擇你想開始的（可多選）</p>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 56, color: '#A08B7A' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>✦</div>
          <p style={{ fontWeight: 500 }}>正在分析你的目標…</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>設計最適合你的具體習慣計劃</p>
        </div>
      ) : suggestions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#A08B7A' }}>
          <p>載入中，請稍候…</p>
        </div>
      ) : (
        <>
          {goals.filter(g => g.text && g.text.trim()).map((g, gi) => {
            const goalSugs = suggestions.filter(s => Number(s.goal_index) === gi);
            if (!goalSugs.length) return null;
            return (
              <div key={gi} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: gi > 0 ? 20 : 0 }}>
                  <div style={{ background: '#FDFBF7', borderRadius: 8, padding: '4px 10px', fontSize: 12, color: '#A08B7A', fontWeight: 500 }}>
                    {GOAL_CATEGORIES.find(c => c.label === g.category)?.emoji || '🎯'} 目標 {gi + 1}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{g.text}</div>
                </div>
                {goalSugs.map((h, hi) => {
                  const sid = `${gi}-${hi}`;
                  const isSel = selected.has(sid);
                  return (
                    <div key={sid}
                      className="cozy-card" style={{ ...S.card, cursor: 'pointer', border: `1.5px solid ${isSel ? '#5AA37F' : '#EADFCF'}`, background: isSel ? '#E6F2EB' : '#FFFDF9', transition: 'all .2s' }}
                      onClick={() => setSelected(prev => { const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n; })}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ background: diffBg(h.difficulty), color: diffColor(h.difficulty), padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 500 }}>{diffLabel(h.difficulty)}</span>
                        <span style={{ color: '#A08B7A', fontSize: 12 }}>{h.duration}</span>
                        {h.timing && <span style={{ color: '#A08B7A', fontSize: 12 }}>⏰ {h.timing}</span>}
                        <div style={{ flex: 1 }} />
                        {isSel && <span style={{ color: '#5AA37F', fontWeight: 700, fontSize: 16 }}>✓</span>}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{h.title}</div>
                      <div style={{ fontSize: 13, color: '#6B5A4C', lineHeight: 1.6, marginBottom: 8 }}>{h.description}</div>
                      {h.why && <div style={{ fontSize: 12, color: '#5AA37F', background: '#E6F2EB', padding: '4px 10px', borderRadius: 8, display: 'inline-block' }}>💡 {h.why}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {/* suggestions without a matched goal */}
          {suggestions.filter(s => {
            const gi = Number(s.goal_index);
            return isNaN(gi) || gi >= goals.filter(g => g.text && g.text.trim()).length;
          }).map((h, hi) => {
            const sid = `extra-${hi}`;
            const isSel = selected.has(sid);
            return (
              <div key={sid}
                className="cozy-card" style={{ ...S.card, cursor: 'pointer', border: `1.5px solid ${isSel ? '#5AA37F' : '#EADFCF'}`, background: isSel ? '#E6F2EB' : '#FFFDF9' }}
                onClick={() => setSelected(prev => { const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n; })}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ background: diffBg(h.difficulty), color: diffColor(h.difficulty), padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 500 }}>{diffLabel(h.difficulty)}</span>
                  <span style={{ color: '#A08B7A', fontSize: 12 }}>{h.duration}</span>
                  {isSel && <span style={{ color: '#5AA37F', fontWeight: 700, fontSize: 16, marginLeft: 'auto' }}>✓</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{h.title}</div>
                <div style={{ fontSize: 13, color: '#6B5A4C', lineHeight: 1.6 }}>{h.description}</div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );

  return (
    <div style={S.bg}>
      {/* Progress bar */}
      {step > 0 && step < 4 && (
        <div style={{ position: 'sticky', top: 0, background: '#FDFBF7', zIndex: 10, padding: '12px 20px 0' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <div style={{ background: '#EADFCF', borderRadius: 100, height: 3 }}>
              <div style={{ background: '#5AA37F', height: 3, borderRadius: 100, width: `${progress}%`, transition: 'width .4s ease' }} />
            </div>
          </div>
        </div>
      )}

      <div style={S.app}>
        {step === 4 ? <Step4 /> : step === 1 && smartReviews !== null ? (
          // ── SMART Review overlay ──
          <div>
            <div style={{ padding: '8px 0 16px' }}>
              <p style={{ ...S.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>目標審視</p>
              <div style={{ ...S.h2, marginTop: 6 }}>讓目標更清晰</div>
              <p style={{ ...S.muted, fontSize: 13, marginTop: 6 }}>AI 幫你確認目標是否具體可執行</p>
            </div>
            {goals.filter(g => g.text.trim()).map((g, i) => {
              const review = smartReviews[i];
              if (!review) return null;
              const needsMeasurable = !review.measurable;
              return (
                <div key={i} className="cozy-card" style={{ ...S.card, marginBottom: 14 }}>
                  <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 12 }}>
                    {GOAL_CATEGORIES.find(c => c.label === g.category)?.emoji || '🎯'} {g.text}
                  </div>
                  {review.rewrite && (
                    <div style={{ background: '#FBF3D8', border: '1px solid #EBD9B2', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#C89043' }}>
                      💡 建議改寫：「{review.rewrite}」
                    </div>
                  )}
                  {[
                    { key: 'specific', label: 'S 具體', value: review.specific },
                    { key: 'measurable', label: 'M 可衡量', value: review.measurable, required: true },
                    { key: 'timeBound', label: 'T 有時限', value: review.timeBound },
                  ].map(({ key, label, value, required }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{value ? '✅' : '❌'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#A08B7A', marginBottom: 3 }}>{label}</div>
                        {required && !value ? (
                          <input
                            style={{ ...S.input, fontSize: 13 }}
                            placeholder="請填入具體數字或標準，例：每週跑 3 次、體重降 5kg"
                            value={smartMeasurables[i] || ''}
                            onChange={e => setSmartMeasurables(arr => arr.map((v, idx) => idx === i ? e.target.value : v))}
                          />
                        ) : (
                          <div style={{ fontSize: 13, color: value ? '#4A3B31' : '#A08B7A' }}>
                            {value || '未偵測到，請在目標描述中補充'}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 14, borderTop: '1px solid #EADFCF', paddingTop: 12 }}>
                    <label style={S.label}>身份認同句</label>
                    <input
                      style={{ ...S.input, marginTop: 6 }}
                      value={smartIdentities[i] || ''}
                      onChange={e => setSmartIdentities(arr => arr.map((v, idx) => idx === i ? e.target.value : v))}
                      placeholder="我是一個..."
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : stepContent[step]}
        <div style={{ ...S.row, marginTop: 20 }}>
          {step === 1 && smartReviews !== null ? (
            <>
              <button style={S.btn('secondary')} onClick={() => setSmartReviews(null)}>← 返回</button>
              <button style={{ ...S.btn('primary'), flex: 1 }} onClick={confirmSmartReview}>確認目標 →</button>
            </>
          ) : (
            <>
              {step > 0 && step < 4 && (
                <button style={S.btn('secondary')} onClick={() => setStep(s => s - 1)}>← 返回</button>
              )}
              {step < 4 && (
                <button style={{ ...S.btn('primary'), flex: 1 }} onClick={next} disabled={loading}>
                  {loading ? '分析中…' : step === 3 ? '生成我的習慣計劃 ✦' : '繼續 →'}
                </button>
              )}
              {step === 4 && !loading && (
                <button style={{ ...S.btn('primary'), flex: 1 }} onClick={confirmHabits}>
                  開始我的旅程 →
                </button>
              )}
            </>
          )}
        </div>
      </div>
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  if (!res.ok || !data.content) throw new Error(data.error?.message || 'API error');
  const text = data.content.map(i => i.text || '').join('').replace(/```json|```/g, '').trim();
  return JSON.parse(text);
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
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
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
    const [h, c, f] = await Promise.all([
      supa.get('habits', `user_id=eq.${user.id}&is_active=eq.true&order=created_at.asc`),
      supa.get('checkins', `user_id=eq.${user.id}&order=checked_date.desc`),
      supa.get('fund_uses', `user_id=eq.${user.id}&order=created_at.desc`),
    ]);
    setHabits(h || []); setCheckins(c || []); setFundUses(f || []);
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

  const deleteHabit = async (id) => {
    if (!confirm('確定要刪除這個習慣嗎？')) return;
    try { await supa.patch('habits', `id=eq.${id}`, { is_active: false }); await load(); toast('習慣已刪除'); } catch { toast('刪除失敗'); }
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

  // ── HABITS ────────────────────────────────────────────
  const HabitsTab = () => (
    <div>
      <div style={{ ...S.row, padding: '12px 0 24px' }}>
        <div><div style={S.h2}>習慣管理</div><p style={S.muted}>管理你的所有習慣</p></div>
        <div style={{ flex: 1 }} />
        <button style={{ ...S.btn('primary'), padding: '9px 18px', fontSize: 13 }} onClick={() => {
          if (habits.length >= 5) { setShowCapWarning(true); }
          else setModal('add');
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
                  <button onClick={() => deleteHabit(h.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A08B7A', fontSize: 20, lineHeight: 1 }}>×</button>
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

  const tabs = { today: <TodayTab />, habits: <HabitsTab />, fund: <FundTab />, dashboard: <DashboardTab /> };

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

      {/* Nav */}
      <nav style={S.nav}>
        {[
          { id: 'today', label: '今日', icon: '◷' },
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
              <button style={{ ...S.btn('primary'), flex: 1 }} onClick={() => { setShowCapWarning(false); setModal('add'); }}>我了解，繼續新增</button>
            </div>
          </div>
        </div>
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

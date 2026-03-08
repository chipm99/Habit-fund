import { useState, useEffect, useCallback } from "react";
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://keenwhiygrrnxhllibxa.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ZrftrM1kZGX3odvfJQG0Pw_jNriTgc6';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Supabase client ──────────────────────────────────────
const supa = {
  async req(path, opts = {}) {
    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      ...opts,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
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
const diffColor = d => ({ easy: '#2D6A4F', medium: '#B5935A', hard: '#E76F51' }[d]);
const diffBg = d => ({ easy: '#D8F3DC', medium: '#FDF3E3', hard: '#FDEBD0' }[d]);

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
    end.setDate(d.getDate() - ((d.getDay() + 6) % 7) - (w - 1) * 7);
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

// ── Styles (inline) ──────────────────────────────────────
const S = {
  bg: { background: '#F7F5F2', minHeight: '100vh', fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", fontSize: 15, color: '#1A1714' },
  app: { maxWidth: 680, margin: '0 auto', padding: '28px 20px 100px' },
  card: { background: '#fff', border: '1px solid #E8E4DF', borderRadius: 16, padding: 24, boxShadow: '0 2px 20px rgba(0,0,0,0.06)', marginBottom: 14 },
  btn: (type = 'primary') => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '11px 24px', borderRadius: 100, fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
    cursor: 'pointer', border: 'none', transition: 'all .2s',
    background: type === 'primary' ? '#2D6A4F' : type === 'warm' ? '#E76F51' : '#E8E4DF',
    color: type === 'secondary' ? '#1A1714' : '#fff',
  }),
  input: { width: '100%', padding: '11px 14px', border: '1.5px solid #E8E4DF', borderRadius: 10, fontFamily: 'inherit', fontSize: 15, outline: 'none', background: '#fff', color: '#1A1714', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: 12, fontWeight: 500, color: '#8A857F', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' },
  chip: (sel) => ({ padding: '8px 16px', borderRadius: 100, border: `1.5px solid ${sel ? '#2D6A4F' : '#E8E4DF'}`, background: sel ? '#D8F3DC' : '#fff', color: sel ? '#2D6A4F' : '#1A1714', cursor: 'pointer', fontSize: 14, fontWeight: sel ? 500 : 400, transition: 'all .2s', whiteSpace: 'nowrap' }),
  display: { fontFamily: "'Georgia', serif", fontSize: '2rem', lineHeight: 1.25, fontWeight: 400 },
  h2: { fontFamily: "'Georgia', serif", fontSize: '1.45rem', fontWeight: 400, marginBottom: 6 },
  muted: { color: '#8A857F' },
  nav: { position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #E8E4DF', display: 'flex', zIndex: 100 },
  navBtn: (active) => ({ flex: 1, padding: '13px 8px 11px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 500, color: active ? '#2D6A4F' : '#8A857F', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontFamily: 'inherit' }),
  row: { display: 'flex', alignItems: 'center', gap: 12 },
  modalBg: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'flex-end' },
  modal: { background: '#fff', borderRadius: '24px 24px 0 0', padding: '28px 24px', width: '100%', maxHeight: '85vh', overflowY: 'auto' },
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
          <div style={S.display}>好習慣基金<br /><em style={{ color: '#2D6A4F', fontStyle: 'italic' }}>Habit Fund</em></div>
          <p style={{ ...S.muted, marginTop: 14, lineHeight: 1.7 }}>每一個你堅持的小習慣，<br />都能化成對世界的溫柔行動。</p>
        </div>
        <div style={S.card}>
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
    <div style={{ ...S.card, border: '1.5px solid #E8E4DF' }}>
      <div style={{ ...S.row, marginBottom: 16 }}>
        <div style={{ background: '#F7F5F2', borderRadius: 10, padding: '8px 12px', fontSize: 20 }}>{cat?.emoji || '🎯'}</div>
        <div style={{ flex: 1, fontWeight: 500 }}>目標 {index + 1}</div>
        {index > 0 && (
          <button onClick={() => onChange(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A857F', fontSize: 20 }}>×</button>
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
        <label style={S.label}>具體目標 <span style={{ color: '#2D6A4F' }}>*</span></label>
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
    setStep(s => s + 1);
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
        <div style={S.display}>你好，<br />歡迎來到<br /><em style={{ color: '#2D6A4F', fontStyle: 'italic' }}>好習慣基金</em></div>
        <p style={{ ...S.muted, marginTop: 14, lineHeight: 1.7 }}>每一個你堅持的小習慣，<br />都能化成對世界的溫柔行動。</p>
      </div>
      <div style={S.card}>
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
          style={{ width: '100%', padding: 16, background: 'none', border: '1.5px dashed #E8E4DF', borderRadius: 16, cursor: 'pointer', color: '#8A857F', fontSize: 14, fontFamily: 'inherit' }}>
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
      <div style={S.card}>
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
      <div style={S.card}>
        <label style={S.label}>主要障礙（可多選）</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {OBSTACLE_OPTIONS.map(o => (
            <div key={o} style={S.chip(obstacles.includes(o))} onClick={() => toggleArr(obstacles, setObstacles)(o)}>{o}</div>
          ))}
        </div>
      </div>
      <div style={S.card}>
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
        <div style={{ textAlign: 'center', padding: 56, color: '#8A857F' }}>
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
                  <div style={{ background: '#F7F5F2', borderRadius: 8, padding: '4px 10px', fontSize: 12, color: '#8A857F', fontWeight: 500 }}>
                    {GOAL_CATEGORIES.find(c => c.label === g.category)?.emoji || '🎯'} 目標 {gi + 1}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{g.text}</div>
                </div>
                {goalSugs.map((h) => {
                  const idx = suggestions.indexOf(h);
                  const isSel = selected.has(idx);
                  return (
                    <div key={idx}
                      style={{ ...S.card, cursor: 'pointer', border: `1.5px solid ${isSel ? '#2D6A4F' : '#E8E4DF'}`, background: isSel ? '#D8F3DC' : '#fff', transition: 'all .2s' }}
                      onClick={() => setSelected(s => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; })}>
                      <div style={{ ...S.row, marginBottom: 8 }}>
                        <span style={{ background: diffBg(h.difficulty), color: diffColor(h.difficulty), padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 500 }}>{diffLabel(h.difficulty)}</span>
                        <span style={{ ...S.muted, fontSize: 12 }}>{h.duration}</span>
                        <span style={{ ...S.muted, fontSize: 12 }}>⏰ {h.timing}</span>
                        <div style={{ flex: 1 }} />
                        {isSel && <span style={{ color: '#2D6A4F', fontWeight: 700, fontSize: 16 }}>✓</span>}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{h.title}</div>
                      <div style={{ fontSize: 13, color: '#444', lineHeight: 1.6, marginBottom: 6 }}>{h.description}</div>
                      <div style={{ fontSize: 12, color: '#2D6A4F', background: '#D8F3DC', padding: '4px 10px', borderRadius: 8, display: 'inline-block' }}>💡 {h.why}</div>
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
                style={{ ...S.card, cursor: 'pointer', border: `1.5px solid ${isSel ? '#2D6A4F' : '#E8E4DF'}`, background: isSel ? '#D8F3DC' : '#fff' }}
                onClick={() => setSelected(s => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; })}>
                <div style={{ ...S.row, marginBottom: 8 }}>
                  <span style={{ background: diffBg(h.difficulty), color: diffColor(h.difficulty), padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 500 }}>{diffLabel(h.difficulty)}</span>
                  <span style={{ ...S.muted, fontSize: 12 }}>{h.duration}</span>
                  {isSel && <span style={{ color: '#2D6A4F', fontWeight: 700, fontSize: 16, marginLeft: 'auto' }}>✓</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{h.title}</div>
                <div style={{ fontSize: 13, color: '#444', lineHeight: 1.6 }}>{h.description}</div>
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
        <div style={{ textAlign: 'center', padding: 56, color: '#8A857F' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>✦</div>
          <p style={{ fontWeight: 500 }}>正在分析你的目標…</p>
          <p style={{ fontSize: 13, marginTop: 6 }}>設計最適合你的具體習慣計劃</p>
        </div>
      ) : suggestions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8A857F' }}>
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
                  <div style={{ background: '#F7F5F2', borderRadius: 8, padding: '4px 10px', fontSize: 12, color: '#8A857F', fontWeight: 500 }}>
                    {GOAL_CATEGORIES.find(c => c.label === g.category)?.emoji || '🎯'} 目標 {gi + 1}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{g.text}</div>
                </div>
                {goalSugs.map((h, hi) => {
                  const sid = `${gi}-${hi}`;
                  const isSel = selected.has(sid);
                  return (
                    <div key={sid}
                      style={{ ...S.card, cursor: 'pointer', border: `1.5px solid ${isSel ? '#2D6A4F' : '#E8E4DF'}`, background: isSel ? '#D8F3DC' : '#fff', transition: 'all .2s' }}
                      onClick={() => setSelected(prev => { const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n; })}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{ background: diffBg(h.difficulty), color: diffColor(h.difficulty), padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 500 }}>{diffLabel(h.difficulty)}</span>
                        <span style={{ color: '#8A857F', fontSize: 12 }}>{h.duration}</span>
                        {h.timing && <span style={{ color: '#8A857F', fontSize: 12 }}>⏰ {h.timing}</span>}
                        <div style={{ flex: 1 }} />
                        {isSel && <span style={{ color: '#2D6A4F', fontWeight: 700, fontSize: 16 }}>✓</span>}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{h.title}</div>
                      <div style={{ fontSize: 13, color: '#444', lineHeight: 1.6, marginBottom: 8 }}>{h.description}</div>
                      {h.why && <div style={{ fontSize: 12, color: '#2D6A4F', background: '#D8F3DC', padding: '4px 10px', borderRadius: 8, display: 'inline-block' }}>💡 {h.why}</div>}
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
                style={{ ...S.card, cursor: 'pointer', border: `1.5px solid ${isSel ? '#2D6A4F' : '#E8E4DF'}`, background: isSel ? '#D8F3DC' : '#fff' }}
                onClick={() => setSelected(prev => { const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n; })}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ background: diffBg(h.difficulty), color: diffColor(h.difficulty), padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 500 }}>{diffLabel(h.difficulty)}</span>
                  <span style={{ color: '#8A857F', fontSize: 12 }}>{h.duration}</span>
                  {isSel && <span style={{ color: '#2D6A4F', fontWeight: 700, fontSize: 16, marginLeft: 'auto' }}>✓</span>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{h.title}</div>
                <div style={{ fontSize: 13, color: '#444', lineHeight: 1.6 }}>{h.description}</div>
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
        <div style={{ position: 'sticky', top: 0, background: '#F7F5F2', zIndex: 10, padding: '12px 20px 0' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <div style={{ background: '#E8E4DF', borderRadius: 100, height: 3 }}>
              <div style={{ background: '#2D6A4F', height: 3, borderRadius: 100, width: `${progress}%`, transition: 'width .4s ease' }} />
            </div>
          </div>
        </div>
      )}

      <div style={S.app}>
        {step === 4 ? <Step4 /> : stepContent[step]}
        <div style={{ ...S.row, marginTop: 20 }}>
          {step > 0 && step < 4 && (
            <button style={S.btn('secondary')} onClick={() => setStep(s => s - 1)}>← 返回</button>
          )}
          {step < 4 && (
            <button style={{ ...S.btn('primary'), flex: 1 }} onClick={next} disabled={loading}>
              {step === 3 ? '生成我的習慣計劃 ✦' : '繼續 →'}
            </button>
          )}
          {step === 4 && !loading && (
            <button style={{ ...S.btn('primary'), flex: 1 }} onClick={confirmHabits}>
              開始我的旅程 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Mini Calendar ────────────────────────────────────────
function MiniCalendar({ checkedDates }) {
  const days = ['日','一','二','三','四','五','六'];
  const today = todayStr();
  const end = new Date(); end.setHours(0,0,0,0);
  const start = new Date(end); start.setDate(end.getDate() - 34);
  const startDay = start.getDay();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  let d = new Date(start);
  while (d <= end) {
    cells.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
        {days.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 10, color: '#8A857F', fontWeight: 500 }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
        {cells.map((ds, i) => (
          <div key={i} style={{
            aspectRatio: '1', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
            background: ds && checkedDates.has(ds) ? '#2D6A4F' : 'transparent',
            color: ds && checkedDates.has(ds) ? '#fff' : '#8A857F',
            outline: ds === today ? '2px solid #2D6A4F' : 'none',
            outlineOffset: -2,
            opacity: ds ? 1 : 0,
          }}>{ds ? new Date(ds + 'T00:00:00').getDate() : ''}</div>
        ))}
      </div>
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={S.modalBg} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={{ width: 40, height: 4, background: '#E8E4DF', borderRadius: 2, margin: '0 auto 24px' }} />
        <div style={{ ...S.h2, marginBottom: 20 }}>{title}</div>
        {children}
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

  useEffect(() => { load(); }, [load]);

  const todayCheckins = new Set(checkins.filter(c => c.checked_date === todayStr()).map(c => c.habit_id));

  const calcFund = () => {
    const earned = habits.reduce((s, h) => s + checkins.filter(c => c.habit_id === h.id).length * h.fund_per_day, 0);
    const used = fundUses.reduce((s, u) => s + Number(u.amount), 0);
    return { earned, used, balance: earned - used };
  };

  const toggleCheckin = async (hId, done) => {
    try {
      if (done) await supa.del('checkins', `habit_id=eq.${hId}&checked_date=eq.${todayStr()}`);
      else { await supa.post('checkins', { habit_id: hId, user_id: user.id, checked_date: todayStr() }); toast('打卡成功！繼續保持 🌟'); }
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
        <div style={{ ...S.display, marginTop: 4, fontSize: '1.75rem' }}>{greet}，<em style={{ color: '#2D6A4F', fontStyle: 'italic' }}>{user.name}</em> 👋</div>
      </div>

      {habits.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#8A857F' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
          <p>去「習慣」頁面新增你的第一個習慣吧！</p>
        </div>
      ) : (<>
        <div style={S.card}>
          <div style={{ ...S.row, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: '#8A857F', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>今日完成</div>
              <div style={{ fontSize: 17, fontWeight: 500, marginTop: 2 }}>{doneCount} / {habits.length} 個習慣</div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 28 }}>{doneCount === habits.length ? '🎉' : '💪'}</div>
          </div>
          <div style={{ background: '#E8E4DF', borderRadius: 100, height: 5, overflow: 'hidden' }}>
            <div style={{ background: '#2D6A4F', height: 5, borderRadius: 100, width: `${habits.length ? (doneCount / habits.length * 100) : 0}%`, transition: 'width .5s ease' }} />
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
              <span style={{ color: '#8A857F', fontSize: 13 }}>{collapsed['today-' + goalLabel] ? '▶' : '▼'}</span>
            </div>
            {!collapsed['today-' + goalLabel] && (
              <div style={S.card}>
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
                    <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid #E8E4DF' }}>
                      <button
                        onClick={() => {
                          if (isWeekly && weeklyDone && !todayCheckins.has(h.id)) return; // can't uncheck weekly via today
                          toggleCheckin(h.id, isWeekly ? todayCheckins.has(h.id) : done);
                        }}
                        style={{
                          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${done ? '#2D6A4F' : '#E8E4DF'}`,
                          background: done ? '#2D6A4F' : 'none', cursor: (isWeekly && weeklyDone && !todayCheckins.has(h.id)) ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: done ? '#fff' : 'transparent', fontSize: 16
                        }}>✓</button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, opacity: done ? 0.4 : 1, textDecoration: done ? 'line-through' : 'none' }}>{h.title}</div>
                        {isWeekly ? (
                          <div style={{ marginTop: 6 }}>
                            <div style={{ fontSize: 12, color: '#8A857F', marginBottom: 4 }}>
                              NT${h.fund_per_day}/次 · {weeklyCount} / {freq.times} 次（本週）
                            </div>
                            <div style={{ background: '#E8E4DF', borderRadius: 100, height: 4, overflow: 'hidden', maxWidth: 120 }}>
                              <div style={{ background: '#2D6A4F', height: 4, borderRadius: 100, width: `${Math.min(100, weeklyCount / freq.times * 100)}%`, transition: 'width .4s ease' }} />
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#8A857F', marginTop: 2 }}>NT${h.fund_per_day}/天 · {diffLabel(h.difficulty)}</div>
                        )}
                      </div>
                      {streak > 0 && (
                        <div style={{ background: '#FDF3E3', color: '#B5935A', padding: '4px 10px', borderRadius: 100, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>
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

        <div style={{ ...S.card, display: 'flex', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: '#8A857F', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>今日可累積</div>
            <div style={{ fontFamily: "'Georgia',serif", fontSize: '2rem', color: '#B5935A', marginTop: 2 }}>NT${habits.filter(h => todayCheckins.has(h.id)).reduce((s, h) => s + h.fund_per_day, 0)}</div>
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
        <button style={{ ...S.btn('primary'), padding: '9px 18px', fontSize: 13 }} onClick={() => { setForm({ diff: 'medium' }); setModal('add'); }}>+ 新增</button>
      </div>
      {habits.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#8A857F' }}>
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
            <span style={{ color: '#8A857F', fontSize: 13 }}>{collapsed['habits-' + goalLabel] ? '▶' : '▼'}</span>
          </div>
          {!collapsed['habits-' + goalLabel] && groupHabits.map(h => {
            const freq = h.frequency || { type: 'daily' };
            const isWeekly = freq.type === 'weekly';
            const streak = isWeekly
              ? getWeeklyStreak(h.id, checkins, freq.times)
              : getStreak(h.id, checkins);
            const total = checkins.filter(c => c.habit_id === h.id).length;
            const userGoals = (user.values_answers?.goals || []).filter(g => g.text?.trim());
            return (
              <div key={h.id} style={S.card}>
                <div style={{ ...S.row, marginBottom: 10 }}>
                  <span style={{ background: diffBg(h.difficulty), color: diffColor(h.difficulty), padding: '3px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500 }}>{diffLabel(h.difficulty)}</span>
                  <span style={{ ...S.muted, fontSize: 12, flex: 1, textAlign: 'right' }}>
                    {isWeekly ? `NT$${h.fund_per_day}/次 · 每週${freq.times}次` : `NT$${h.fund_per_day}/天`}
                  </span>
                  <button onClick={() => deleteHabit(h.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8A857F', fontSize: 20, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ fontWeight: 500, fontSize: 15 }}>{h.title}</div>
                {h.description && <div style={{ fontSize: 13, color: '#8A857F', marginTop: 4 }}>{h.description}</div>}
                <div style={{ ...S.row, marginTop: 12 }}>
                  <span style={{ ...S.muted, fontSize: 12 }}>🔥 連續 {streak}{isWeekly ? '週' : '天'}</span>
                  <span style={{ ...S.muted, fontSize: 12 }}>📅 累計 {total} 次</span>
                  <span style={{ ...S.muted, fontSize: 12 }}>💰 NT${total * h.fund_per_day}</span>
                </div>
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
        <div style={{ ...S.card, textAlign: 'center', padding: 36 }}>
          <div style={{ fontSize: 12, color: '#8A857F', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>基金餘額</div>
          <div style={{ fontFamily: "'Georgia',serif", fontSize: '3rem', color: '#B5935A', margin: '10px 0 6px' }}>NT${balance}</div>
          <p style={{ ...S.muted, fontSize: 13 }}>每一分都來自你的堅持</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <button style={{ ...S.btn('primary'), width: '100%', justifyContent: 'center' }} onClick={() => { setForm({}); setModal('donate'); }}>🌍 捐給慈善</button>
          <button style={{ ...S.btn('warm'), width: '100%', justifyContent: 'center' }} onClick={() => { setForm({}); setModal('gift'); }}>🎁 買小禮物</button>
        </div>
        <div style={{ ...S.card, marginTop: 14 }}>
          <div style={{ fontWeight: 500, marginBottom: 16 }}>使用紀錄</div>
          {fundUses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#8A857F' }}><div style={{ fontSize: 28, marginBottom: 8 }}>✨</div><p>還沒有任何紀錄</p></div>
          ) : fundUses.map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #E8E4DF' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{u.type === 'charity' ? '🌍 ' : '🎁 '}{u.description}</div>
                <div style={{ fontSize: 12, color: '#8A857F' }}>{new Date(u.created_at).toLocaleDateString('zh-TW')}</div>
              </div>
              <div style={{ fontWeight: 500, color: '#E76F51' }}>-NT${u.amount}</div>
            </div>
          ))}
        </div>
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
        <button onClick={onSignOut} style={{ background: 'none', border: '1px solid #E8E4DF', borderRadius: 100, padding: '7px 16px', fontSize: 12, color: '#8A857F', cursor: 'pointer', fontFamily: 'inherit' }}>登出</button>
      </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: '總打卡天數', val: totalDays, unit: '天' },
            { label: '最長連續', val: maxStreak, unit: '天' },
            { label: '進行中習慣', val: habits.length, unit: '個' },
            { label: '基金餘額', val: `NT$${balance}`, unit: '' },
          ].map(s => (
            <div key={s.label} style={{ ...S.card, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#8A857F', fontWeight: 500, marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontFamily: "'Georgia',serif", fontSize: '2rem', color: '#B5935A' }}>{s.val}</div>
              {s.unit && <div style={{ ...S.muted, fontSize: 12 }}>{s.unit}</div>}
            </div>
          ))}
        </div>
        {habits.map(h => {
          const hCheckins = new Set(checkins.filter(c => c.habit_id === h.id).map(c => c.checked_date));
          return (
            <div key={h.id} style={{ ...S.card, marginTop: 14 }}>
              <div style={{ ...S.row, marginBottom: 12 }}>
                <strong>{h.title}</strong>
                <span style={{ ...S.muted, fontSize: 12, marginLeft: 'auto' }}>累計 {hCheckins.size} 天</span>
              </div>
              <MiniCalendar checkedDates={hCheckins} />
            </div>
          );
        })}
        {v.goals?.filter(g => g.text?.trim()).length > 0 && (
          <div style={{ ...S.card, marginTop: 14 }}>
            <div style={{ fontWeight: 500, marginBottom: 14 }}>你的目標</div>
            {v.goals.filter(g => g.text?.trim()).map((g, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12, paddingBottom: 12, borderBottom: i < v.goals.filter(g2 => g2.text?.trim()).length - 1 ? "1px solid #E8E4DF" : "none" }}>
                <div style={{ fontSize: 20, flexShrink: 0 }}>{GOAL_CATEGORIES.find(c => c.label === g.category)?.emoji || "🎯"}</div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{g.text}</div>
                  <div style={{ color: "#8A857F", fontSize: 12, marginTop: 3 }}>{[g.category, g.deadline, g.timePerDay].filter(Boolean).join(" · ")}</div>
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

      {/* Add Habit Modal */}
      <Modal open={modal === 'add'} onClose={() => setModal(null)} title="新增習慣">
        {['title:習慣名稱:例：每天靜坐 10 分鐘', 'desc:說明（選填）:為什麼這個習慣對你重要？'].map(f => {
          const [key, label, ph] = f.split(':');
          return <div key={key} style={{ marginBottom: 18 }}>
            <label style={S.label}>{label}</label>
            <input style={S.input} placeholder={ph} value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
          </div>;
        })}
        <div style={{ marginBottom: 18 }}>
          <label style={S.label}>難度</label>
          <select style={S.input} value={form.diff || 'medium'} onChange={e => setForm(f => ({ ...f, diff: e.target.value }))}>
            <option value="easy">輕鬆 — NT$5/天</option>
            <option value="medium">適中 — NT$10/天</option>
            <option value="hard">挑戰 — NT$20/天</option>
          </select>
        </div>
        <div style={{ ...S.row, marginTop: 8 }}>
          <button style={{ ...S.btn('secondary'), flex: 1 }} onClick={() => setModal(null)}>取消</button>
          <button style={{ ...S.btn('primary'), flex: 1 }} onClick={saveHabit}>儲存習慣</button>
        </div>
      </Modal>

      {/* Donate Modal */}
      <Modal open={modal === 'donate'} onClose={() => setModal(null)} title="捐給慈善機構">
        <p style={{ ...S.muted, marginBottom: 20, fontSize: 14 }}>基金餘額：<strong style={{ color: '#1A1714' }}>NT${balance}</strong></p>
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
        <p style={{ ...S.muted, marginBottom: 20, fontSize: 14 }}>基金餘額：<strong style={{ color: '#1A1714' }}>NT${balance}</strong></p>
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
      <div style={{ textAlign: 'center', color: '#8A857F' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
        <p>載入中…</p>
      </div>
    </div>
  );

  return (
    <div>
      {/* Toast */}
      <div style={{
        position: 'fixed', top: 24, left: '50%', transform: `translateX(-50%) translateY(${show ? 0 : -80}px)`,
        background: '#1A1714', color: '#fff', padding: '12px 24px', borderRadius: 100,
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

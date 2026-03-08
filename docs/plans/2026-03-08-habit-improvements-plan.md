# Habit App Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add goal grouping, AI-assisted habit creation, and weekly frequency support to the habit-fund app.

**Architecture:** All changes are in `src/App.jsx` (single-file React app). Two new columns on the Supabase `habits` table (`goal_label`, `frequency`). No new files needed except the schema migration which the user runs manually in Supabase.

**Tech Stack:** React 18, Vite, Supabase REST API (custom `supa` client), `@supabase/supabase-js` (auth only), inline styles, deployed on Vercel.

---

## Pre-requisites (User must do before starting)

Run this SQL in Supabase dashboard → SQL Editor:
```sql
ALTER TABLE habits ADD COLUMN goal_label TEXT;
ALTER TABLE habits ADD COLUMN frequency JSONB DEFAULT '{"type":"daily"}';
```

Verify by checking the `habits` table has the two new columns.

---

## Task 1: Add helper functions for weekly logic

**Files:**
- Modify: `src/App.jsx` — helper section (after line ~34, near `diffColor`/`diffBg`)

**What to add:** Two helpers needed everywhere:
1. `weekStart()` — returns Monday's date string for the current week
2. `getWeeklyCount(habitId, checkins)` — counts check-ins this Mon–Sun

**Step 1: Add helpers after the existing helper functions**

Find this block in App.jsx:
```js
const diffColor = d => ({ easy: '#2D6A4F', medium: '#B5935A', hard: '#E76F51' }[d]);
const diffBg = d => ({ easy: '#D8F3DC', medium: '#FDF3E3', hard: '#FDEBD0' }[d]);
```

Add immediately after:
```js
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
```

**Step 2: Manual verify**
Open browser console on the dev server (`npm run dev`) — no errors on load.

**Step 3: Commit**
```bash
git add src/App.jsx
git commit -m "feat: add weekly frequency helper functions"
```

---

## Task 2: Update Today tab — weekly habit card + goal grouping

**Files:**
- Modify: `src/App.jsx` — `TodayTab` component (~line 800)

**What changes:**
- Group habits by `goal_label` (null → "其他")
- Each group has a collapsible header, default expanded
- Weekly habit cards show `X / N 次` progress bar instead of streak
- `toggleCheckin` must block extra check-ins when weekly target already met

**Step 1: Add collapsed state to MainApp**

Find `const [form, setForm] = useState({});` in `MainApp` and add after it:
```js
const [collapsed, setCollapsed] = useState({});
const toggleCollapse = (key) => setCollapsed(s => ({ ...s, [key]: !s[key] }));
```

**Step 2: Add a `groupByGoal` helper inside MainApp**

Add after `const toggleCollapse` line:
```js
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
```

**Step 3: Add goal emoji lookup helper inside MainApp**

```js
const goalEmoji = (label) => {
  const v = user.values_answers || {};
  const g = (v.goals || []).find(g => g.text === label);
  if (!g) return '📌';
  return GOAL_CATEGORIES.find(c => c.label === g.category)?.emoji || '🎯';
};
```

**Step 4: Replace TodayTab habit list with grouped version**

Find the existing habit list inside `TodayTab` — the block that starts with:
```js
<div style={S.card}>
  {habits.map(h => {
    const done = todayCheckins.has(h.id);
    const streak = getStreak(h.id, checkins);
```

Replace the entire `<div style={S.card}>…</div>` habit list block with:
```jsx
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
```

**Step 5: Manual verify**
- `npm run dev` — Today tab shows habits grouped by goal
- Collapsing works
- Weekly habit shows progress bar

**Step 6: Commit**
```bash
git add src/App.jsx
git commit -m "feat: group habits by goal in Today tab, add weekly habit display"
```

---

## Task 3: Update Habits tab — goal grouping + goal reassignment dropdown

**Files:**
- Modify: `src/App.jsx` — `HabitsTab` component (~line 862)

**Step 1: Add saveGoalLabel helper inside MainApp**

Find `const deleteHabit = async` and add before it:
```js
const saveGoalLabel = async (habitId, goalLabel) => {
  try {
    await supa.patch('habits', `id=eq.${habitId}`, { goal_label: goalLabel || null });
    await load();
  } catch { toast('更新失敗'); }
};
```

**Step 2: Replace HabitsTab with grouped + reassignment version**

Find the entire `HabitsTab` component and replace its inner habit list (the `habits.map(h => ...)` block) with:

```jsx
{Object.entries(groupByGoal(habits)).map(([goalLabel, groupHabits]) => (
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
```

**Step 3: Manual verify**
- Habits tab shows goal groups
- Dropdown appears on each card — changing it moves the habit to the right group on next reload
- 週 habits show "每週N次" label

**Step 4: Commit**
```bash
git add src/App.jsx
git commit -m "feat: group habits by goal in Habits tab, add goal reassignment"
```

---

## Task 4: Replace Add Habit modal with AI-assisted flow

**Files:**
- Modify: `src/App.jsx` — `AddHabitModal` (new component) + `MainApp`

**Step 1: Add `AddHabitModal` component before `MainApp`**

Add this entire component before `function MainApp`:

```jsx
function AddHabitModal({ user, onClose, onSaved, toast }) {
  const [step, setStep] = useState(0); // 0=choose, 1=pick/create goal, 2=suggestions, 3=frequency
  const [mode, setMode] = useState(null); // 'existing' | 'new'
  const [selectedGoal, setSelectedGoal] = useState(null); // {text, category}
  const [newGoal, setNewGoal] = useState({ category: '', text: '', timePerDay: '' });
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [freqMap, setFreqMap] = useState({}); // sid -> {type, times}

  const userGoals = (user.values_answers?.goals || []).filter(g => g.text?.trim());

  const generateSuggestions = async (goal) => {
    setStep(2); setLoading(true);
    try {
      const prompt = `你是習慣設計師。請針對以下單一目標，設計 5 個每日或每週微習慣。

目標：${goal.category ? `【${goal.category}】` : ''}${goal.text}
${goal.timePerDay ? `每天可投入時間：${goal.timePerDay}` : ''}

請回傳純 JSON 陣列（不含 markdown）：
[
  {
    "title": "習慣名稱（10字以內）",
    "description": "具體執行方式：什麼時候、用什麼工具、做什麼、做多久",
    "why": "如何幫助達成目標（1句話）",
    "difficulty": "easy|medium|hard",
    "suggested_frequency": "daily|weekly",
    "suggested_times": 3
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
    } catch (e) {
      console.error(e);
      toast('建議生成失敗，請重試');
      setStep(mode === 'existing' ? 1 : 1);
    }
    setLoading(false);
  };

  const handleGoalChosen = (goal) => {
    setSelectedGoal(goal);
    generateSuggestions(goal);
  };

  const handleNewGoalSubmit = async () => {
    if (!newGoal.text.trim()) { toast('請填寫目標'); return; }
    // Append new goal to user's values_answers
    const va = user.values_answers || {};
    const updatedGoals = [...(va.goals || []), newGoal];
    try {
      await supa.patch('users', `id=eq.${user.id}`, {
        values_answers: { ...va, goals: updatedGoals }
      });
      user.values_answers = { ...va, goals: updatedGoals };
    } catch { toast('儲存目標失敗'); return; }
    handleGoalChosen(newGoal);
  };

  const saveSelected = async () => {
    if (!selected.size) { toast('請至少選擇一個習慣'); return; }
    setLoading(true);
    const goal = selectedGoal || newGoal;
    try {
      for (const idx of selected) {
        const h = suggestions[idx];
        const freq = freqMap[idx] || { type: 'daily' };
        await supa.post('habits', {
          user_id: user.id,
          title: h.title,
          description: `${h.description}${h.why ? '｜' + h.why : ''}`,
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
        <div style={{ width: 40, height: 4, background: '#E8E4DF', borderRadius: 2, margin: '0 auto 24px' }} />

        {/* Step 0: Choose mode */}
        {step === 0 && (
          <>
            <div style={{ ...S.h2, marginBottom: 20 }}>新增習慣</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <button
                style={{ ...S.card, cursor: 'pointer', border: '1.5px solid #2D6A4F', textAlign: 'center', padding: 20 }}
                onClick={() => { setMode('existing'); setStep(1); }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>🎯</div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>加到現有目標</div>
                <div style={{ fontSize: 12, color: '#8A857F', marginTop: 4 }}>AI 針對你的目標建議習慣</div>
              </button>
              <button
                style={{ ...S.card, cursor: 'pointer', border: '1.5px solid #E76F51', textAlign: 'center', padding: 20 }}
                onClick={() => { setMode('new'); setStep(1); }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>✨</div>
                <div style={{ fontWeight: 500, fontSize: 14 }}>建立新目標</div>
                <div style={{ fontSize: 12, color: '#8A857F', marginTop: 4 }}>設定新目標並生成習慣</div>
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
                style={{ ...S.card, cursor: 'pointer', marginBottom: 10 }}
                onClick={() => handleGoalChosen(g)}
              >
                <div style={{ ...S.row }}>
                  <span style={{ fontSize: 20 }}>{GOAL_CATEGORIES.find(c => c.label === g.category)?.emoji || '🎯'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{g.text}</div>
                    {g.category && <div style={{ fontSize: 12, color: '#8A857F' }}>{g.category}</div>}
                  </div>
                  <span style={{ color: '#8A857F' }}>→</span>
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
              <button style={{ ...S.btn('primary'), flex: 1 }} onClick={handleNewGoalSubmit}>生成習慣建議 ✦</button>
            </div>
          </>
        )}

        {/* Step 2: AI suggestions */}
        {step === 2 && (
          <>
            <div style={{ ...S.h2, marginBottom: 8 }}>習慣建議</div>
            <p style={{ ...S.muted, fontSize: 13, marginBottom: 16 }}>選擇你想開始的習慣，並設定頻率</p>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#8A857F' }}>
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
                      style={{ ...S.card, cursor: 'pointer', border: `1.5px solid ${isSel ? '#2D6A4F' : '#E8E4DF'}`, background: isSel ? '#D8F3DC' : '#fff', marginBottom: 10 }}
                      onClick={() => setSelected(s => { const n = new Set(s); n.has(idx) ? n.delete(idx) : n.add(idx); return n; })}>
                      <div style={{ ...S.row, marginBottom: 6 }}>
                        <span style={{ background: diffBg(h.difficulty), color: diffColor(h.difficulty), padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 500 }}>{diffLabel(h.difficulty)}</span>
                        <div style={{ flex: 1 }} />
                        {isSel && <span style={{ color: '#2D6A4F', fontWeight: 700 }}>✓</span>}
                      </div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{h.title}</div>
                      <div style={{ fontSize: 13, color: '#444', lineHeight: 1.6, marginBottom: 8 }}>{h.description}</div>
                      {h.why && <div style={{ fontSize: 12, color: '#2D6A4F', background: '#D8F3DC', padding: '4px 10px', borderRadius: 8, display: 'inline-block', marginBottom: 10 }}>💡 {h.why}</div>}
                      {/* Frequency selector — always visible */}
                      <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, borderTop: '1px solid #E8E4DF', paddingTop: 10 }}>
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
```

**Step 2: Update MainApp to use AddHabitModal**

In `MainApp`, find:
```js
const [modal, setModal] = useState(null);
```
This stays. But now when `modal === 'add'`, render `<AddHabitModal>` instead of the old modal.

Find in `HabitsTab` the button:
```js
<button style={{ ...S.btn('primary'), padding: '9px 18px', fontSize: 13 }} onClick={() => { setForm({ diff: 'medium' }); setModal('add'); }}>+ 新增</button>
```
Change to:
```js
<button style={{ ...S.btn('primary'), padding: '9px 18px', fontSize: 13 }} onClick={() => setModal('add')}>+ 新增</button>
```

Find the `{/* Add Habit Modal */}` block and replace the entire `<Modal open={modal === 'add'}...>` with:
```jsx
{modal === 'add' && (
  <AddHabitModal
    user={user}
    onClose={() => setModal(null)}
    onSaved={load}
    toast={toast}
  />
)}
```

**Step 3: Manual verify**
- Click "+ 新增" → shows two-choice screen
- Pick existing goal → picks goal → AI generates suggestions → can select + set frequency → saves
- New habits appear in the right goal group immediately
- Weekly habit shows progress bar

**Step 4: Commit**
```bash
git add src/App.jsx
git commit -m "feat: replace add habit modal with AI-assisted goal-aware flow"
```

---

## Task 5: Deploy

```bash
vercel --prod
```

Verify on https://habitfund.vercel.app:
- [ ] Today tab shows habits grouped by goal, collapsible
- [ ] Weekly habit shows X/N progress bar
- [ ] Habits tab shows groups + goal dropdown on each card
- [ ] "+ 新增" opens smart flow, AI suggestions work
- [ ] New habit appears in correct goal group

---

## Summary of Supabase changes needed (user action)

Before starting Task 1, run in Supabase SQL Editor:
```sql
ALTER TABLE habits ADD COLUMN goal_label TEXT;
ALTER TABLE habits ADD COLUMN frequency JSONB DEFAULT '{"type":"daily"}';
```

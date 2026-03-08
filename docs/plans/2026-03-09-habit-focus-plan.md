# Habit Focus & Goal Clarity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add habit cap warning, AI-mediated SMART + identity goal review in onboarding and add-habit flow, and Atomic Habits Cue + dual-layer Reward in habit suggestions.

**Architecture:** All changes in `src/App.jsx` (single-file React app). No new Supabase columns — goal `identity`/`smart` stored in existing `values_answers` JSONB; habit `cue`/`reward` appended to existing `description` text field. Three features: (1) soft habit cap warning, (2) SMART review overlay in Onboarding step 1 and AddHabitModal new-goal flow, (3) Cue/Reward fields in AI suggestion cards.

**Tech Stack:** React 18, Vite, Supabase REST API (custom `supa` client), `/api/chat` proxy to Claude API, inline styles, deployed on Vercel.

---

## Pre-flight check

Verify dev server starts with no errors:
```bash
npm run dev
```
Open browser → no console errors on load.

---

## Task 1: Habit cap warning interstitial

**Files:**
- Modify: `src/App.jsx` — `MainApp` state + `HabitsTab` component (~line 900)

**What to build:** When user clicks "+ 新增" with 5+ active habits, show a warning modal listing existing habits before proceeding to `AddHabitModal`.

**Step 1: Add `showCapWarning` state to MainApp**

Find:
```js
const [collapsed, setCollapsed] = useState({});
const toggleCollapse = (key) => setCollapsed(s => ({ ...s, [key]: !s[key] }));
```

Add immediately after:
```js
const [showCapWarning, setShowCapWarning] = useState(false);
```

**Step 2: Update the "+ 新增" button click handler in HabitsTab**

Find:
```js
<button style={{ ...S.btn('primary'), padding: '9px 18px', fontSize: 13 }} onClick={() => setModal('add')}>+ 新增</button>
```

Replace with:
```jsx
<button style={{ ...S.btn('primary'), padding: '9px 18px', fontSize: 13 }} onClick={() => {
  if (habits.length >= 5) { setShowCapWarning(true); }
  else setModal('add');
}}>+ 新增</button>
```

**Step 3: Add warning modal render in MainApp return**

Find this block (just before the Donate Modal):
```jsx
      {/* Add Habit Modal */}
      {modal === 'add' && (
```

Add immediately before it:
```jsx
      {/* Habit Cap Warning */}
      {showCapWarning && (
        <div style={S.modalBg} onClick={e => e.target === e.currentTarget && setShowCapWarning(false)}>
          <div style={S.modal}>
            <div style={{ width: 40, height: 4, background: '#E8E4DF', borderRadius: 2, margin: '0 auto 24px' }} />
            <div style={{ ...S.h2, marginBottom: 8 }}>你已有 {habits.length} 個習慣</div>
            <p style={{ ...S.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.7 }}>
              建立習慣的科學建議：先穩固現有習慣，再加入新的。<br />「一次想改太多」是最常見的失敗原因。
            </p>
            <div style={{ ...S.card, marginBottom: 16 }}>
              {habits.map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #E8E4DF' }}>
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
```

**Step 4: Manual verify**
- `npm run dev`
- With 5+ habits: click "+ 新增" → warning modal appears, lists habits
- Click "先不加了" → closes
- Click "我了解，繼續新增" → opens AddHabitModal

**Step 5: Commit**
```bash
git add src/App.jsx
git commit -m "feat: add soft habit cap warning at 5 habits"
```

---

## Task 2: Add `callSmartReview` helper function

**Files:**
- Modify: `src/App.jsx` — top-level helpers section (after `getWeeklyStreak`, before `AddHabitModal`)

**What to build:** A standalone async function that calls `/api/chat` and returns SMART analysis for an array of goal objects. Shared by both Onboarding and AddHabitModal.

**Step 1: Add `callSmartReview` function**

Find:
```js
// ── Add Habit Modal (AI-assisted) ────────────────────────
function AddHabitModal
```

Add immediately before it:
```js
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
```

**Step 2: Manual verify**
- `npm run dev` — no console errors on load (function unused yet, that's fine)

**Step 3: Commit**
```bash
git add src/App.jsx
git commit -m "feat: add callSmartReview helper function"
```

---

## Task 3: SMART review in Onboarding

**Files:**
- Modify: `src/App.jsx` — `Onboarding` component (~line 277)

**What to build:** After user fills goals (step 1) and clicks "繼續", call AI for SMART analysis. Render a review overlay with ✅/❌ indicators, required Measurable input, editable identity statement. On confirm, merge data into goals and proceed to step 2.

**Step 1: Add SMART review states inside Onboarding**

Find (inside `Onboarding` function):
```js
  const [loading, setLoading] = useState(false);
```

Add after it:
```js
  const [smartReviews, setSmartReviews] = useState(null); // null | Array<{specific,measurable,timeBound,identity,rewrite}>
  const [smartIdentities, setSmartIdentities] = useState([]); // user-edited identity per goal
  const [smartMeasurables, setSmartMeasurables] = useState([]); // user-filled measurable per goal
```

**Step 2: Modify `next()` to intercept step 1 → call SMART review**

Find in `Onboarding`:
```js
    setStep(s => s + 1);
  };
```

Replace the entire last line of `next()` with:
```js
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
```

**Step 3: Add `confirmSmartReview` handler inside Onboarding**

Add after the `next` function definition:
```js
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
```

**Step 4: Add SMART review render block**

Find in the Onboarding return:
```jsx
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
```

Replace with:
```jsx
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
                <div key={i} style={{ ...S.card, marginBottom: 14 }}>
                  <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 12 }}>
                    {GOAL_CATEGORIES.find(c => c.label === g.category)?.emoji || '🎯'} {g.text}
                  </div>
                  {review.rewrite && (
                    <div style={{ background: '#FDF3E3', border: '1px solid #F0D9B5', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#B5935A' }}>
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
                        <div style={{ fontSize: 12, fontWeight: 500, color: '#8A857F', marginBottom: 3 }}>{label}</div>
                        {required && !value ? (
                          <input
                            style={{ ...S.input, fontSize: 13 }}
                            placeholder="請填入具體數字或標準，例：每週跑 3 次、體重降 5kg"
                            value={smartMeasurables[i] || ''}
                            onChange={e => setSmartMeasurables(arr => arr.map((v, idx) => idx === i ? e.target.value : v))}
                          />
                        ) : (
                          <div style={{ fontSize: 13, color: value ? '#1A1714' : '#8A857F' }}>
                            {value || '未偵測到，請在目標描述中補充'}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 14, borderTop: '1px solid #E8E4DF', paddingTop: 12 }}>
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
```

**Step 5: Manual verify**
- `npm run dev`
- Go through onboarding → step 1 (goals) → click "繼續"
- Loading state appears briefly → SMART review screen shows
- Goals with missing Measurable show input field (required)
- Identity sentence input is pre-filled and editable
- "確認目標" is blocked if Measurable input empty
- On confirm → proceeds to step 2 (schedule)

**Step 6: Commit**
```bash
git add src/App.jsx
git commit -m "feat: add SMART review step in onboarding goal flow"
```

---

## Task 4: SMART review in AddHabitModal new goal flow

**Files:**
- Modify: `src/App.jsx` — `AddHabitModal` component

**What to build:** When user creates a new goal in AddHabitModal (Step 1b), after submitting, run the same SMART review before generating AI habit suggestions. Uses the same `callSmartReview` helper.

**Step 1: Add SMART review state inside AddHabitModal**

Find (inside `AddHabitModal`):
```js
  const [freqMap, setFreqMap] = useState({}); // idx -> {type, times}
```

Add after it:
```js
  const [newGoalReview, setNewGoalReview] = useState(null); // SMART review for new goal
  const [newGoalIdentity, setNewGoalIdentity] = useState('');
  const [newGoalMeasurable, setNewGoalMeasurable] = useState('');
```

**Step 2: Update `handleNewGoalSubmit` to trigger SMART review instead of immediately generating**

Find:
```js
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
```

Replace with:
```js
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
```

Note: `step` will now hold `'1b-smart'` as a string value temporarily.

**Step 3: Add `confirmNewGoalSmart` handler inside AddHabitModal**

Add after `handleNewGoalSubmit`:
```js
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
```

**Step 4: Add SMART review render block in AddHabitModal JSX**

Find in `AddHabitModal` return, the block:
```jsx
        {/* Step 1b: Create new goal */}
        {step === 1 && mode === 'new' && (
```

Add after the closing `)}` of that block (before `{/* Step 2: AI suggestions */}`):
```jsx
        {/* Step 1b-smart: SMART review for new goal */}
        {step === '1b-smart' && newGoalReview && (
          <>
            <div style={{ ...S.h2, marginBottom: 8 }}>目標審視</div>
            <p style={{ ...S.muted, fontSize: 13, marginBottom: 16 }}>確認你的目標具體可執行</p>
            <div style={S.card}>
              <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 12 }}>
                {GOAL_CATEGORIES.find(c => c.label === newGoal.category)?.emoji || '🎯'} {newGoal.text}
              </div>
              {newGoalReview.rewrite && (
                <div style={{ background: '#FDF3E3', border: '1px solid #F0D9B5', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#B5935A' }}>
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
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#8A857F', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13, color: value ? '#1A1714' : '#8A857F' }}>
                      {value || '未偵測到，可在確認後補充'}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{newGoalReview.measurable ? '✅' : '❌'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#8A857F', marginBottom: 3 }}>M 可衡量 *</div>
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
```

**Step 5: Manual verify**
- Click "+ 新增" → "建立新目標" → fill goal text → click "生成習慣建議"
- SMART review screen appears with ✅/❌ rows
- Measurable input required before proceeding
- On confirm → proceeds to AI suggestions step

**Step 6: Commit**
```bash
git add src/App.jsx
git commit -m "feat: add SMART review in AddHabitModal new goal flow"
```

---

## Task 5: Cue + Reward in AddHabitModal suggestion cards

**Files:**
- Modify: `src/App.jsx` — `AddHabitModal` component

**What to build:** Update the AI prompt to return `cue` and `reward` fields. Add `cueMap`/`rewardMap` state. Display editable Cue and optional Reward fields on each suggestion card. Save cue/reward appended to description on habit creation.

**Step 1: Add `cueMap` and `rewardMap` state inside AddHabitModal**

Find:
```js
  const [newGoalReview, setNewGoalReview] = useState(null);
```

Add after `freqMap` line:
```js
  const [cueMap, setCueMap] = useState({});   // idx -> string
  const [rewardMap, setRewardMap] = useState({}); // idx -> string
```

**Step 2: Update the AI prompt in `generateSuggestions`**

Find the prompt string inside `generateSuggestions`:
```js
      const prompt = `你是習慣設計師。請針對以下單一目標，設計 5 個每日或每週微習慣。
```

Replace the entire prompt template (the backtick string including the JSON schema) with:
```js
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
```

**Step 3: Initialize `cueMap` and `rewardMap` after parsing AI response**

Find in `generateSuggestions`:
```js
      const fm = {};
      JSON.parse(text).forEach((s, i) => {
        fm[i] = s.suggested_frequency === 'weekly'
          ? { type: 'weekly', times: s.suggested_times || 3 }
          : { type: 'daily' };
      });
      setFreqMap(fm);
```

Add after `setFreqMap(fm);`:
```js
      const cm = {}, rm = {};
      JSON.parse(text).forEach((s, i) => {
        cm[i] = s.cue || '';
        rm[i] = s.reward || '';
      });
      setCueMap(cm);
      setRewardMap(rm);
```

**Step 4: Update `saveSelected` to include cue and reward in description**

Find:
```js
        await supa.post('habits', {
          user_id: user.id,
          title: h.title,
          description: `${h.description}${h.why ? '｜' + h.why : ''}`,
          difficulty: h.difficulty,
          fund_per_day: diffFund(h.difficulty),
          goal_label: goal.text,
          frequency: freq,
        });
```

Replace with:
```js
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
```

**Step 5: Add Cue + Reward fields to each suggestion card in Step 2 JSX**

Find in the suggestion card render (inside `step === 2`):
```jsx
                      {/* Frequency selector — always visible */}
                      <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, borderTop: '1px solid #E8E4DF', paddingTop: 10 }}>
```

Add immediately before that block (still inside the card's `onClick={e => e.stopPropagation()}` zone — note: you need to add a wrapper div):
```jsx
                      {/* Cue + Reward */}
                      <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, borderTop: '1px solid #E8E4DF', paddingTop: 10 }}>
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
```

Then find the existing frequency selector block and rename its outer div to avoid collision. The existing block is:
```jsx
                      {/* Frequency selector — always visible */}
                      <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, borderTop: '1px solid #E8E4DF', paddingTop: 10 }}>
```

Change it to (remove the top border since the cue block above already has one):
```jsx
                      {/* Frequency selector — always visible */}
                      <div onClick={e => e.stopPropagation()} style={{ marginTop: 10 }}>
```

**Step 6: Manual verify**
- Click "+ 新增" → pick existing goal → AI generates suggestions
- Each card shows: Cue input (pre-filled), Reward input (pre-filled, optional), Frequency chips
- Edit cue/reward fields
- Select habits and click "新增選取的習慣"
- Habit saved to Supabase — check Supabase dashboard: `description` ends with `｜觸發：...｜獎勵：...`

**Step 7: Commit**
```bash
git add src/App.jsx
git commit -m "feat: add atomic habits cue and reward to AI suggestion cards"
```

---

## Task 6: Display Cue + Reward in Habits tab

**Files:**
- Modify: `src/App.jsx` — `HabitsTab` inner render (inside `MainApp`)

**What to build:** Parse the `description` field and display Cue and Reward as labeled lines below the habit description in the Habits tab card.

**Step 1: Add `parseDesc` helper inside MainApp**

Find in `MainApp`:
```js
  const groupByGoal = (items) => {
```

Add immediately before it:
```js
  const parseDesc = (raw) => {
    if (!raw) return { desc: '', cue: '', reward: '' };
    const parts = raw.split('｜');
    const desc = parts[0] || '';
    const cue = parts.find(p => p.startsWith('觸發：'))?.replace('觸發：', '') || '';
    const reward = parts.find(p => p.startsWith('獎勵：'))?.replace('獎勵：', '') || '';
    return { desc, cue, reward };
  };
```

**Step 2: Update habit card in HabitsTab to use `parseDesc`**

Find in the HabitsTab grouped habit map:
```jsx
                {h.description && <div style={{ fontSize: 13, color: '#8A857F', marginTop: 4 }}>{h.description}</div>}
```

Replace with:
```jsx
                {(() => {
                  const { desc, cue, reward } = parseDesc(h.description);
                  return (
                    <>
                      {desc && <div style={{ fontSize: 13, color: '#8A857F', marginTop: 4 }}>{desc}</div>}
                      {cue && <div style={{ fontSize: 12, color: '#2D6A4F', marginTop: 4 }}>⚡ 觸發：{cue}</div>}
                      {reward && <div style={{ fontSize: 12, color: '#B5935A', marginTop: 2 }}>🎁 完成後：{reward}</div>}
                    </>
                  );
                })()}
```

**Step 3: Manual verify**
- Open Habits tab
- Habits created with cue/reward show green "⚡ 觸發：..." and amber "🎁 完成後：..." lines
- Old habits without cue/reward show normally (no extra lines)

**Step 4: Commit**
```bash
git add src/App.jsx
git commit -m "feat: display cue and reward in Habits tab card"
```

---

## Task 7: Deploy

```bash
vercel --prod
```

Verify on https://habitfund.vercel.app:
- [ ] With 5+ habits, "+ 新增" shows cap warning listing current habits
- [ ] "先不加了" dismisses, "我了解，繼續新增" opens AddHabitModal
- [ ] Onboarding: after goal step, SMART review appears with ✅/❌ rows
- [ ] Measurable input blocks "確認目標" until filled
- [ ] Identity sentence editable and saved to goal
- [ ] AddHabitModal new goal: SMART review appears before AI suggestions
- [ ] AI suggestions show Cue and Reward input fields (pre-filled)
- [ ] Saved habit shows cue/reward in Habits tab

# Chain Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in "不斷鏈模式" per daily habit — if the user misses a day, all accumulated fund for that habit resets, and a mourning screen is shown on next app open.

**Architecture:** All changes in `src/App.jsx`. Three new columns added to the Supabase `habits` table (`chain_mode`, `chain_broken_at`, `chain_peak_streak`). Break detection runs on app load via `useEffect`. A `ChainBrokenModal` full-screen overlay handles the mourning UX. The fund calculation (`calcFund`) and per-habit fund display are updated to only count checkins after the last break date for chain-mode habits.

**Tech Stack:** React (hooks), Supabase REST API (via `supa.patch`), inline CSS (existing `S` style system)

**Note on testing:** This project has no automated test framework. Each task includes manual browser verification steps instead.

---

## Chunk 1: DB Schema + Fund Calculation

### Task 1: Supabase DB Migration

**Files:**
- No file changes — run SQL directly in Supabase SQL editor

- [ ] **Step 1: Open Supabase SQL editor**

  Go to the Supabase project dashboard → SQL Editor → New query.

- [ ] **Step 2: Run migration SQL**

```sql
ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS chain_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chain_broken_at date,
  ADD COLUMN IF NOT EXISTS chain_peak_streak integer NOT NULL DEFAULT 0;
```

- [ ] **Step 3: Verify columns exist**

  Run in SQL editor:
  ```sql
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'habits'
    AND column_name IN ('chain_mode', 'chain_broken_at', 'chain_peak_streak');
  ```
  Expected: 3 rows returned with correct types.

- [ ] **Step 4: Save migration SQL and commit**

  Create file `migrations/001_chain_mode.sql`:
  ```sql
  ALTER TABLE habits
    ADD COLUMN IF NOT EXISTS chain_mode boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS chain_broken_at date,
    ADD COLUMN IF NOT EXISTS chain_peak_streak integer NOT NULL DEFAULT 0;
  ```

```bash
mkdir -p migrations
# (write the SQL above to migrations/001_chain_mode.sql)
git add migrations/001_chain_mode.sql
git commit -m "chore: add chain_mode migration SQL for reference"
```

---

### Task 2: Add `getStreakAsOf` Helper + Update `calcFund`

**Files:**
- Modify: `src/App.jsx` — add helper after line 95 (end of `getStreak`), update `calcFund` near line 1366

- [ ] **Step 1: Add `getStreakAsOf` helper**

  In `src/App.jsx`, after the closing `}` of `getStreak` (line 95, just before the `// ── Toast` comment), add:

```js
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
```

- [ ] **Step 2: Update `calcFund` to filter chain-mode habits**

  Find `calcFund` in `MainApp` (around line 1366). Replace:

```js
const calcFund = () => {
  const earned = habits.reduce((s, h) => s + checkins.filter(c => c.habit_id === h.id).length * h.fund_per_day, 0);
  const used = fundUses.reduce((s, u) => s + Number(u.amount), 0);
  return { earned, used, balance: earned - used };
};
```

  With:

```js
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
```

- [ ] **Step 3: Verify in browser**

  Open app → Fund tab. Confirm balance still displays correctly. In Supabase, manually set `chain_broken_at = '2020-01-01'` and `chain_mode = true` on a habit, then reload — the balance should exclude that habit's old checkins.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add getStreakAsOf helper and update calcFund for chain mode"
```

---

### Task 3: Update Per-Habit Fund Display in HabitsTab

**Files:**
- Modify: `src/App.jsx` — HabitsTab habit card, around line 1552

- [ ] **Step 1: Find per-habit fund stats line**

  In `HabitsTab`, find the line:
  ```js
  const total = checkins.filter(c => c.habit_id === h.id).length;
  ```
  It's inside the `.map(h => { ... })` block around line 1552.

- [ ] **Step 2: Replace `total` calc and update stats row**

  Replace:
  ```js
  const total = checkins.filter(c => c.habit_id === h.id).length;
  ```
  With:
  ```js
  // lifetimeTotal: all checkins ever (for 📅 display)
  // chainFundCheckins: post-break only for chain-mode habits (for 💰 display)
  const lifetimeTotal = checkins.filter(c => c.habit_id === h.id).length;
  const chainFundCheckins = h.chain_mode && h.chain_broken_at
    ? checkins.filter(c => c.habit_id === h.id && c.checked_date > h.chain_broken_at)
    : checkins.filter(c => c.habit_id === h.id);
  const total = lifetimeTotal; // keep for 📅 累計 display (lifetime)
  ```

  Then find the stats row in the same card (the `💰` span):
  ```jsx
  <span style={{ ...S.muted, fontSize: 12 }}>💰 NT${total * h.fund_per_day}</span>
  ```
  Replace with:
  ```jsx
  <span style={{ ...S.muted, fontSize: 12 }}>💰 NT${chainFundCheckins.length * h.fund_per_day}</span>
  ```

- [ ] **Step 3: Verify in browser**

  Habits tab for a chain-mode habit with a past break:
  - `📅 累計 X 次` should show **all-time** checkin count (unchanged).
  - `💰 NT$Y` should show only **post-break** earnings.
  Non-chain habits: both `📅` and `💰` unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: update HabitsTab per-habit fund display to respect chain breaks"
```

---

## Chunk 2: Break Detection + Mourning Screen

### Task 4: Add State + Break Detection Logic in `MainApp`

**Files:**
- Modify: `src/App.jsx` — `MainApp` function, around lines 1312–1365

- [ ] **Step 1: Add `chainBroken` state + `chainChecked` ref**

  In `MainApp`, after the existing `useState` declarations (around line 1321), add:

```js
const [chainBroken, setChainBroken] = useState([]); // [{habitTitle, peakStreak, lostAmount}]
const chainChecked = useRef(false);
```

  Also add `useRef` to the import at the top of the file if not already present. Check line 1:
  ```js
  import { useState, useEffect, useCallback, useRef } from "react";
  ```

- [ ] **Step 2: Add `detectChainBreaks` function**

  In `MainApp`, after `const load = useCallback(...)` (around line 1360), add:

```js
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
```

- [ ] **Step 3: Hook detection into `useEffect`**

  After the existing `useEffect(() => { load(); }, [load]);` line, add:

```js
useEffect(() => {
  if (!chainChecked.current && habits.length >= 0 && checkins !== undefined) {
    chainChecked.current = true;
    detectChainBreaks();
  }
}, [habits, checkins, detectChainBreaks]);
```

- [ ] **Step 4: Verify logic in browser console**

  Open browser DevTools. Add `console.log('chainHabits:', chainHabits)` temporarily inside `detectChainBreaks`. Reload the app. Confirm the filter logic runs and only daily chain-mode habits are processed.

  Remove the console.log before committing.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add chain break detection on app load"
```

---

### Task 5: Build `ChainBrokenModal` Component

**Files:**
- Modify: `src/App.jsx` — add component before `MainApp` function (around line 1311)

- [ ] **Step 1: Add `ChainBrokenModal` component**

  Add before the `// ── Main App` comment:

```jsx
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
    <div style={{ position: 'fixed', inset: 0, background: '#1A1714', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>😢</div>
        <div style={{ fontFamily: "'Georgia', serif", fontSize: '2rem', color: '#fff', marginBottom: 20 }}>哭哭</div>
        <div style={{ color: '#8A857F', fontSize: 14, marginBottom: 6 }}>「{item.habitTitle}」</div>
        <div style={{ color: '#fff', fontSize: 16, marginBottom: 28 }}>習慣中斷啦</div>
        <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ color: '#8A857F', fontSize: 13, marginBottom: 6 }}>你曾連續堅持了</div>
          <div style={{ fontFamily: "'Georgia', serif", fontSize: '3rem', color: '#fff' }}>
            {item.peakStreak} 天
          </div>
          {item.lostAmount > 0 && (
            <div style={{ color: '#E76F51', fontSize: 14, marginTop: 12 }}>
              NT${item.lostAmount} 的累積已歸零
            </div>
          )}
        </div>
        <div style={{ color: '#8A857F', fontSize: 13, lineHeight: 1.9, marginBottom: 28 }}>
          損失不可挽回。<br />但今天可以重新開始。
        </div>
        <button
          style={{ display: 'block', width: '100%', padding: '14px 24px', borderRadius: 100, border: 'none', background: '#E76F51', color: '#fff', fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
          onClick={next}
        >
          我知道了，重新開始
        </button>
        {broken.length > 1 && (
          <div style={{ color: '#8A857F', fontSize: 12, marginTop: 14 }}>
            {idx + 1} / {broken.length}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render `ChainBrokenModal` in `MainApp`**

  In `MainApp`'s return JSX, find the outermost `<div>` (around line 1750+) and add before the nav bar:

```jsx
<ChainBrokenModal broken={chainBroken} onDismiss={() => setChainBroken([])} />
```

- [ ] **Step 3: Verify in browser**

  To test, temporarily add this in `MainApp` after state declarations:
  ```js
  // TEMP TEST — remove after verifying
  // setChainBroken([{ habitTitle: '每天冥想 10 分鐘', peakStreak: 47, lostAmount: 470 }]);
  ```
  Uncomment it, reload — mourning screen should appear full-screen with correct content. Click "我知道了，重新開始" and the screen should dismiss.

  Remove the temp line before committing.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add ChainBrokenModal mourning screen"
```

---

## Chunk 3: Habit Card Toggle UI

### Task 6: Chain Mode Toggle in HabitsTab

**Files:**
- Modify: `src/App.jsx` — `MainApp` function (add handlers) + `HabitsTab` (add toggle UI + confirm modal)

- [ ] **Step 1: Add `confirmChainHabit` state**

  In `MainApp`, after the `chainBroken` state (from Task 4), add:

```js
const [confirmChainHabit, setConfirmChainHabit] = useState(null); // habitId | null
```

- [ ] **Step 2: Add `enableChainMode` and `disableChainMode` handlers**

  In `MainApp`, after `deleteHabit` (around line 1398):

```js
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
```

- [ ] **Step 3: Add toggle button to each habit card in HabitsTab**

  Inside `HabitsTab`, in the habit card `.map(h => { ... })` block, find the stats row:
  ```jsx
  <div style={{ ...S.row, marginTop: 12 }}>
    <span style={{ ...S.muted, fontSize: 12 }}>🔥 連續 ...
  ```
  After that `</div>` (closing the stats row), add:

```jsx
{(!h.frequency || h.frequency?.type === 'daily') && (
  <div style={{ marginTop: 10, borderTop: '1px solid #E8E4DF', paddingTop: 10 }}>
    {h.chain_mode ? (
      <button
        style={{ background: 'none', border: '1px solid #E8E4DF', borderRadius: 100, padding: '5px 14px', fontSize: 12, color: '#8A857F', cursor: 'pointer', fontFamily: 'inherit' }}
        onClick={() => disableChainMode(h.id)}
      >
        ⛓️ 不斷鏈中（點擊停用）
      </button>
    ) : (
      <button
        style={{ background: 'none', border: '1px solid #E8E4DF', borderRadius: 100, padding: '5px 14px', fontSize: 12, color: '#8A857F', cursor: 'pointer', fontFamily: 'inherit' }}
        onClick={() => setConfirmChainHabit(h.id)}
      >
        🔗 開啟不斷鏈
      </button>
    )}
  </div>
)}
```

- [ ] **Step 4: Add confirm modal**

  In `MainApp`'s return JSX, after `<ChainBrokenModal ... />`, add:

```jsx
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
```

- [ ] **Step 5: Verify in browser**

  1. Go to Habits tab. Daily habits should show "🔗 開啟不斷鏈" button.
  2. Click "🔗 開啟不斷鏈" → confirm modal appears.
  3. Click "取消" → modal closes, no change.
  4. Click "啟用，我做得到" → button changes to "⛓️ 不斷鏈中（點擊停用）".
  5. Click "⛓️ 不斷鏈中（點擊停用）" → reverts to "🔗 開啟不斷鏈".
  6. Weekly habits should NOT show the toggle button.

- [ ] **Step 6: End-to-end verification**

  1. Enable chain mode on a daily habit.
  2. In Supabase SQL editor, set `chain_broken_at = yesterday` for that habit to simulate a break:
     ```sql
     UPDATE habits SET chain_broken_at = CURRENT_DATE - 1, chain_peak_streak = 5
     WHERE title = 'your habit name';
     ```
  3. Reload the app — mourning screen should appear.
  4. Click "我知道了，重新開始" — screen dismisses, app loads normally.
  5. Check Fund tab — balance should NOT include pre-break checkins for that habit.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add chain mode toggle UI and confirmation modal in HabitsTab"
```

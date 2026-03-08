# Habit Focus & Goal Clarity Design

**Date:** 2026-03-09

**Problem:** The tool was built to prevent greed and build core values, but has become a pile of habits. Goals lack specificity. Habit creation doesn't leverage behavioral science principles.

**Solution:** Soft habit cap with warning, AI-mediated SMART + identity goal review, and Atomic Habits Cue/Reward integration.

---

## Goals

1. Prevent habit accumulation (soft cap: 3–5 habits)
2. Ensure goals are specific and measurable (SMART + identity statement)
3. Anchor habits behaviorally (Cue via habit stacking, dual-layer Reward)

---

## Framework

- **SMART + Identity-based goals** (James Clear / atomic habits): goals must be specific, measurable, and connected to who the user wants to become
- **Atomic Habits Four Laws**: focus on Cue (habit stacking) and Reward (immediate small reward + fund)
- **WOOP**: deferred to future iteration

---

## Architecture

**Files changed:** `src/App.jsx` only. No new Supabase columns needed.

**Data model additions (stored in existing JSONB fields):**

Goal object in `values_answers.goals[]` gains two new fields:
```js
{
  // existing
  category, text, deadline, level, timePerDay,
  // new
  identity: "我是一個...",          // identity statement, user-confirmed
  smart: {
    specific: string,               // AI-extracted or user-provided
    measurable: string,             // REQUIRED — user must confirm or fill
    timeBound: string,              // AI-extracted
  }
}
```

Habit `description` field gains structured suffix:
```
"{original description}｜觸發：{cue}｜獎勵：{reward}"
```
Parsed and displayed in Habits tab as separate lines.

---

## Feature 1: Habit Cap Warning

**Trigger:** User clicks "+ 新增" in HabitsTab with `habits.length >= 5`

**Behavior:** Show an interstitial warning before entering AddHabitModal:
- Display current habit count and list of active habits
- Message: "你已有 X 個習慣。建立習慣的科學建議：先穩固現有習慣，再加入新的。"
- Two buttons: "先不加了" (dismiss) and "我了解，繼續新增" (proceed to AddHabitModal)

**Rule:** This is a soft cap — user can always proceed. No hard block.

---

## Feature 2: Onboarding Goal SMART Review

**When:** After user fills goal text in Onboarding (step 1), before moving to next step.

**New AI step inserted into goal flow:**

1. User fills goal text and clicks continue
2. App calls AI with the goal text
3. AI returns:
   - `smart.specific`: extracted specific detail (or gap noted)
   - `smart.measurable`: extracted metric — **if missing, marked as ❌**
   - `smart.timeBound`: extracted time horizon
   - `identity`: suggested identity statement ("我是一個...")
   - `rewrite`: optional clearer rewrite if goal is vague

4. UI shows **SMART Review screen**:
   - Three SMART rows (Specific, Measurable, Time-bound), each ✅ or ❌ with extracted value
   - **Measurable is required**: if ❌, show input field — user must fill before confirming
   - Identity statement: editable text input pre-filled with AI suggestion
   - Optional rewrite suggestion shown if goal is vague
   - "確認目標" button (disabled until Measurable is filled if ❌)

5. On confirm: `identity` and `smart` saved into goal object, onboarding continues

**Same review step applies** when creating a new goal inside `AddHabitModal` (Step 1b → new goal).

---

## Feature 3: Atomic Habits Cue + Dual-Layer Reward

**Where:** AddHabitModal Step 2 (AI suggestions cards)

**Changes to each suggestion card:**

**Cue (habit stacking):**
- AI generates a suggested trigger using habit stacking format
- Displayed as: 「在 ＿＿＿ 之後，我會做這個習慣」
- Editable text field, pre-filled with AI suggestion
- Example: "早上刷牙後"、"下班打開電腦前"

**Reward (dual-layer):**
- **基金獎勵** (existing, kept): NT$X/天 — long-term motivation, unchanged
- **即時小獎勵** (new, optional): AI suggests a small immediate reward
  - Displayed as: 「完成後：＿＿＿」
  - Editable text field, pre-filled with AI suggestion
  - Optional — can be left empty
  - Example: "喝一杯喜歡的飲料"、"在日曆上畫一個大叉"

**Habits tab display:** Description field parsed to show Cue and Reward as separate labeled lines below the habit title.

**Storage:** Cue and reward appended to description:
```
"{description}｜觸發：{cue}｜獎勵：{reward}"
```

**AI prompt update:** Extend the existing suggestion prompt to also return `cue` and `reward` fields per habit.

---

## UI Summary

```
HabitsTab "+ 新增" (habits >= 5)
  → Warning interstitial
    → "繼續" → AddHabitModal

AddHabitModal Step 0: choose existing / new goal
AddHabitModal Step 1a: pick existing goal → AI suggestions
AddHabitModal Step 1b: fill new goal → SMART Review → AI suggestions
AddHabitModal Step 2: AI suggestion cards
  - [existing] title, description, why, difficulty, frequency
  - [new] cue field (editable)
  - [new] immediate reward field (editable, optional)
  - [existing] fund reward (NT$X/天)

Onboarding Goal Step → SMART Review step (new) → continue
```

---

## Out of Scope (this iteration)

- WOOP model (Obstacle + If-Then plan)
- Hard habit cap enforcement
- Achievable / Relevant SMART fields (only S, M, T checked)
- Habit archiving / pausing UI

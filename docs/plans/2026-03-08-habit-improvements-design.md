# Habit App Improvements Design
**Date:** 2026-03-08

## Goal
Fix three core UX issues: manual post-onboarding habit creation, daily-only frequency, and flat ungrouped habit lists.

## Approved Design

### 1. Data Model Changes
Two new columns on the `habits` table:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `goal_label` | `TEXT` | NULL | Links habit to a goal by label |
| `frequency` | `JSONB` | `{"type":"daily"}` | Daily or weekly frequency |

**Frequency shape:**
- Daily: `{"type": "daily"}`
- Weekly: `{"type": "weekly", "times": 3}`

**Migration SQL (run in Supabase SQL editor):**
```sql
ALTER TABLE habits ADD COLUMN goal_label TEXT;
ALTER TABLE habits ADD COLUMN frequency JSONB DEFAULT '{"type":"daily"}';
```

Existing habits: `goal_label = NULL` → displayed under "其他" group. No data loss.

---

### 2. AI-Assisted Habit Creation Flow
Replace the plain "Add Habit" modal with a smart flow:

**Step 1 — Choose mode:**
- "加到現有目標" → show list of user's goals from `users.values_answers.goals`
- "建立新目標" → mini form (category + goal text + time per day)

**Step 2 — AI generates 3–5 habit suggestions** (reuses the onboarding prompt pattern, scoped to the selected/new goal)

**Step 3 — User selects habits + sets frequency** (daily or weekly N times) → saved with `goal_label` and `frequency`

**New goal path:** also appends the new goal to `users.values_answers.goals` via PATCH.

---

### 3. Weekly Habits (X times per week)
- Frequency stored as `{"type": "weekly", "times": N}`
- Always visible in Today tab
- Progress shown as `X / N 次（本週）` with a fill bar
- Week boundary: Monday–Sunday
- Streak tracking: counts consecutive weeks where target was met
- Fund accumulation: same as daily — earned per check-in

---

### 4. Goal Grouping UI
Both **Today tab** and **Habits tab** switch from flat list to collapsible goal sections.

- Section header: `▼ {emoji} {goal_label}` — clickable to collapse
- Default: all sections expanded
- Habits with `goal_label = NULL` go in "其他" section at the bottom
- Each habit card in Habits tab gains a "歸屬目標" dropdown to reassign to any goal (or none)

---

## Out of Scope
- Habit reordering within groups
- Goal editing/deletion
- Monthly or custom frequency types
- Push notifications for weekly habits

## Components Affected
- `src/App.jsx` — all changes are here (single-file app)
- Supabase `habits` table schema

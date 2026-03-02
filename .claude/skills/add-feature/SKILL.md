---
name: add-feature
description: Add a new feature to the habit-fund app following the existing patterns (React, Vite, Supabase). Use when the user wants to add a new habit feature, UI component, or Supabase integration.
argument-hint: [feature description]
allowed-tools: Read, Edit, Write, Glob, Grep
---

Add this feature to the habit-fund app: $ARGUMENTS

## Project Context

- **Stack**: React 18 + Vite + Supabase (REST API via fetch)
- **Entry**: `src/App.jsx` — single-file app with all components
- **Supabase client**: Custom `supa` object at top of App.jsx with `.get()`, `.post()`, `.patch()`, `.del()` methods
- **Styling**: Inline styles only (no CSS files or libraries)
- **State**: `useState` + `useEffect` + `useCallback`

## Existing Patterns to Follow

### Supabase queries
```js
// GET with filter
supa.get('table_name', 'column=eq.value')

// POST (insert)
supa.post('table_name', { column: value })

// PATCH (update)
supa.patch('table_name', 'id=eq.' + id, { column: value })

// DELETE
supa.del('table_name', 'id=eq.' + id)
```

### Difficulty system
- `easy` → 5 fund, color #2D6A4F, bg #D8F3DC
- `medium` → 10 fund, color #B5935A, bg #FDF3E3
- `hard` → 20 fund, color #E76F51, bg #FDEBD0

### Helper functions available
- `todayStr()` — today's date as YYYY-MM-DD
- `diffLabel(d)` — Chinese label for difficulty
- `diffFund(d)` — fund amount for difficulty
- `diffColor(d)` / `diffBg(d)` — colors

## Implementation Steps

1. Read `src/App.jsx` to understand current state and component structure
2. Identify where the new feature fits in the component hierarchy
3. Add the feature following existing patterns
4. Use inline styles consistent with the app's visual style
5. Keep it in `src/App.jsx` unless the addition is substantial

Stay minimal — only add what's needed for the feature.

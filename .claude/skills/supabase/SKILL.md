---
name: supabase
description: Help write, debug, or optimize Supabase queries for the habit-fund app. Use when working with database operations, schema questions, or Supabase RLS/policies.
argument-hint: [query or operation description]
allowed-tools: Read, Grep, Glob
---

Help with Supabase for the habit-fund app: $ARGUMENTS

## Project Supabase Setup

- **URL**: `https://keenwhiygrrnxhllibxa.supabase.co`
- **Client**: Custom REST wrapper in `src/App.jsx` (not the official Supabase JS SDK)
- **Auth**: Uses `apikey` + `Authorization: Bearer` headers with a publishable key

## Custom Client API

```js
supa.get(table, queryString)      // GET /rest/v1/{table}?{queryString}
supa.post(table, data)            // POST (insert, returns=representation)
supa.patch(table, queryString, data)  // PATCH
supa.del(table, queryString)      // DELETE
```

## PostgREST Query Syntax (used in queryString)

```
column=eq.value          // equals
column=neq.value         // not equals
column=gt.value          // greater than
column=gte.value         // greater than or equal
column=lt.value / lte
column=like.pattern      // LIKE (use * as wildcard)
column=ilike.pattern     // case-insensitive LIKE
column=in.(v1,v2,v3)    // IN list
column=is.null           // IS NULL
column=not.is.null       // IS NOT NULL

// Multiple filters: join with &
id=eq.1&status=eq.active

// Ordering
order=created_at.desc
order=name.asc

// Pagination
limit=20&offset=0

// Select specific columns
select=id,name,created_at

// Foreign key embedding (if relations set up)
select=*,habits(*)
```

## Common Tasks

### Check if record exists before inserting
```js
const existing = await supa.get('table', 'id=eq.' + id);
if (!existing || existing.length === 0) {
  await supa.post('table', data);
}
```

### Upsert pattern
Use PATCH with `Prefer: resolution=merge-duplicates` — but the custom client doesn't support this directly. Use get-then-post-or-patch pattern instead.

### Error handling
```js
try {
  const result = await supa.get('table', query);
  // result is parsed JSON or null
} catch (err) {
  console.error('Supabase error:', err.message);
}
```

Provide specific, working query strings and explain any PostgREST nuances.

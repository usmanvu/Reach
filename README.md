# Reach - Outreach Tracker

Track creators, follow-ups and outreach in one place. Built with React + Vite + Supabase.

Live: https://reachbymemik.vercel.app

## Features
- Magic-link sign in (Supabase Auth)
- Per-user contacts — each user only sees their own data (RLS)
- Add / edit / delete contacts
- Filter by status + platform, search by name/handle
- Follow-up helpers: days since last contact, last contact date
- Works on Vercel with automatic redeploys from GitHub

## 1. Supabase setup (one-time)

1. Create a project at supabase.com
2. Go to **SQL Editor** → **New query** → paste the whole file `supabase/schema.sql` → **Run**
3. Go to **Authentication** → **Sign In / Providers** → make sure **Email** is on
4. Go to **Authentication** → **URL Configuration** → add:
   - Site URL: `https://reachbymemik.vercel.app`
   - Redirect URLs: `https://reachbymemik.vercel.app/**` and `http://localhost:5173/**`
5. Go to **Settings** → **API** → copy:
   - Project URL → `VITE_SUPABASE_URL`
   - Publishable key (`sb_publishable_...`) → `VITE_SUPABASE_ANON_KEY`

## 2. Local dev

```bash
npm install
cp .env.example .env.local
# fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
npm run dev
```

Open http://localhost:5173

## 3. GitHub packaging

This repo is already GitHub-ready. Do **not** upload `node_modules`, `dist`, or `.env`.

### Option A — GitHub web upload (fastest)
1. On GitHub, open your `reach` repo → **Add file → Upload files**
2. Drag **all files from this ZIP** (keep folder structure: `src/...` stays inside `src`)
3. Commit. Vercel redeploys automatically in 1-2 min.

### Option B — Git from terminal
```bash
git init
git add .
git commit -m "Reach: complete Supabase packaging"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/reach.git
git push -u origin main
```

## 4. Vercel env vars

Vercel → Project → **Settings → Environment Variables** → add for Production + Preview + Development:

- `VITE_SUPABASE_URL` = `https://YOUR_PROJECT_ID.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `sb_publishable_...`

Then **Deployments → Redeploy**.

## 5. Test checklist

- [ ] `npm run build` passes locally with no errors
- [ ] Live site shows **Sign in**, not the old list
- [ ] Magic link email arrives → click → you are signed in
- [ ] Add a contact → refresh → still there
- [ ] Sign out → sign in with a different email → list is empty (per-user isolation)

## File map

```
Reach/
  index.html
  package.json
  vite.config.ts
  tsconfig.json / tsconfig.app.json / tsconfig.node.json
  vercel.json
  .gitignore
  .env.example
  README.md
  supabase/schema.sql
  src/
    main.tsx
    App.tsx
    supabaseClient.ts
    vite-env.d.ts
    index.css
```

## Troubleshooting

- `Supabase is not configured` → Vercel env vars missing or not redeployed yet.
- `Property 'env' does not exist on type 'ImportMeta'` → `src/vite-env.d.ts` missing. It is included in this package.
- `Cannot find module ./supabaseClient` on Vercel → file must be `src/supabaseClient.ts` with lowercase `s`, not in root.
- Magic link not arriving → check Spam + Supabase → Authentication → Logs.

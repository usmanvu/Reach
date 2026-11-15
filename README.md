# Reach — Outreach, curated

Private outreach tracker for designers and creators.
Vite + React + Tailwind v4 + Supabase (per-user, Row Level Security).

## What is in this bundle

- `src/App.tsx` — the full app, with all latest fixes:
  header email removed, dividers aligned, footer one line bottom-left,
  settings behind avatar, mobile rebuilt (top bar, big title, cards, quick actions, floating bottom nav),
  profile settings rebuilt (avatar + Save pill, big red name, Contacts / Replied cards,
  Photo / Name / Socials / Theme quick actions, Linked accounts card),
  desktop full-width (no 1440px gutters).
- `src/supabaseClient.ts` — Supabase client
- `src/main.tsx` — entry
- `src/index.css` — Tailwind v4 + theme vars
- `src/vite-env.d.ts`
- `index.html`, `vite.config.ts`, `package.json`, `tsconfig*.json`, `vercel.json`, `.gitignore`
- `supabase-setup.sql` — run ONCE in Supabase SQL Editor
- `SUPABASE-SETUP.txt` — full step-by-step setup

## Run locally

```bash
npm install
npm run build
```

For login locally, create `.env` in root (do NOT commit it):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```
Then `npm run dev` → http://localhost:5173

## Deploy to Vercel via GitHub

1. In GitHub repo `reach`, upload / replace with this exact structure:
   - root: `index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vercel.json`, `.gitignore`
   - `src/`: `App.tsx`, `main.tsx`, `index.css`, `supabaseClient.ts`, `vite-env.d.ts`
   - Do NOT upload `.env`, `node_modules`, `dist`
2. In Vercel → Project → Settings → Environment Variables, make sure:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   are set for Production + Preview + Development.
3. Push / Commit → Vercel redeploys → check in Incognito: you should see Sign in screen, not the old tracker.
4. In Supabase → Authentication → URL Configuration, Site URL + Redirect URLs must include `https://reachbymemik.vercel.app`

## Notes

- Each user sees ONLY their own data (RLS: `auth.uid() = user_id`).
- Settings live behind the avatar. Nothing about sign-in shows on the main screen.
- Photo upload is not live yet — initials show until then.

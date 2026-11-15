-- Run this in Supabase > SQL Editor > New query, then click Run.
-- It creates the contacts table with per-user isolation (RLS).

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  handle text default '',
  platform text default 'Instagram',
  link text default '',
  status text default 'New',
  last_contact date default CURRENT_DATE,
  notes text default '',
  created_at timestamptz not null default now()
);

alter table public.contacts enable row level security;

-- Drop old policies if you re-run this file
drop policy if exists "Users can view own contacts" on public.contacts;
drop policy if exists "Users can insert own contacts" on public.contacts;
drop policy if exists "Users can update own contacts" on public.contacts;
drop policy if exists "Users can delete own contacts" on public.contacts;

create policy "Users can view own contacts"
  on public.contacts for select
  using (auth.uid() = user_id);

create policy "Users can insert own contacts"
  on public.contacts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own contacts"
  on public.contacts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own contacts"
  on public.contacts for delete
  using (auth.uid() = user_id);

-- Optional: index for fast per-user listing
create index if not exists contacts_user_id_idx on public.contacts(user_id);

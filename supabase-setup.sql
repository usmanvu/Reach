-- Reach - Supabase setup
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> Paste -> Run
-- Do it ONCE. It creates the tables and the per-user security rules.

-- 1. Contacts table: one row per contact, owned by one user
create table if not exists public.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  value jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Settings table: one row per user (theme, scratchpad, templates, profile, shortcuts)
create table if not exists public.outreach_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  value jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Enable Row Level Security (RLS)
alter table public.outreach_contacts enable row level security;
alter table public.outreach_settings enable row level security;

-- 4. Drop old policies if you run this again (safe to run twice)
drop policy if exists "Users can view own contacts" on public.outreach_contacts;
drop policy if exists "Users can insert own contacts" on public.outreach_contacts;
drop policy if exists "Users can update own contacts" on public.outreach_contacts;
drop policy if exists "Users can delete own contacts" on public.outreach_contacts;

drop policy if exists "Users can view own settings" on public.outreach_settings;
drop policy if exists "Users can insert own settings" on public.outreach_settings;
drop policy if exists "Users can update own settings" on public.outreach_settings;
drop policy if exists "Users can delete own settings" on public.outreach_settings;

-- 5. Policies: a user can ONLY see / edit rows where user_id = their own id
-- This is what gives each user standalone rights on their data.

create policy "Users can view own contacts"
  on public.outreach_contacts for select
  using (auth.uid() = user_id);

create policy "Users can insert own contacts"
  on public.outreach_contacts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own contacts"
  on public.outreach_contacts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own contacts"
  on public.outreach_contacts for delete
  using (auth.uid() = user_id);

create policy "Users can view own settings"
  on public.outreach_settings for select
  using (auth.uid() = user_id);

create policy "Users can insert own settings"
  on public.outreach_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own settings"
  on public.outreach_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own settings"
  on public.outreach_settings for delete
  using (auth.uid() = user_id);

-- 6. Optional: keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_outreach_contacts_updated_at on public.outreach_contacts;
create trigger set_outreach_contacts_updated_at
  before update on public.outreach_contacts
  for each row execute function public.set_updated_at();

drop trigger if exists set_outreach_settings_updated_at on public.outreach_settings;
create trigger set_outreach_settings_updated_at
  before update on public.outreach_settings
  for each row execute function public.set_updated_at();

-- Done. Now go to Authentication -> Providers -> Email and make sure Email is ON.
-- Magic link emails are sent by Supabase. For testing, use your own email.

-- Countdown tracker schema. Every table is owner-only through RLS.

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  step_goal int not null default 10000 check (step_goal between 1000 and 100000),
  kcal_goal int not null default 2000 check (kcal_goal between 500 and 10000),
  sync_token_hash text unique,
  last_sync_at timestamptz,
  fasting_enabled boolean not null default true,
  eating_windows jsonb not null default '[{"start":"00:00","end":"01:00"},{"start":"11:00","end":"13:00"}]'
    check (jsonb_typeof(eating_windows) = 'array' and jsonb_array_length(eating_windows) <= 3)
);

create table public.countdowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  emoji text not null default '🎯' check (char_length(emoji) between 1 and 8),
  target_date date not null,
  created_at timestamptz not null default now()
);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  emoji text not null default '✅' check (char_length(emoji) between 1 and 8),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  frequency text not null check (frequency in ('daily', 'weekly')),
  source text not null default 'manual' check (source in ('manual', 'steps', 'calories', 'workout', 'fasting')),
  slot text not null default 'anytime' check (slot in ('morning', 'night', 'anytime')),
  weekday smallint check (weekday between 0 and 6),
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.habit_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  habit_id uuid not null references public.habits on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, day)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  month date not null check (extract(day from month) = 1),
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  countdown_id uuid not null references public.countdowns on delete cascade,
  habit_id uuid not null references public.habits on delete cascade,
  target_days int not null check (target_days > 0),
  start_day date not null,
  created_at timestamptz not null default now()
);

create table public.steps_daily (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  count int not null check (count between 0 and 100000),
  synced_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  started_at timestamptz not null,
  day date not null,
  duration_min int check (duration_min between 0 and 1440),
  name text check (char_length(name) <= 80),
  source text not null check (source in ('health', 'manual')),
  unique (user_id, started_at)
);

create table public.saved_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kcal int not null check (kcal between 0 and 10000),
  protein_g numeric(6, 1) check (protein_g between 0 and 1000),
  use_count int not null default 0,
  created_at timestamptz not null default now()
);

create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  eaten_at timestamptz not null default now(),
  day date not null,
  name text not null check (char_length(name) between 1 and 60),
  kcal int not null check (kcal between 0 and 10000),
  protein_g numeric(6, 1) check (protein_g between 0 and 1000),
  saved_food_id uuid references public.saved_foods on delete set null,
  created_at timestamptz not null default now()
);

create index habit_checks_user_day on public.habit_checks (user_id, day);
create index workouts_user_day on public.workouts (user_id, day);
create index food_entries_user_day on public.food_entries (user_id, day);

do $$
declare t text;
begin
  foreach t in array array['settings', 'countdowns', 'habits', 'habit_checks', 'tasks', 'challenges',
                           'steps_daily', 'workouts', 'saved_foods', 'food_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_all on public.%I for all to authenticated '
                   'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- First-login defaults. Runs as the caller, so RLS and column defaults (user_id) apply.
create or replace function public.ensure_setup() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.settings (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  if not found then
    return;
  end if;
  insert into public.habits (name, emoji, color, frequency, source, slot, weekday, sort_order) values
    ('10k steps', '👟', '#FF453A', 'daily', 'steps', 'anytime', null, 1),
    ('Calories on target', '🍽️', '#FF9F0A', 'daily', 'calories', 'anytime', null, 2),
    ('Fasting windows kept', '🌙', '#FFD60A', 'daily', 'fasting', 'anytime', null, 3),
    ('Workout', '💪', '#A3F53B', 'daily', 'workout', 'anytime', null, 4),
    ('AM skincare', '🧴', '#30D158', 'daily', 'manual', 'morning', null, 5),
    ('PM skincare', '🌙', '#00C7BE', 'daily', 'manual', 'night', null, 6),
    ('Minoxidil AM', '💧', '#32D7FA', 'daily', 'manual', 'morning', null, 7),
    ('Minoxidil PM', '💧', '#0A84FF', 'daily', 'manual', 'night', null, 8),
    ('Dermarolling', '🪡', '#BF5AF2', 'weekly', 'manual', 'night', 0, 9);
  insert into public.countdowns (title, emoji, target_date) values
    ('Diwali', '🪔', '2026-11-08'),
    ('Engagement', '💍', '2026-12-10');
end $$;

-- Returns a fresh Shortcut token once; only its SHA-256 hash is stored.
create or replace function public.rotate_sync_token() returns text
language plpgsql security invoker set search_path = '' as $$
declare
  token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  update public.settings
     set sync_token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
   where user_id = auth.uid();
  if not found then
    raise exception 'Run ensure_setup first';
  end if;
  return token;
end $$;

revoke execute on function public.ensure_setup() from public, anon;
revoke execute on function public.rotate_sync_token() from public, anon;
grant execute on function public.ensure_setup() to authenticated;
grant execute on function public.rotate_sync_token() to authenticated;

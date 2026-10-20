-- Amendment B: times-a-week habits; Workout becomes 4 a week (spec §8.6).
alter table public.habits drop constraint habits_frequency_check;
alter table public.habits add constraint habits_frequency_check check (frequency in ('daily', 'weekly', 'interval', 'times_per_week'));
alter table public.habits add column times_per_week smallint check (times_per_week between 1 and 7);
alter table public.habits add constraint habits_times_per_week_fields check ((frequency = 'times_per_week') = (times_per_week is not null));

update public.habits set frequency = 'times_per_week', times_per_week = 4 where source = 'workout' and frequency = 'daily';

create or replace function public.ensure_setup() returns void
language plpgsql security invoker set search_path = '' as $$
declare
  today date := ((now() at time zone 'Asia/Kolkata') - interval '4 hours')::date;
begin
  insert into public.settings (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  if not found then
    return;
  end if;
  insert into public.habits (name, emoji, color, frequency, source, slot, weekday, sort_order, interval_days, interval_start, times_per_week) values
    ('10k steps', '👟', '#FF453A', 'daily', 'steps', 'anytime', null, 1, null, null, null),
    ('Calories on target', '🍽️', '#FF9F0A', 'daily', 'calories', 'anytime', null, 2, null, null, null),
    ('Fasting windows kept', '🌙', '#FFD60A', 'daily', 'fasting', 'anytime', null, 3, null, null, null),
    ('Workout', '💪', '#A3F53B', 'times_per_week', 'workout', 'anytime', null, 4, null, null, 4),
    ('AM skincare', '🧴', '#30D158', 'daily', 'manual', 'morning', null, 5, null, null, null),
    ('PM skincare', '🌙', '#00C7BE', 'daily', 'manual', 'night', null, 6, null, null, null),
    ('Minoxidil AM', '💧', '#32D7FA', 'daily', 'manual', 'morning', null, 7, null, null, null),
    ('Minoxidil PM', '💧', '#0A84FF', 'daily', 'manual', 'night', null, 8, null, null, null),
    ('Dermarolling', '🪡', '#BF5AF2', 'interval', 'manual', 'night', null, 9, 4, today, null);
  insert into public.countdowns (title, emoji, target_date) values
    ('Diwali', '🪔', '2026-11-08'),
    ('Engagement', '💍', '2026-12-10');
end $$;

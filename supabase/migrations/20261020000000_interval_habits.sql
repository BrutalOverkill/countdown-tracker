-- Amendment A: "every N days" habits (spec §8.5).
alter table public.habits drop constraint habits_frequency_check;
alter table public.habits add constraint habits_frequency_check check (frequency in ('daily', 'weekly', 'interval'));
alter table public.habits
  add column interval_days smallint check (interval_days between 2 and 30),
  add column interval_start date;
alter table public.habits add constraint habits_interval_fields check (
  (frequency = 'interval') = (interval_days is not null and interval_start is not null)
);

-- Dermarolling moves to every 4 days, first due on its app creation day or 20 Oct 2026, whichever is later.
update public.habits
   set frequency = 'interval', interval_days = 4, weekday = null,
       interval_start = greatest(((created_at at time zone 'Asia/Kolkata') - interval '4 hours')::date, date '2026-10-20')
 where name = 'Dermarolling' and source = 'manual' and frequency = 'weekly';

create or replace function public.ensure_setup() returns void
language plpgsql security invoker set search_path = '' as $$
declare
  today date := ((now() at time zone 'Asia/Kolkata') - interval '4 hours')::date;
begin
  insert into public.settings (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  if not found then
    return;
  end if;
  insert into public.habits (name, emoji, color, frequency, source, slot, weekday, sort_order, interval_days, interval_start) values
    ('10k steps', '👟', '#FF453A', 'daily', 'steps', 'anytime', null, 1, null, null),
    ('Calories on target', '🍽️', '#FF9F0A', 'daily', 'calories', 'anytime', null, 2, null, null),
    ('Fasting windows kept', '🌙', '#FFD60A', 'daily', 'fasting', 'anytime', null, 3, null, null),
    ('Workout', '💪', '#A3F53B', 'daily', 'workout', 'anytime', null, 4, null, null),
    ('AM skincare', '🧴', '#30D158', 'daily', 'manual', 'morning', null, 5, null, null),
    ('PM skincare', '🌙', '#00C7BE', 'daily', 'manual', 'night', null, 6, null, null),
    ('Minoxidil AM', '💧', '#32D7FA', 'daily', 'manual', 'morning', null, 7, null, null),
    ('Minoxidil PM', '💧', '#0A84FF', 'daily', 'manual', 'night', null, 8, null, null),
    ('Dermarolling', '🪡', '#BF5AF2', 'interval', 'manual', 'night', null, 9, 4, today);
  insert into public.countdowns (title, emoji, target_date) values
    ('Diwali', '🪔', '2026-11-08'),
    ('Engagement', '💍', '2026-12-10');
end $$;

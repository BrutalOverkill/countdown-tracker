// Proves the schema, RLS and ensure_setup work for a fresh user.
import assert from 'node:assert/strict';
import { resetUser, signIn } from './env.mjs';

const { db, userId } = await signIn();
await resetUser(db, userId);

const { data: habits, error: hErr } = await db.from('habits').select('name, source, frequency').order('sort_order');
assert.ifError(hErr);
assert.equal(habits.length, 9);
assert.deepEqual(habits.map((h) => h.source), ['steps', 'calories', 'fasting', 'workout', 'manual', 'manual', 'manual', 'manual', 'manual']);

const { data: countdowns } = await db.from('countdowns').select('title, target_date').order('target_date');
assert.deepEqual(countdowns, [{ title: 'Diwali', target_date: '2026-11-08' }, { title: 'Engagement', target_date: '2026-12-10' }]);

const { data: settings } = await db.from('settings').select('step_goal, kcal_goal, fasting_enabled, eating_windows').single();
assert.deepEqual(settings, {
  step_goal: 10000, kcal_goal: 2000, fasting_enabled: true,
  eating_windows: [{ start: '00:00', end: '01:00' }, { start: '11:00', end: '13:00' }],
});

const { error: againErr } = await db.rpc('ensure_setup');
assert.ifError(againErr);
const { count } = await db.from('habits').select('*', { count: 'exact', head: true });
assert.equal(count, 9, 'ensure_setup must not seed twice');

const { data: token, error: tErr } = await db.rpc('rotate_sync_token');
assert.ifError(tErr);
assert.match(token, /^[0-9a-f]{64}$/);

console.log('setup-check passed');

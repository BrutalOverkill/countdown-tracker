// Proves row-level security on EVERY table: the test user only sees its own rows, can't create rows for
// anyone else, can't hand its own rows to anyone else, and a signed-out client can read nothing and call no RPCs.
// Each attempt uses otherwise-valid data (real foreign keys), so the only possible rejection is RLS (42501).
import assert from 'node:assert/strict';
import { anon, resetUser, signIn, TABLES } from './env.mjs';

const { db, userId } = await signIn();
await resetUser(db, userId);

const day = '2026-10-19';
const { data: habit } = await db.from('habits').select('id').limit(1).single();
const { data: countdown } = await db.from('countdowns').select('id').limit(1).single();
const { data: saved, error: savedError } = await db.from('saved_foods').insert({ name: 'x', kcal: 1 }).select('id').single();
assert.ifError(savedError);

// Give the test user a row in every table (settings, habits and countdowns already exist from setup).
const own = {
  habit_checks: { habit_id: habit.id, day },
  challenges: { countdown_id: countdown.id, habit_id: habit.id, target_days: 1, start_day: day },
  steps_daily: { day, count: 1 },
  workouts: { started_at: new Date().toISOString(), day, source: 'manual' },
  food_entries: { day, name: 'x', kcal: 1, saved_food_id: saved.id },
  tasks: { title: 'x', month: '2026-10-01' },
};
for (const [table, row] of Object.entries(own)) {
  const { error } = await db.from(table).insert(row);
  assert.ifError(error);
}

for (const table of TABLES) {
  const { data, error } = await db.from(table).select('user_id');
  assert.ifError(error);
  assert.ok(data.length > 0, `${table}: expected at least one own row`);
  assert.ok(data.every((r) => r.user_id === userId), `${table}: returned another user's rows`);
}

const stranger = '00000000-0000-0000-0000-000000000001';
const foreignRows = {
  settings: { user_id: stranger },
  countdowns: { user_id: stranger, title: 'x', target_date: '2030-01-01' },
  habits: { user_id: stranger, name: 'x', color: '#FFFFFF', frequency: 'daily' },
  habit_checks: { user_id: stranger, habit_id: habit.id, day: '2026-10-20' },
  challenges: { user_id: stranger, countdown_id: countdown.id, habit_id: habit.id, target_days: 1, start_day: day },
  steps_daily: { user_id: stranger, day: '2026-10-20', count: 1 },
  workouts: { user_id: stranger, started_at: new Date(Date.now() - 60_000).toISOString(), day, source: 'manual' },
  saved_foods: { user_id: stranger, name: 'x', kcal: 1 },
  food_entries: { user_id: stranger, day, name: 'x', kcal: 1 },
  tasks: { user_id: stranger, title: 'x', month: '2026-10-01' },
};
assert.deepEqual(Object.keys(foreignRows).sort(), [...TABLES].sort(), 'every table is covered');
for (const [table, row] of Object.entries(foreignRows)) {
  const { error } = await db.from(table).insert(row);
  assert.equal(error?.code, '42501', `${table}: insert for another user was not blocked by RLS (${error?.message ?? 'accepted'})`);
}

for (const table of TABLES) {
  const { error } = await db.from(table).update({ user_id: stranger }).eq('user_id', userId);
  assert.equal(error?.code, '42501', `${table}: handing an own row to another user was not blocked (${error?.message ?? 'accepted'})`);
}

const signedOut = anon();
for (const table of TABLES) {
  const { data, error } = await signedOut.from(table).select('*').limit(1);
  assert.ok(error || data.length === 0, `${table}: readable while signed out`);
}
for (const fn of ['ensure_setup', 'rotate_sync_token']) {
  const { error } = await signedOut.rpc(fn);
  assert.ok(error, `${fn}: callable while signed out`);
}

await resetUser(db, userId);
console.log('security-check passed');

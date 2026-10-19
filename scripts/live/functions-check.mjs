// Exercises the deployed sync and food-guard functions end to end with the test user's token.
import assert from 'node:assert/strict';
import { appToday, istDayOf, istMinutesOf } from '../../supabase/functions/_shared/days.ts';
import { env, resetUser, signIn } from './env.mjs';

const { db, userId } = await signIn();
await resetUser(db, userId);
const issued = await db.rpc('rotate_sync_token');
assert.ifError(issued.error);
let token = issued.data;

async function call(fn, body, auth = `Bearer ${token}`) {
  const res = await fetch(`${env.url}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const TOKEN_ERROR = { error: 'Token not recognised — copy it again from Settings' };
assert.deepEqual(await call('sync', {}, null), { status: 401, body: TOKEN_ERROR });
assert.deepEqual(await call('sync', {}, 'Bearer wrong'), { status: 401, body: TOKEN_ERROR });
assert.deepEqual(await call('food-guard', {}, 'Bearer wrong'), { status: 401, body: TOKEN_ERROR });

// Rotating invalidates the old token at once; the new one works straight away.
const oldToken = token;
const rotated = await db.rpc('rotate_sync_token');
assert.ifError(rotated.error);
token = rotated.data;
assert.equal((await call('sync', { ping: '1' }, `Bearer ${oldToken}`)).status, 401, 'old token rejected after rotation');
assert.equal((await call('food-guard', { ping: '1' }, `Bearer ${oldToken}`)).status, 401, 'old token rejected by food-guard too');
assert.equal((await call('sync', { ping: '1' })).status, 200, 'new token accepted');

assert.deepEqual(await call('sync', 'not json'), { status: 400, body: { error: 'Body must be JSON' } });
assert.deepEqual((await call('sync', { steps: [{ date: '2020-01-01', count: 1 }] })).body, { error: 'steps[0].date must be a recent date (yyyy-MM-dd)' });

const calendarToday = istDayOf(new Date());
const calendarYesterday = istDayOf(new Date(Date.now() - 86_400_000));

// A partial Health count first; the fuller one later must replace it.
assert.equal((await call('sync', { steps: { date: calendarToday, count: 5000 } })).status, 200);

const start = new Date(Date.now() - 60 * 60_000).toISOString();
const quirky = { steps: { date: calendarToday, count: '7842.4' }, workouts: [{ start, durationMin: '52', name: 'Traditional Strength Training' }] };
const first = await call('sync', quirky);
assert.equal(first.status, 200);
assert.deepEqual(first.body.saved, { steps: 1, workouts: 1 });
assert.ok(first.body.pending.includes('AM skincare'), 'nudge lists unticked routines');
assert.match(first.body.message, /^Left today: /);

const again = await call('sync', quirky);
assert.equal(again.status, 200);
const { data: workouts } = await db.from('workouts').select('source, duration_min');
assert.deepEqual(workouts, [{ source: 'health', duration_min: 52 }], 'a re-sent workout is not duplicated');
const { data: steps } = await db.from('steps_daily').select('count').eq('day', calendarToday).single();
assert.equal(steps.count, 7842, 'the corrected total replaced the partial one');

// One bad item rejects the whole request and saves nothing from it.
const partial = await call('sync', { steps: [{ date: calendarYesterday, count: 999 }, { date: '2020-01-01', count: 1 }] });
assert.equal(partial.status, 400);
const { data: none } = await db.from('steps_daily').select('count').eq('day', calendarYesterday);
assert.deepEqual(none, [], 'a partly invalid batch saved nothing');

// A user_id in the payload is ignored: the row lands on the token's owner.
const stranger = '00000000-0000-0000-0000-000000000001';
assert.equal((await call('sync', { user_id: stranger, steps: { date: calendarYesterday, count: 123, user_id: stranger } })).status, 200);
const { data: mine } = await db.from('steps_daily').select('user_id, count').eq('day', calendarYesterday).single();
assert.deepEqual(mine, { user_id: userId, count: 123 });

assert.equal((await call('sync', '')).status, 200, 'an empty body is accepted');

const today = appToday();
const { data: manual } = await db.from('habits').select('id').eq('source', 'manual');
await db.from('habit_checks').insert(manual.map((h) => ({ habit_id: h.id, day: today })));
const done = await call('sync', { ping: '1' });
assert.deepEqual([done.body.pending, done.body.message], [[], ''], 'nothing left once everything is ticked');
const { data: settings } = await db.from('settings').select('last_sync_at').single();
assert.ok(Date.now() - Date.parse(settings.last_sync_at) < 5 * 60_000, 'last_sync_at updated');

// food-guard: build windows around the server's real clock.
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const now = istMinutesOf(new Date());
const around = { start: hhmm(Math.max(0, now - 30)), end: hhmm(Math.min(1439, now + 30)) };
const away = now + 180 <= 1439 ? { start: hhmm(now + 120), end: hhmm(now + 180) } : { start: hhmm(now - 180), end: hhmm(now - 120) };

await db.from('settings').update({ fasting_enabled: true, eating_windows: [around] }).eq('user_id', userId);
const open = (await call('food-guard', { ping: '1' })).body;
assert.deepEqual([open.kcal, open.reached, open.fasting, open.blocked, open.message], [0, false, false, false, '']);

await db.from('food_entries').insert({ day: today, eaten_at: new Date().toISOString(), name: 'Test', kcal: 2000 });
const atTarget = (await call('food-guard', {})).body;
assert.equal(atTarget.blocked, true);
assert.equal(atTarget.message, "🛑 2,000 kcal today — target hit. Kitchen's closed.");

await db.from('food_entries').delete().eq('user_id', userId);
await db.from('settings').update({ eating_windows: [away] }).eq('user_id', userId);
const fasting = (await call('food-guard', {})).body;
assert.deepEqual([fasting.fasting, fasting.blocked], [true, true]);
assert.match(fasting.message, /^🌙 Fasting — next window opens at \d{1,2}:\d{2} (AM|PM)\.$/);

await db.from('settings').update({ fasting_enabled: false }).eq('user_id', userId);
const off = (await call('food-guard', {})).body;
assert.deepEqual([off.blocked, off.nextWindow], [false, null]);

await resetUser(db, userId);
console.log('functions-check passed');

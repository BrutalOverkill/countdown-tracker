import { addDays, appDayOf, appToday, istDayOf, weekBlockRange } from '../_shared/days.ts';
import { adminClient, json, ownerForRequest, SERVER_ERROR, TOKEN_ERROR } from '../_shared/http.ts';
import { messageFor, pendingFor, validatePayload, type ManualHabit } from './logic.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  try {
    const db = adminClient();
    const owner = await ownerForRequest(db, req);
    if (!owner) return json(401, { error: TOKEN_ERROR });

    let body: unknown;
    try {
      // An empty body is fine: the Shortcut's final "just give me the nudge" call may send nothing.
      const text = await req.text();
      body = text.trim() ? JSON.parse(text) : {};
    } catch {
      return json(400, { error: 'Body must be JSON' });
    }
    const checked = validatePayload(body, istDayOf(new Date(Date.now() + 15 * 60_000)));
    if (!checked.ok) return json(400, { error: checked.error });
    const { steps, workouts } = checked.value;
    const now = new Date().toISOString();

    if (steps.length) {
      const { error } = await db.from('steps_daily').upsert(
        steps.map((s) => ({ user_id: owner.userId, day: s.date, count: s.count, synced_at: now })),
        { onConflict: 'user_id,day' },
      );
      if (error) throw error;
    }
    if (workouts.length) {
      const { error } = await db.from('workouts').upsert(
        workouts.map((w) => ({
          user_id: owner.userId, started_at: w.start, day: appDayOf(new Date(w.start)),
          duration_min: w.durationMin, name: w.name, source: 'health',
        })),
        { onConflict: 'user_id,started_at' },
      );
      if (error) throw error;
    }
    const { error: syncError } = await db.from('settings').update({ last_sync_at: now }).eq('user_id', owner.userId);
    if (syncError) throw syncError;

    const today = appToday();
    const { start } = weekBlockRange(today);
    const [habits, checks] = await Promise.all([
      db.from('habits').select('id, name, frequency, weekday, interval_days, interval_start, sort_order, created_at')
        .eq('user_id', owner.userId).eq('source', 'manual').is('archived_at', null),
      db.from('habit_checks').select('habit_id, day').eq('user_id', owner.userId).gte('day', [start, addDays(today, -30)].sort()[0]).lte('day', today),
    ]);
    if (habits.error) throw habits.error;
    if (checks.error) throw checks.error;
    const manual: ManualHabit[] = (habits.data ?? [])
      .filter((h) => appDayOf(new Date(h.created_at)) <= today)
      .map((h) => ({
        name: h.name, frequency: h.frequency, weekday: h.weekday, intervalDays: h.interval_days, intervalStart: h.interval_start, sortOrder: h.sort_order,
        checkedDays: (checks.data ?? []).filter((c) => c.habit_id === h.id).map((c) => c.day),
      }));
    const pending = pendingFor(today, manual);
    return json(200, { saved: { steps: steps.length, workouts: workouts.length }, pending, message: messageFor(pending) });
  } catch (e) {
    console.error(e);
    return json(500, { error: SERVER_ERROR });
  }
});

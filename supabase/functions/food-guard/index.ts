import { appToday, istMinutesOf } from '../_shared/days.ts';
import { adminClient, json, ownerForRequest, SERVER_ERROR, TOKEN_ERROR } from '../_shared/http.ts';
import { guardResult } from './logic.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  try {
    const db = adminClient();
    const owner = await ownerForRequest(db, req);
    if (!owner) return json(401, { error: TOKEN_ERROR });
    const now = new Date();
    const { data, error } = await db.from('food_entries').select('kcal').eq('user_id', owner.userId).eq('day', appToday(now));
    if (error) throw error;
    const kcal = (data ?? []).reduce((sum, row) => sum + row.kcal, 0);
    return json(200, guardResult({
      kcal, goal: owner.kcalGoal, fastingEnabled: owner.fastingEnabled, windows: owner.windows, minute: istMinutesOf(now),
    }));
  } catch (e) {
    console.error(e);
    return json(500, { error: SERVER_ERROR });
  }
});

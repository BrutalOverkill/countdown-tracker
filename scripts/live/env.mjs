// Shared setup for the live (real Supabase) checks: loads .env.local, signs in the test user, wipes its rows.
import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile('.env.local');
} catch {
  // CI provides the variables directly.
}

export const env = {
  url: required('SUPABASE_URL'),
  key: required('SUPABASE_PUBLISHABLE_KEY'),
  email: required('E2E_EMAIL'),
  password: required('E2E_PASSWORD'),
};

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} (set it in .env.local)`);
  return value;
}

// Every live check wipes the signed-in account's data, so it must only ever run as the dedicated test user.
if (!/test/i.test(env.email)) {
  throw new Error('Refusing to run: E2E_EMAIL must be the dedicated test account (its address must contain "test").');
}

export const TABLES = ['habit_checks', 'challenges', 'tasks', 'food_entries', 'saved_foods', 'workouts', 'steps_daily', 'habits', 'countdowns', 'settings'];

export function anon() {
  return createClient(env.url, env.key, { auth: { persistSession: false } });
}

export async function signIn() {
  const db = anon();
  const { data, error } = await db.auth.signInWithPassword({ email: env.email, password: env.password });
  if (error) throw new Error(`Test user sign-in failed: ${error.message}`);
  if (data.user.email?.toLowerCase() !== env.email.toLowerCase()) throw new Error('Signed-in account is not the configured test user; refusing to continue.');
  return { db, userId: data.user.id };
}

/** Deletes every row the test user owns (children first), then re-runs first-login setup. */
export async function resetUser(db, userId) {
  for (const table of TABLES) {
    const { error } = await db.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  const { error } = await db.rpc('ensure_setup');
  if (error) throw error;
}

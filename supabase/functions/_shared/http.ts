import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { serviceKey } from './keys.ts';
import { bearerToken, sha256Hex } from './token.ts';
import type { EatingWindow } from './windows.ts';

export const TOKEN_ERROR = 'Token not recognised — copy it again from Settings';
export const SERVER_ERROR = 'Server error — try again later';

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = serviceKey((name) => Deno.env.get(name));
  if (!url || !key) throw new Error('Missing SUPABASE_URL or service key');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Owner {
  userId: string;
  kcalGoal: number;
  fastingEnabled: boolean;
  windows: EatingWindow[];
}

/** The owner whose Shortcut token is in the request's Authorization header, or null. */
export async function ownerForRequest(db: SupabaseClient, req: Request): Promise<Owner | null> {
  const token = bearerToken(req.headers.get('Authorization'));
  if (!token) return null;
  const { data, error } = await db
    .from('settings')
    .select('user_id, kcal_goal, fasting_enabled, eating_windows')
    .eq('sync_token_hash', await sha256Hex(token))
    .maybeSingle();
  if (error) throw error;
  return data
    ? { userId: data.user_id, kcalGoal: data.kcal_goal, fastingEnabled: data.fasting_enabled, windows: data.eating_windows ?? [] }
    : null;
}

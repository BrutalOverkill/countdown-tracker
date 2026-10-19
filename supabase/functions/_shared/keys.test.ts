import { describe, expect, it } from 'vitest';
import { serviceKey } from './keys.ts';

const env = (vars: Record<string, string>) => (name: string) => vars[name];

describe('serviceKey', () => {
  it('prefers a SERVICE_KEY secret over the injected legacy key', () => {
    expect(serviceKey(env({ SERVICE_KEY: 'sb_secret_x', SUPABASE_SERVICE_ROLE_KEY: 'legacy' }))).toBe('sb_secret_x');
  });

  it('falls back to the injected key, and to undefined when neither is set', () => {
    expect(serviceKey(env({ SUPABASE_SERVICE_ROLE_KEY: 'legacy' }))).toBe('legacy');
    expect(serviceKey(env({}))).toBeUndefined();
  });
});

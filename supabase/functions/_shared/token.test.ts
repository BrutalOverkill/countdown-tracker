import { describe, expect, it } from 'vitest';
import { bearerToken, sha256Hex } from './token.ts';

describe('token helpers', () => {
  it("hashes like Postgres encode(sha256(convert_to(t, 'UTF8')), 'hex')", async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('reads a bearer token', () => {
    expect(bearerToken('Bearer abc123')).toBe('abc123');
    expect(bearerToken('bearer   abc123  ')).toBe('abc123');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

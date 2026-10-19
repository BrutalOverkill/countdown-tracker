import { TestBed } from '@angular/core/testing';
import { AuthRetryableFetchError, type AuthChangeEvent, type Session } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { SUPABASE_URL } from './config';
import { SUPABASE } from './supabase';

const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
const stored = { access_token: 'old', refresh_token: 'r', expires_at: 1, token_type: 'bearer', user: { id: 'u1', email: 'me@example.com' } };

function setup(getSession: () => Promise<unknown>) {
  let listener: (event: AuthChangeEvent, session: Session | null) => void = () => undefined;
  const auth = { getSession, onAuthStateChange: (cb: typeof listener) => ((listener = cb), { data: { subscription: { unsubscribe() {} } } }) };
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: { auth } }] });
  return { service: TestBed.inject(AuthService), emit: (e: AuthChangeEvent, s: Session | null) => listener(e, s) };
}

describe('AuthService', () => {
  afterEach(() => localStorage.clear());

  it('stays signed in when an expired session cannot be refreshed offline', async () => {
    localStorage.setItem(storageKey, JSON.stringify(stored));
    const { service, emit } = setup(async () => ({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) }));
    await service.ready;
    expect(service.userId()).toBe('u1');

    emit('INITIAL_SESSION', null);
    expect(service.userId()).toBe('u1');
    emit('SIGNED_OUT', null);
    expect(service.userId()).toBeNull();
  });

  it('is signed out when there is no session at all', async () => {
    const { service } = setup(async () => ({ data: { session: null }, error: null }));
    await service.ready;
    expect(service.userId()).toBeNull();
  });
});

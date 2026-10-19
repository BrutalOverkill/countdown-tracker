import { computed, inject, Injectable, signal } from '@angular/core';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { SUPABASE_URL } from './config';
import { storageGet } from './storage';
import { SUPABASE } from './supabase';

// Where supabase-js keeps the session (its default key for this project).
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly db = inject(SUPABASE);
  readonly session = signal<Session | null>(null);
  readonly email = computed(() => this.session()?.user.email ?? '');
  readonly userId = computed(() => this.session()?.user.id ?? null);
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.db.auth.getSession().then(({ data, error }) => {
      // Offline with an expired access token, supabase-js can't refresh it and reports no session,
      // but keeps it to refresh later; stay signed in so the app shows "offline", not the login page.
      this.session.set(data.session ?? (isAuthRetryableFetchError(error) ? storedSession() : null));
    });
    // Only a real sign-out clears the session; a null on start-up while offline is not one.
    this.db.auth.onAuthStateChange((event, session) => {
      if (session || event === 'SIGNED_OUT') this.session.set(session);
    });
  }

  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.db.auth.signInWithPassword({ email, password });
    if (!error) return null;
    return error.status === 400 ? "Email or password didn't match" : "Couldn't sign in — check your connection";
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }
}

function storedSession(): Session | null {
  try {
    const s = JSON.parse(storageGet(SESSION_KEY) ?? 'null') as Session | null;
    return s?.user?.id && s.refresh_token ? s : null;
  } catch {
    return null;
  }
}

import { computed, inject, Injectable, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SUPABASE } from './supabase';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly db = inject(SUPABASE);
  readonly session = signal<Session | null>(null);
  readonly email = computed(() => this.session()?.user.email ?? '');
  readonly userId = computed(() => this.session()?.user.id ?? null);
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.db.auth.getSession().then(({ data }) => this.session.set(data.session));
    this.db.auth.onAuthStateChange((_event, session) => this.session.set(session));
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

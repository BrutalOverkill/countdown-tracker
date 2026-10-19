import { Location } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { AuthService } from './core/auth.service';

describe('routing', () => {
  it('sends a signed-out visitor to the login page', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: AuthService, useValue: { ready: Promise.resolve(), session: signal(null), signIn: vi.fn() } }],
    });
    const harness = await RouterTestingHarness.create('/today');
    expect(harness.routeNativeElement?.textContent).toContain('Sign in');
    expect(TestBed.inject(Location).path()).toBe('/login');
  });
});

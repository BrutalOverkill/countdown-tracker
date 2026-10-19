import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  const setup = (result: string | null) => {
    const signIn = vi.fn().mockResolvedValue(result);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: { signIn } }] });
    const fixture = TestBed.createComponent(LoginPage);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('input[type=email]') as HTMLInputElement).value = ' me@example.com ';
    (el.querySelector('input[type=password]') as HTMLInputElement).value = 'secret';
    return { fixture, el, signIn };
  };

  it('shows the sign-in error', async () => {
    const { fixture, el, signIn } = setup("Email or password didn't match");
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(signIn).toHaveBeenCalledWith('me@example.com', 'secret');
    expect(el.querySelector('[role=alert]')?.textContent).toContain("Email or password didn't match");
  });

  it('goes to Today after signing in', async () => {
    const { fixture, el } = setup(null);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith('/today');
  });
});

import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  it('shows the app name', async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Countdown');
  });
});

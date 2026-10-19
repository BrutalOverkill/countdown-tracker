import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { TrackerApi } from '../../data/tracker-api';
import { TrackerStore } from '../../data/tracker.store';
import { TodayPage } from './today.page';

describe('TodayPage', () => {
  it('↻ Sync marks the data stale so returning from the Shortcut reloads it', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TrackerApi, useValue: {} }, { provide: AuthService, useValue: { email: signal('anvit@example.com') } }],
    });
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)');
    const store = TestBed.inject(TrackerStore);
    const markStale = vi.spyOn(store, 'markStale');
    const fixture = TestBed.createComponent(TodayPage);
    await fixture.whenStable();
    const link = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')].find((a) => a.textContent?.includes('↻ Sync'))!;
    // Keep the test page from following the shortcuts:// link.
    const block = (e: Event) => e.preventDefault();
    document.addEventListener('click', block);
    link.click();
    document.removeEventListener('click', block);
    expect(markStale).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

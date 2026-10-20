import { TestBed } from '@angular/core/testing';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppUpdates, RELOAD } from './app-updates';

function setup() {
  const versionUpdates = new Subject<VersionEvent>();
  const sw = { isEnabled: true, versionUpdates, unrecoverable: new Subject(), checkForUpdate: vi.fn().mockResolvedValue(true), activateUpdate: vi.fn().mockResolvedValue(true) };
  const reload = vi.fn();
  TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: sw }, { provide: RELOAD, useValue: reload }] });
  TestBed.inject(AppUpdates);
  return { sw, versionUpdates, reload };
}
const ready = { type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } } as VersionEvent;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('AppUpdates', () => {
  it('checks for a new version whenever the app comes back to the screen', () => {
    const { sw } = setup();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sw.checkForUpdate).toHaveBeenCalled();
  });

  it('switches to a downloaded version straight away', async () => {
    const { sw, versionUpdates, reload } = setup();
    versionUpdates.next(ready);
    await flush();
    expect(sw.activateUpdate).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it('waits while something is being typed, then switches on the next return to the app', async () => {
    const { versionUpdates, reload } = setup();
    const input = document.body.appendChild(document.createElement('input'));
    input.focus();
    versionUpdates.next(ready);
    await flush();
    expect(reload).not.toHaveBeenCalled();
    input.remove();
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(reload).toHaveBeenCalled();
  });
});

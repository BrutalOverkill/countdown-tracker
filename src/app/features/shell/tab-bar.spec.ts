import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TabBar } from './tab-bar';

describe('TabBar', () => {
  it('links to the four screens', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(TabBar);
    await fixture.whenStable();
    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/today', '/habits', '/food', '/settings']);
    expect(links.map((a) => a.textContent?.trim())).toEqual(['◉Today', '◔Habits', '🍽Food', '⚙Settings']);
  });
});

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { monthLabel } from '../../core/format';
import { ThemeService } from '../../core/theme.service';
import type { MonthMatrix } from './month-matrix';
import { arcPath, dayAngle, dotRadius, polar, ringMid, ringWidth, wedgePath, WHEEL } from './wheel-geometry';

// SVG colours per theme: Bento keeps each habit's colour; Matrix draws off-white dots with red highlights.
const INK = {
  bento: { wedge: '#1f2d10', line: '#2c2c2e', label: '#d1d1d6', muted: '#8e8e93', today: '#c8ff00', star: '#ffd60a', centre: '#ffffff', dot: null as string | null },
  matrix: { wedge: '#1a0806', line: '#1f1f1f', label: '#bdbdbd', muted: '#8a8a8a', today: '#ff3b30', star: '#ff3b30', centre: '#f2f2f2', dot: '#f2f2f2' as string | null },
};

@Component({
  selector: 'app-habit-wheel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 320 320" class="w-full" role="img" [attr.aria-label]="'Habit wheel for ' + title()">
      @if (todayWedge(); as w) {
        <path [attr.d]="w" [attr.fill]="ink().wedge" />
      }
      <path [attr.d]="band" fill="none" [attr.stroke]="ink().line" stroke-width="13" />
      @for (d of dayLabels(); track d.key) {
        <text [attr.x]="d.x" [attr.y]="d.y + 2.5" text-anchor="middle" font-size="6.5" [attr.fill]="d.fill" [attr.font-weight]="d.bold ? 800 : 500">{{ d.text }}</text>
      }
      @for (r of ringLines(); track $index) {
        <path [attr.d]="r" fill="none" [attr.stroke]="ink().line" stroke-width="0.8" />
      }
      @for (s of spokes(); track $index) {
        <line [attr.x1]="s[0]" [attr.y1]="s[1]" [attr.x2]="s[2]" [attr.y2]="s[3]" [attr.stroke]="ink().line" stroke-width="0.8" />
      }
      @for (dot of dots(); track dot.key) {
        <circle [attr.cx]="dot.x" [attr.cy]="dot.y" [attr.r]="dot.r" [attr.fill]="dot.color" />
      }
      @for (l of labels(); track l.key) {
        <line x1="6" [attr.y1]="l.y + 4" [attr.x2]="cx - 2" [attr.y2]="l.y + 4" [attr.stroke]="ink().line" stroke-width="0.6" />
        <text [attr.x]="cx - 6" [attr.y]="l.y + 2.5" text-anchor="end" font-size="8.5" [attr.fill]="ink().label">{{ l.text }}</text>
      }
      <text [attr.x]="cx + 14" [attr.y]="cy + 4" text-anchor="middle" font-size="20" font-weight="900" class="num" [attr.fill]="ink().centre">{{ shortMonth() }}</text>
      <text [attr.x]="cx + 14" [attr.y]="cy + 16" text-anchor="middle" font-size="7" [attr.fill]="ink().muted">⚡ = fills automatically</text>
    </svg>
    @if (matrix().rows.length === 0) {
      <p class="muted text-center">No daily habits this month.</p>
    }
  `,
})
export class HabitWheel {
  readonly matrix = input.required<MonthMatrix>();
  private readonly theme = inject(ThemeService);
  protected readonly ink = computed(() => INK[this.theme.theme()]);
  protected readonly cx = WHEEL.cx;
  protected readonly cy = WHEEL.cy;
  protected readonly band = arcPath(WHEEL.outer + 8, 0, WHEEL.span);

  protected readonly title = computed(() => monthLabel(this.matrix().month));
  protected readonly shortMonth = computed(() => this.title().slice(0, 3).toUpperCase());
  private readonly step = computed(() => WHEEL.span / this.matrix().days.length);
  private readonly inner = computed(() => WHEEL.outer - this.matrix().rows.length * ringWidth(this.matrix().rows.length));

  protected readonly todayWedge = computed(() => {
    const i = this.matrix().todayIndex;
    return i < 0 ? null : wedgePath(this.inner(), WHEEL.outer + 15, i * this.step(), (i + 1) * this.step());
  });

  protected readonly dayLabels = computed(() => {
    const m = this.matrix();
    return m.days.map((day, i) => {
      const [x, y] = polar(WHEEL.outer + 8, dayAngle(i, m.days.length));
      const today = i === m.todayIndex;
      return { key: day, x, y, text: m.perfect[i] ? '★' : String(i + 1), bold: today || m.perfect[i], fill: m.perfect[i] ? this.ink().star : today ? this.ink().today : this.ink().muted };
    });
  });

  protected readonly ringLines = computed(() => {
    const n = this.matrix().rows.length;
    return Array.from({ length: n + 1 }, (_, k) => arcPath(WHEEL.outer - k * ringWidth(n), 0, WHEEL.span));
  });

  protected readonly spokes = computed(() =>
    Array.from({ length: this.matrix().days.length + 1 }, (_, s) => [...polar(this.inner(), s * this.step()), ...polar(WHEEL.outer, s * this.step())]),
  );

  protected readonly dots = computed(() => {
    const m = this.matrix();
    return m.rows.flatMap((row, i) => {
      const r = ringMid(i, m.rows.length);
      return row.done.flatMap((done, j) => {
        if (!done) return [];
        const [x, y] = polar(r, dayAngle(j, m.days.length));
        return [{ key: `${row.habit.id}-${j}`, x, y, r: dotRadius(r, m.days.length), color: this.ink().dot ?? row.habit.color }];
      });
    });
  });

  protected readonly labels = computed(() => {
    const m = this.matrix();
    return m.rows.map((row, i) => ({
      key: row.habit.id,
      y: WHEEL.cy - ringMid(i, m.rows.length),
      text: row.habit.name + (row.habit.source === 'manual' ? '' : ' ⚡'),
    }));
  });
}

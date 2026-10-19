import { arcPath, dayAngle, dotRadius, polar, ringMid, ringWidth, WHEEL } from './wheel-geometry';

describe('wheel geometry', () => {
  it('measures angles clockwise from 12 o\'clock', () => {
    const [x0, y0] = polar(100, 0);
    expect(x0).toBeCloseTo(160);
    expect(y0).toBeCloseTo(62);
    const [x1, y1] = polar(100, 90);
    expect(x1).toBeCloseTo(260);
    expect(y1).toBeCloseTo(162);
  });

  it('uses the large-arc flag for the 270° band', () => {
    expect(arcPath(100, 0, 270)).toContain(' 0 1 1 ');
    expect(arcPath(100, 0, 90)).toContain(' 0 0 1 ');
  });

  it('shrinks rings to fit many habits', () => {
    expect(ringWidth(7)).toBe(12.5);
    expect(ringWidth(12)).toBeCloseTo((WHEEL.outer - WHEEL.minInner) / 12);
    expect(ringMid(0, 7)).toBeCloseTo(134.75);
  });

  it('spreads days over 270° and sizes dots to fit', () => {
    expect(dayAngle(0, 30)).toBeCloseTo(4.5);
    expect(dayAngle(29, 30)).toBeCloseTo(265.5);
    expect(dotRadius(134.75, 31)).toBe(4.6);
    expect(dotRadius(60, 31)).toBeLessThan(4.6);
  });
});

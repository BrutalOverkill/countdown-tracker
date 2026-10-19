/** The planner wheel: a 270° spiral from 12 o'clock clockwise, outermost ring = first habit. */
export const WHEEL = { cx: 160, cy: 162, span: 270, outer: 141, minInner: 52 } as const;

export function polar(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [WHEEL.cx + r * Math.sin(a), WHEEL.cy - r * Math.cos(a)];
}

export function arcPath(r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

export function wedgePath(rIn: number, rOut: number, a0: number, a1: number): string {
  const [ax, ay] = polar(rOut, a0);
  const [bx, by] = polar(rOut, a1);
  const [cx, cy] = polar(rIn, a1);
  const [dx, dy] = polar(rIn, a0);
  return `M${ax} ${ay} A${rOut} ${rOut} 0 0 1 ${bx} ${by} L${cx} ${cy} A${rIn} ${rIn} 0 0 0 ${dx} ${dy}Z`;
}

export function ringWidth(rings: number): number {
  return rings === 0 ? 0 : Math.min(12.5, (WHEEL.outer - WHEEL.minInner) / rings);
}

export function ringMid(i: number, rings: number): number {
  return WHEEL.outer - (i + 0.5) * ringWidth(rings);
}

export function dayAngle(i: number, days: number): number {
  return ((i + 0.5) * WHEEL.span) / days;
}

export function dotRadius(r: number, days: number): number {
  return Math.min(4.6, ((r * WHEEL.span * Math.PI) / 180 / days) * 0.36);
}

import { rgbaToCss } from '../lib/colors.js';

/**
 * Gradient CSS building utilities.
 */

export function buildGradientCss(fill) {
  const stops = fill.gradientStops.map(s =>
    rgbaToCss(s.color) + ' ' + Math.round(s.position * 100) + '%'
  ).join(', ');

  if (fill.type === 'GRADIENT_RADIAL') {
    return 'radial-gradient(ellipse at center, ' + stops + ')';
  }
  if (fill.type === 'GRADIENT_ANGULAR' || fill.type === 'GRADIENT_DIAMOND') {
    return 'conic-gradient(' + stops + ')';
  }
  // GRADIENT_LINEAR
  const t = fill.gradientTransform;
  const angleRad = Math.atan2(t[1][0], t[0][0]);
  let angleDeg = Math.round(angleRad * (180 / Math.PI));
  
  // Correction to match Figma visual center (often 90deg offset from raw transform)
  angleDeg = (angleDeg + 90) % 360;
  if (angleDeg < 0) angleDeg += 360;
  
  return 'linear-gradient(' + angleDeg + 'deg, ' + stops + ')';
}

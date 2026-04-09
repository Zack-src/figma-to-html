/**
 * Color conversion utilities.
 */

export function rgbaToCss(color, opacity = 1) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = ('a' in color ? color.a : 1) * opacity;
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${parseFloat(a.toFixed(3))})`;
}

export function rgbaToImGui(color, opacity = 1) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = Math.round((('a' in color ? color.a : 1) * opacity) * 255);
  return `IM_COL32(${r}, ${g}, ${b}, ${a})`;
}

export function rgbaToImVec4(color, opacity = 1) {
  const a = ('a' in color ? color.a : 1) * opacity;
  return `ImVec4(${color.r.toFixed(3)}f, ${color.g.toFixed(3)}f, ${color.b.toFixed(3)}f, ${a.toFixed(3)}f)`;
}

export function rgbaToHex(color) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

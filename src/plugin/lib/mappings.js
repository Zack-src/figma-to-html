/**
 * CSS property mapping utilities.
 */

export function mapEasingToCss(easing) {
  if (!easing) return 'ease';
  switch (easing.type) {
    case 'LINEAR': return 'linear';
    case 'EASE_IN': return 'ease-in';
    case 'EASE_OUT': return 'ease-out';
    case 'EASE_IN_AND_OUT': return 'ease-in-out';
    case 'EASE_IN_BACK': return 'cubic-bezier(0.36, 0, 0.66, -0.56)';
    case 'EASE_OUT_BACK': return 'cubic-bezier(0.34, 1.56, 0.64, 1)';
    case 'EASE_IN_AND_OUT_BACK': return 'cubic-bezier(0.68, -0.6, 0.32, 1.6)';
    case 'CUSTOM_CUBIC_BEZIER':
      if (easing.easingFunctionCubicBezier) {
        const { x1, y1, x2, y2 } = easing.easingFunctionCubicBezier;
        return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
      }
      return 'ease';
    default: return 'ease';
  }
}

export function mapFontWeight(style) {
  const s = style.toLowerCase();
  if (s.includes('thin') || s.includes('hairline')) return '100';
  if (s.includes('extralight') || s.includes('ultralight')) return '200';
  if (s.includes('light')) return '300';
  if (s.includes('medium')) return '500';
  if (s.includes('semibold') || s.includes('demibold')) return '600';
  if (s.includes('bold')) return '700';
  if (s.includes('extrabold') || s.includes('ultrabold')) return '800';
  if (s.includes('black') || s.includes('heavy')) return '900';
  return '400';
}

export function getAlign(align) {
  switch (align) {
    case 'MIN': return 'flex-start';
    case 'CENTER': return 'center';
    case 'MAX': return 'flex-end';
    case 'SPACE_BETWEEN': return 'space-between';
    default: return 'flex-start';
  }
}

export function mapLetterSpacing(node) {
  if (!('letterSpacing' in node) || node.letterSpacing === figma.mixed) return null;
  const ls = node.letterSpacing;
  if (ls.unit === 'PIXELS' && ls.value !== 0) return `letter-spacing: ${ls.value}px;`;
  if (ls.unit === 'PERCENT' && ls.value !== 0) return `letter-spacing: ${(ls.value / 100).toFixed(3)}em;`;
  return null;
}

export function mapTextDecoration(node) {
  if (!('textDecoration' in node) || node.textDecoration === figma.mixed) return null;
  switch (node.textDecoration) {
    case 'UNDERLINE': return 'text-decoration: underline;';
    case 'STRIKETHROUGH': return 'text-decoration: line-through;';
    default: return null;
  }
}

export function mapTextCase(node) {
  if (!('textCase' in node) || node.textCase === figma.mixed) return null;
  switch (node.textCase) {
    case 'UPPER': return 'text-transform: uppercase;';
    case 'LOWER': return 'text-transform: lowercase;';
    case 'TITLE': return 'text-transform: capitalize;';
    default: return null;
  }
}

export function fluidFontSize(sizePx) {
  const minVw = 320;
  const maxVw = 1440;
  const minSize = Math.max(12, Math.round(sizePx * 0.65));
  const maxSize = sizePx;
  const slope = (maxSize - minSize) / (maxVw - minVw);
  const intercept = minSize - slope * minVw;
  const preferred = (slope * 100).toFixed(4) + 'vw + ' + intercept.toFixed(2) + 'px';
  return `clamp(${minSize}px, ${preferred}, ${maxSize}px)`;
}


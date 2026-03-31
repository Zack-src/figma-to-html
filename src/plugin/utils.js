/**
 * Color, naming, semantic, accessibility, and CSS mapping utilities.
 */

// ── Color conversion ──

export function rgbaToCss(color, opacity = 1) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = ('a' in color ? color.a : 1) * opacity;
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${parseFloat(a.toFixed(3))})`;
}

export function rgbaToHex(color) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ── Class naming (#5 — BEM with parent context) ──

export function sanitizeName(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'element';
}

export function getClassName(node, context) {
  if (!context || !context.opts || !context.opts.cleanCode) {
    let name = sanitizeName(node.name);
    if (!name || /^[0-9]/.test(name)) name = 'n-' + (name || 'node');
    return name + '-' + node.id.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }
  return getBemClassName(node, context);
}

function getBemClassName(node, context) {
  let base = sanitizeName(node.name);
  if (!base || /^[0-9]/.test(base)) base = 'element';

  // Build BEM block__element from parent context
  let parentBase = null;
  if (node.parent && node.parent.type !== 'PAGE' && node.parent.type !== 'DOCUMENT') {
    parentBase = context.classNameMap.get(node.parent.id);
  }
  const fullKey = parentBase ? parentBase + '__' + base : base;

  if (!context.classNameCounters.has(fullKey)) {
    context.classNameCounters.set(fullKey, 0);
    context.classNameMap.set(node.id, fullKey);
    return fullKey;
  }
  const count = context.classNameCounters.get(fullKey) + 1;
  context.classNameCounters.set(fullKey, count);
  const uniqueName = fullKey + '--' + count;
  context.classNameMap.set(node.id, fullKey);
  return uniqueName;
}

// ── Semantic HTML5 tags ──

const SEMANTIC_MAP = {
  'header': 'header', 'en-tête': 'header', 'entete': 'header',
  'footer': 'footer', 'pied': 'footer',
  'nav': 'nav', 'navigation': 'nav', 'navbar': 'nav', 'menu': 'nav',
  'section': 'section',
  'main': 'main', 'contenu': 'main', 'content': 'main',
  'article': 'article',
  'aside': 'aside', 'sidebar': 'aside',
  'button': 'button', 'btn': 'button', 'bouton': 'button', 'cta': 'button',
  'input': 'input', 'champ': 'input', 'field': 'input', 'textbox': 'input',
  'textarea': 'textarea',
  'ul': 'ul', 'ol': 'ol', 'list': 'ul', 'liste': 'ul',
  'li': 'li', 'item': 'li', 'list-item': 'li',
};

export function getSemanticTag(node, context) {
  if (!context.opts.semanticHtml) return 'div';
  const name = node.name.toLowerCase().trim();
  for (const [keyword, tag] of Object.entries(SEMANTIC_MAP)) {
    if (name === keyword || name.startsWith(keyword + ' ') || name.startsWith(keyword + '-') || name.startsWith(keyword + '/')) {
      return tag;
    }
  }
  return 'div';
}

// ── Accessibility ──

export function getAriaAttrs(node, context) {
  if (!context.opts.ariaRoles) return '';
  const name = node.name.toLowerCase().trim();
  if (/\b(button|btn|bouton|cta)\b/.test(name)) return ' role="button" tabindex="0"';
  if (/\b(link|lien)\b/.test(name)) return ' role="link" tabindex="0"';
  if (/\b(input|champ|field|textbox)\b/.test(name)) return ' role="textbox"';
  if (/\b(image|img|photo|illustration|icon|icone)\b/.test(name)) return ` role="img" aria-label="${node.name}"`;
  return '';
}

export function getAltText(node, context) {
  if (!context.opts.altText) return node.name;
  if (node.name.toLowerCase().startsWith('alt:')) return node.name.substring(4).trim();
  return node.name;
}

// ── CSS mapping helpers ──

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

// ── #12 Letter spacing ──

export function mapLetterSpacing(node) {
  if (!('letterSpacing' in node) || node.letterSpacing === figma.mixed) return null;
  const ls = node.letterSpacing;
  if (ls.unit === 'PIXELS' && ls.value !== 0) return `letter-spacing: ${ls.value}px;`;
  if (ls.unit === 'PERCENT' && ls.value !== 0) return `letter-spacing: ${(ls.value / 100).toFixed(3)}em;`;
  return null;
}

// ── #12 Text decoration ──

export function mapTextDecoration(node) {
  if (!('textDecoration' in node) || node.textDecoration === figma.mixed) return null;
  switch (node.textDecoration) {
    case 'UNDERLINE': return 'text-decoration: underline;';
    case 'STRIKETHROUGH': return 'text-decoration: line-through;';
    default: return null;
  }
}

// ── #13 Text transform ──

export function mapTextCase(node) {
  if (!('textCase' in node) || node.textCase === figma.mixed) return null;
  switch (node.textCase) {
    case 'UPPER': return 'text-transform: uppercase;';
    case 'LOWER': return 'text-transform: lowercase;';
    case 'TITLE': return 'text-transform: capitalize;';
    default: return null;
  }
}

// ── #14 Rotation (check both .rotation and relativeTransform matrix) ──

export function getRotationCss(node) {
  // First try the explicit rotation property
  if ('rotation' in node && node.rotation !== 0) {
    return 'transform: rotate(' + (-node.rotation) + 'deg);';
  }
  // Fallback: extract rotation from relativeTransform matrix
  // relativeTransform is [[cos, -sin, tx], [sin, cos, ty]]
  if ('relativeTransform' in node) {
    try {
      var m = node.relativeTransform;
      var angle = Math.atan2(m[1][0], m[0][0]) * (180 / Math.PI);
      if (Math.abs(angle) > 0.1) {
        return 'transform: rotate(' + angle.toFixed(2) + 'deg);';
      }
    } catch (_e) { /* ignore */ }
  }
  return null;
}

// ── Layout sizing ──

export function applySizingRules(node, parentLayoutMode, cssRules) {
  if ('layoutSizingHorizontal' in node) {
    if (node.layoutSizingHorizontal === 'FILL') {
      if (parentLayoutMode === 'HORIZONTAL') {
        cssRules.push('flex: 1 1 0px;');
        cssRules.push('min-width: 0;');
      } else {
        cssRules.push('align-self: stretch;');
        cssRules.push('width: 100%;');
      }
    } else if (node.layoutSizingHorizontal === 'FIXED') {
      cssRules.push(`width: ${node.width}px;`);
      if (parentLayoutMode === 'HORIZONTAL') cssRules.push('flex-shrink: 0;');
    } else if (node.layoutSizingHorizontal === 'HUG') {
      cssRules.push('width: max-content;');
      if (parentLayoutMode === 'HORIZONTAL') cssRules.push('flex-shrink: 0;');
    }
  } else if ('width' in node) {
    cssRules.push(`width: ${node.width}px;`);
  }

  if ('layoutSizingVertical' in node) {
    if (node.layoutSizingVertical === 'FILL') {
      if (parentLayoutMode === 'VERTICAL') {
        cssRules.push('flex: 1 1 0px;');
        cssRules.push('min-height: 0;');
      } else {
        cssRules.push('align-self: stretch;');
        cssRules.push('height: 100%;');
      }
    } else if (node.layoutSizingVertical === 'FIXED') {
      cssRules.push(`height: ${node.height}px;`);
      if (parentLayoutMode === 'VERTICAL') cssRules.push('flex-shrink: 0;');
    } else if (node.layoutSizingVertical === 'HUG') {
      cssRules.push('height: max-content;');
      if (parentLayoutMode === 'VERTICAL') cssRules.push('flex-shrink: 0;');
    }
  } else if ('height' in node) {
    cssRules.push(`height: ${node.height}px;`);
  }
}

// ── SVG detection ──

export function isExportableAsSvg(node) {
  const vectorTypes = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'LINE'];
  if (vectorTypes.includes(node.type)) return true;
  if (['COMPONENT', 'INSTANCE', 'GROUP'].includes(node.type)) {
    let hasOnlyShapes = true;
    let hasAnyShapes = false;
    function checkShapes(n) {
      if (!n.children || n.children.length === 0) { hasOnlyShapes = false; return; }
      for (const child of n.children) {
        if (vectorTypes.includes(child.type)) hasAnyShapes = true;
        else if (['GROUP', 'BOOLEAN_OPERATION', 'COMPONENT', 'INSTANCE'].includes(child.type)) checkShapes(child);
        else hasOnlyShapes = false;
      }
    }
    checkShapes(node);
    return hasOnlyShapes && hasAnyShapes;
  }
  return false;
}

// ── #20 Fluid typography (viewport-based slope 320px–1440px) ──

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

// ── #2 Helper: check if node needs position:relative ──

export function needsPositionRelative(node) {
  // Explicit absolute children
  if ('children' in node && node.children) {
    for (const child of node.children) {
      if (child.layoutPositioning === 'ABSOLUTE') return true;
    }
  }
  // Non-auto-layout frames with children → children will be positioned absolute
  if ('children' in node && node.children && node.children.length > 0) {
    if (!('layoutMode' in node) || node.layoutMode === 'NONE') {
      if (node.type !== 'PAGE' && node.type !== 'DOCUMENT') return true;
    }
  }
  return false;
}

// ── #21 Pure image node detection ──

export function isPureImageNode(node) {
  if ('children' in node && node.children && node.children.length > 0) return false;
  if (!('fills' in node) || !Array.isArray(node.fills)) return false;
  const visible = node.fills.filter(f => f.visible !== false);
  return visible.length === 1 && visible[0].type === 'IMAGE' && visible[0].imageHash;
}

// ── #22 Text truncation detection ──

export function getTextOverflowCss(node) {
  if ('textTruncation' in node && node.textTruncation === 'ENDING') {
    return ['overflow: hidden;', 'text-overflow: ellipsis;', 'white-space: nowrap;'];
  }
  return [];
}

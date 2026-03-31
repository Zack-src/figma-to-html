/**
 * Color & naming utility functions.
 */

// ── Color conversion ──

export function rgbaToCss(color, opacity = 1) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = ('a' in color ? color.a : 1) * opacity;
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function rgbaToHex(color) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ── Class naming ──

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

  const key = base;
  if (!context.classNameCounters.has(key)) {
    context.classNameCounters.set(key, 0);
    context.classNameMap.set(node.id, base);
    return base;
  }
  const count = context.classNameCounters.get(key) + 1;
  context.classNameCounters.set(key, count);
  const uniqueName = `${base}--${count}`;
  context.classNameMap.set(node.id, uniqueName);
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

// ── Fluid typography ──

export function fluidFontSize(sizePx) {
  const minSize = Math.max(12, Math.round(sizePx * 0.7));
  const maxSize = sizePx;
  const preferred = (sizePx / 16).toFixed(3);
  return `clamp(${minSize}px, ${preferred}rem + 0.5vw, ${maxSize}px)`;
}

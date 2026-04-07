import { rgbaToCss } from '../lib/colors.js';
import { buildGradientCss } from './gradients.js';
import { mapScaleMode } from './images.js';
import { collectColorToken } from '../css.js';
import { sanitizeName } from '../lib/naming.js';

/**
 * Common styles processing (fills, strokes, effects, radius, overflow).
 */

export function getFillStyleName(node) {
  try {
    if ('fillStyleId' in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
      var style = figma.getStyleById(node.fillStyleId);
      if (style && style.name) return style.name;
    }
  } catch (_e) { /* ignore */ }
  return null;
}

export async function applyFills(node, className, cssRules, context, isText) {
  if (!('fills' in node) || !Array.isArray(node.fills)) return '';

  let css = '';
  const opts = context.opts;
  const visibleFills = node.fills.filter(f => f.visible !== false);
  const imageFills = visibleFills.filter(f => f.type === 'IMAGE');
  const gradientFills = visibleFills.filter(f => f.type && f.type.indexOf('GRADIENT') === 0);
  const solidFills = visibleFills.filter(f => f.type === 'SOLID');

  // Image fills
  if (imageFills.length > 0) {
    const imageFill = imageFills[0];
    if (imageFill.imageHash) {
      const image = figma.getImageByHash(imageFill.imageHash);
      if (image) {
        try {
          const bytes = await image.getBytesAsync();
          const base64 = figma.base64Encode(bytes);
          const imageOpacity = imageFill.opacity !== undefined ? imageFill.opacity : 1;
          const bgSize = mapScaleMode(imageFill.scaleMode);

          if (opts.imageFormat === 'base64-png') {
            if (imageOpacity < 1) {
              css += '.' + className + '::before {\n  content: "";\n  position: absolute;\n  top: 0; left: 0; width: 100%; height: 100%;\n  background-image: url(\'data:image/png;base64,' + base64 + '\');\n  background-size: ' + bgSize + ';\n  background-position: center;\n  opacity: ' + imageOpacity + ';\n  z-index: -1;\n  border-radius: inherit;\n  pointer-events: none;\n}\n';
              if (!cssRules.some(r => r.startsWith('position:'))) cssRules.push('position: relative;');
            } else {
              cssRules.push('background-image: url(\'data:image/png;base64,' + base64 + '\');');
              cssRules.push('background-size: ' + bgSize + ';');
              cssRules.push('background-position: center;');
            }
          } else {
            const ext = opts.imageFormat === 'avif' ? 'avif' : (opts.imageFormat === 'png-file' ? 'png' : 'webp');
            var imgFilename;
            var cacheKey = imageFill.imageHash + '.' + ext;
            if (context.imageCache.has(cacheKey)) {
              imgFilename = context.imageCache.get(cacheKey);
            } else {
              const baseSafeName = node.name ? sanitizeName(node.name) : 'img';
              imgFilename = baseSafeName + '-' + (++context.imageCounter) + '.' + ext;
              context.imageCache.set(cacheKey, imgFilename);
              context.imageAssets.push({ filename: imgFilename, base64: base64 });
            }
            if (imageOpacity < 1) {
              css += '.' + className + '::before {\n  content: "";\n  position: absolute;\n  top: 0; left: 0; width: 100%; height: 100%;\n  background-image: url(\'assets/' + imgFilename + '\');\n  background-size: ' + bgSize + ';\n  background-position: center;\n  opacity: ' + imageOpacity + ';\n  z-index: -1;\n  border-radius: inherit;\n  pointer-events: none;\n}\n';
              if (!cssRules.some(r => r.startsWith('position:'))) cssRules.push('position: relative;');
            } else {
              cssRules.push('background-image: url(\'assets/' + imgFilename + '\');');
              cssRules.push('background-size: ' + bgSize + ';');
              cssRules.push('background-position: center;');
            }
          }
        } catch (_imgErr) {
          console.error('[Plugin] Image fetch failed for ' + node.name);
        }
      }
    }
  }

  // Gradient fills
  if (gradientFills.length > 0) {
    const gradCss = gradientFills.map(g => buildGradientCss(g)).join(', ');
    if (isText) {
      cssRules.push('background: ' + gradCss + ';');
      cssRules.push('-webkit-background-clip: text;');
      cssRules.push('-webkit-text-fill-color: transparent;');
    } else if (imageFills.length === 0) {
      cssRules.push('background: ' + gradCss + ';');
    }
  }

  // Solid fills
  if (solidFills.length > 0 && imageFills.length === 0 && gradientFills.length === 0) {
    const solidFill = solidFills[solidFills.length - 1];
    const styleName = getFillStyleName(node);
    if (opts.designTokens) {
      const tokenName = collectColorToken(solidFill.color, solidFill.opacity, context, styleName);
      cssRules.push(isText ? 'color: var(' + tokenName + ');' : 'background-color: var(' + tokenName + ');');
    } else {
      const colorVal = rgbaToCss(solidFill.color, solidFill.opacity);
      cssRules.push(isText ? 'color: ' + colorVal + ';' : 'background-color: ' + colorVal + ';');
    }
  }

  return css;
}

export function applyStrokes(node, cssRules) {
  if (!('strokes' in node) || !Array.isArray(node.strokes) || node.strokes.length === 0) return;

  const solidStroke = node.strokes.find(s => s.type === 'SOLID' && s.visible !== false);
  if (solidStroke) {
    const strokeColor = rgbaToCss(solidStroke.color, solidStroke.opacity);
    const align = ('strokeAlign' in node) ? node.strokeAlign : 'CENTER';
    if ('strokeWeight' in node && node.strokeWeight !== figma.mixed) {
      const w = node.strokeWeight;
      if (align === 'INSIDE') {
        cssRules.push('box-shadow: inset 0 0 0 ' + w + 'px ' + strokeColor + ';');
      } else if (align === 'OUTSIDE') {
        cssRules.push('outline: ' + w + 'px solid ' + strokeColor + ';');
        cssRules.push('outline-offset: 0;');
      } else {
        cssRules.push('border: ' + w + 'px solid ' + strokeColor + ';');
      }
    } else {
      if (node.strokeTopWeight > 0) cssRules.push('border-top: ' + node.strokeTopWeight + 'px solid ' + strokeColor + ';');
      if (node.strokeRightWeight > 0) cssRules.push('border-right: ' + node.strokeRightWeight + 'px solid ' + strokeColor + ';');
      if (node.strokeBottomWeight > 0) cssRules.push('border-bottom: ' + node.strokeBottomWeight + 'px solid ' + strokeColor + ';');
      if (node.strokeLeftWeight > 0) cssRules.push('border-left: ' + node.strokeLeftWeight + 'px solid ' + strokeColor + ';');
    }
  }
}

export function applyEffects(node, cssRules, isText) {
  if (!('effects' in node) || !Array.isArray(node.effects) || node.effects.length === 0) return;

  const shadows = [];
  const textShadows = [];
  for (const e of node.effects) {
    if (!e.visible) continue;
    if (e.type === 'DROP_SHADOW') {
      shadows.push(e.offset.x + 'px ' + e.offset.y + 'px ' + e.radius + 'px ' + (e.spread || 0) + 'px ' + rgbaToCss(e.color));
      textShadows.push(e.offset.x + 'px ' + e.offset.y + 'px ' + e.radius + 'px ' + rgbaToCss(e.color));
    } else if (e.type === 'INNER_SHADOW') {
      shadows.push('inset ' + e.offset.x + 'px ' + e.offset.y + 'px ' + e.radius + 'px ' + (e.spread || 0) + 'px ' + rgbaToCss(e.color));
    } else if (e.type === 'LAYER_BLUR') {
      cssRules.push('filter: blur(' + e.radius + 'px);');
    } else if (e.type === 'BACKGROUND_BLUR') {
      cssRules.push('backdrop-filter: blur(' + e.radius + 'px);');
    }
  }
  if (isText && textShadows.length > 0) cssRules.push('text-shadow: ' + textShadows.join(', ') + ';');
  else if (!isText && shadows.length > 0) cssRules.push('box-shadow: ' + shadows.join(', ') + ';');
}

export function applyBorderRadius(node, cssRules) {
  if ('cornerRadius' in node && node.cornerRadius !== figma.mixed && node.cornerRadius > 0) {
    cssRules.push('border-radius: ' + node.cornerRadius + 'px;');
  } else if ('topLeftRadius' in node && (node.topLeftRadius > 0 || node.topRightRadius > 0 || node.bottomRightRadius > 0 || node.bottomLeftRadius > 0)) {
    cssRules.push('border-radius: ' + node.topLeftRadius + 'px ' + node.topRightRadius + 'px ' + node.bottomRightRadius + 'px ' + node.bottomLeftRadius + 'px;');
  }
}

export function applyOverflow(node, cssRules) {
  if ('overflowDirection' in node && node.overflowDirection !== 'NONE') {
    if (node.overflowDirection === 'VERTICAL') {
      cssRules.push('overflow-y: auto;');
      cssRules.push('overflow-x: hidden;');
    } else if (node.overflowDirection === 'HORIZONTAL') {
      cssRules.push('overflow-x: auto;');
      cssRules.push('overflow-y: hidden;');
    } else {
      cssRules.push('overflow: auto;');
    }
  } else if ('clipsContent' in node && node.clipsContent) {
    cssRules.push('overflow: hidden;');
  }
}

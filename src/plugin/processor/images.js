import { getAltText, getAriaAttrs } from '../lib/semantics.js';
import { applySizingRules } from '../lib/geometry.js';
import { isPureImageNode } from '../lib/detection.js';
import { sanitizeName } from '../lib/naming.js';

/**
 * Image processing utilities.
 */

function mapScaleMode(scaleMode) {
  switch (scaleMode) {
    case 'FIT': return 'contain';
    case 'TILE': return 'repeat';
    case 'CROP':
    case 'FILL':
    default: return 'cover';
  }
}

export async function processImageNode(node, parentLayoutMode, cssRules, context, className) {
  if (!isPureImageNode(node)) return null;

  const imageFill = node.fills.filter(f => f.visible !== false)[0];
  const image = figma.getImageByHash(imageFill.imageHash);
  if (!image) return null;

  try {
    const opts = context.opts;
    const bytes = await image.getBytesAsync();
    const base64 = figma.base64Encode(bytes);
    const ext = opts.imageFormat === 'avif' ? 'avif' : (opts.imageFormat === 'png-file' ? 'png' : 'webp');
    var imgFn;
    var ck = imageFill.imageHash + '.' + ext;
    if (context.imageCache.has(ck)) {
      imgFn = context.imageCache.get(ck);
    } else {
      const baseSafeName = node.name ? sanitizeName(node.name) : 'img';
      imgFn = baseSafeName + '-' + (++context.imageCounter) + '.' + ext;
      context.imageCache.set(ck, imgFn);
      context.imageAssets.push({ filename: imgFn, base64: base64 });
    }

    const isAbsolute = node.layoutPositioning === 'ABSOLUTE' || (parentLayoutMode === 'NONE' && node.parent && node.parent.type !== 'PAGE' && node.parent.type !== 'DOCUMENT');

    if (isAbsolute) {
      if ('width' in node) cssRules.push('width: ' + node.width + 'px;');
      if ('height' in node) cssRules.push('height: ' + node.height + 'px;');
    } else if (parentLayoutMode !== 'NONE') {
      applySizingRules(node, parentLayoutMode, cssRules);
    } else {
      if ('width' in node) cssRules.push('width: ' + node.width + 'px;');
      if ('height' in node) cssRules.push('height: ' + node.height + 'px;');
    }

    cssRules.push('object-fit: ' + mapScaleMode(imageFill.scaleMode) + ';');
    let css = '';
    if (cssRules.length > 0) css += '.' + className + ' {\n  ' + cssRules.join('\n  ') + '\n}\n';

    var alt = getAltText(node, context);
    var ariaA = getAriaAttrs(node, context);
    var src = opts.imageFormat === 'base64-png' ? 'data:image/png;base64,' + base64 : 'assets/' + imgFn;
    return { html: '<img src="' + src + '" alt="' + alt + '" class="' + className + '"' + ariaA + '>\n', css: css };
  } catch (_e) {
    return null;
  }
}

export { mapScaleMode };

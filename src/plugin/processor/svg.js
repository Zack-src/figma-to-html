import { getAltText, getAriaAttrs } from '../lib/semantics.js';
import { applySizingRules } from '../lib/geometry.js';
import { isExportableAsSvg } from '../lib/detection.js';
import { sanitizeName } from '../lib/naming.js';

/**
 * SVG processing utilities.
 */

export async function processSvgNode(node, parentLayoutMode, cssRules, context, className) {
  if (!isExportableAsSvg(node)) return null;

  try {
    const opts = context.opts;
    const svgBytes = await node.exportAsync({ format: 'SVG' });
    let svgString = '';
    try { svgString = new TextDecoder().decode(svgBytes); }
    catch (_e) { svgString = Array.from(svgBytes).map(b => String.fromCharCode(b)).join(''); }

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

    const ariaAttrs = getAriaAttrs(node, context);
    const altText = getAltText(node, context);
    let css = '';

    if (opts.svgMode === 'file') {
      var svgFilename;
      if (context.svgCache.has(svgString)) {
        svgFilename = context.svgCache.get(svgString);
      } else {
        const baseSafeName = node.name ? sanitizeName(node.name) : 'icon';
        svgFilename = baseSafeName + '-' + (++context.svgCounter) + '.svg';
        context.svgCache.set(svgString, svgFilename);
        context.svgAssets.push({ filename: svgFilename, content: svgString });
      }
      if (cssRules.length > 0) css += '.' + className + ' {\n  ' + cssRules.join('\n  ') + '\n}\n';
      return { html: '<img src="assets/' + svgFilename + '" alt="' + altText + '" class="' + className + '"' + ariaAttrs + '>\n', css };
    } else {
      if (cssRules.length > 0) css += '.' + className + ' {\n  ' + cssRules.join('\n  ') + '\n}\n';
      return { html: '<div class="' + className + '"' + ariaAttrs + '>' + svgString + '</div>\n', css };
    }
  } catch (_svgErr) {
    console.warn('[Plugin] SVG export failed for "' + node.name + '", falling back to regular node processing.');
    return null;
  }
}

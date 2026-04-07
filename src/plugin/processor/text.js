import { mapFontWeight, mapLetterSpacing, mapTextDecoration, mapTextCase, fluidFontSize } from '../lib/mappings.js';
import { getTextOverflowCss } from '../lib/detection.js';
import { collectTextTokens } from '../css.js';

/**
 * Text processing utilities.
 */

export function processTextNode(node, cssRules, context) {
  const opts = context.opts;
  cssRules.push('display: flex;');
  cssRules.push('flex-direction: column;');

  if (node.textAlignVertical === 'CENTER') cssRules.push('justify-content: center;');
  else if (node.textAlignVertical === 'BOTTOM') cssRules.push('justify-content: flex-end;');
  else cssRules.push('justify-content: flex-start;');

  if (node.textAlignHorizontal === 'CENTER') cssRules.push('text-align: center;');
  else if (node.textAlignHorizontal === 'RIGHT') cssRules.push('text-align: right;');
  else if (node.textAlignHorizontal === 'JUSTIFIED') cssRules.push('text-align: justify;');
  else cssRules.push('text-align: left;');

  if (node.fontName !== figma.mixed) {
    const family = node.fontName.family;
    const weight = mapFontWeight(node.fontName.style);
    const size = node.fontSize !== figma.mixed ? node.fontSize : 16;
    
    context.fonts.add(family);
    if (!context.fontWeights.has(family)) context.fontWeights.set(family, new Set());
    context.fontWeights.get(family).add(weight);
    
    if (opts.designTokens) {
      const tokens = collectTextTokens(family, size, weight, context);
      cssRules.push('font-family: var(' + tokens.family + ');');
      cssRules.push('font-weight: var(' + tokens.weight + ');');
      if (opts.fluidTypo && size > 14) {
        cssRules.push('font-size: ' + fluidFontSize(size) + ';');
      } else {
        cssRules.push('font-size: var(' + tokens.size + ');');
      }
    } else {
      cssRules.push("font-family: '" + family + "', sans-serif;");
      cssRules.push('font-weight: ' + weight + ';');
      if (opts.fluidTypo && size > 14) {
        cssRules.push('font-size: ' + fluidFontSize(size) + ';');
      } else {
        cssRules.push('font-size: ' + size + 'px;');
      }
    }
  }

  if (node.lineHeight !== figma.mixed) {
    if (node.lineHeight.unit === 'PIXELS') cssRules.push('line-height: ' + node.lineHeight.value + 'px;');
    else if (node.lineHeight.unit === 'PERCENT') cssRules.push('line-height: ' + node.lineHeight.value + '%;');
  }

  var lsCss = mapLetterSpacing(node);
  if (lsCss) cssRules.push(lsCss);
  var tdCss = mapTextDecoration(node);
  if (tdCss) cssRules.push(tdCss);
  var tcCss = mapTextCase(node);
  if (tcCss) cssRules.push(tcCss);
  getTextOverflowCss(node).forEach(r => cssRules.push(r));

  var textContent;
  if (node.fontName === figma.mixed || node.fontSize === figma.mixed) {
    try {
      var segments = node.getStyledTextSegments(['fontName', 'fontSize', 'fontWeight', 'fills', 'textDecoration', 'textCase', 'letterSpacing']);
      textContent = segments.map(function (seg) {
        var styles = [];
        if (seg.fontName) styles.push("font-family:'" + seg.fontName.family + "',sans-serif");
        if (seg.fontSize) styles.push('font-size:' + seg.fontSize + 'px');
        if (seg.fontWeight) styles.push('font-weight:' + seg.fontWeight);
        if (seg.textDecoration === 'UNDERLINE') styles.push('text-decoration:underline');
        if (seg.textDecoration === 'STRIKETHROUGH') styles.push('text-decoration:line-through');
        var text = seg.characters.replace(/\n/g, '<br>');
        if (styles.length > 0) return '<span style="' + styles.join(';') + '">' + text + '</span>';
        return text;
      }).join('');
    } catch (_e) {
      textContent = node.characters.replace(/\n/g, '<br>');
    }
  } else {
    textContent = node.characters.replace(/\n/g, '<br>');
  }

  return textContent;
}

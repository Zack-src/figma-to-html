/**
 * CSS generation: design tokens, Google Fonts, Grid detection, deduplication.
 */

import { rgbaToCss, rgbaToHex } from './utils.js';

// ── Design Tokens ──

export function collectColorToken(color, opacity, context) {
  const css = rgbaToCss(color, opacity);
  const key = css;
  if (!context.colors.has(key)) {
    const idx = context.colors.size + 1;
    const name = `--color-${idx}`;
    context.colors.set(key, { name, value: css, hex: rgbaToHex(color) });
  }
  return context.colors.get(key).name;
}

export function collectTextToken(family, size, weight, context) {
  const key = `${family}-${size}-${weight}`;
  if (!context.textStyles.has(key)) {
    const idx = context.textStyles.size + 1;
    const name = `--font-${idx}`;
    context.textStyles.set(key, { name, family, size, weight });
  }
  return context.textStyles.get(key).name;
}

export function generateDesignTokens(context) {
  if (context.colors.size === 0 && context.textStyles.size === 0) return '';
  let css = ':root {\n';
  for (const [, val] of context.colors) {
    css += `  ${val.name}: ${val.value};\n`;
  }
  for (const [, val] of context.textStyles) {
    css += `  ${val.name}-family: '${val.family}', sans-serif;\n`;
    css += `  ${val.name}-size: ${val.size}px;\n`;
    css += `  ${val.name}-weight: ${val.weight};\n`;
  }
  css += '}\n';
  return css;
}

// ── Google Fonts ──

export function buildGoogleFontsLink(fontsSet) {
  const families = Array.from(fontsSet).map(f => {
    return 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@100;200;300;400;500;600;700;800;900';
  }).join('&');
  return '<link rel="preconnect" href="https://fonts.googleapis.com">' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    `<link href="https://fonts.googleapis.com/css2?${families}&display=swap" rel="stylesheet">`;
}

// ── CSS Grid detection ──

export function shouldUseGrid(node, context) {
  if (!context.opts.cssGrid) return false;
  if (!('layoutMode' in node) || node.layoutMode === 'NONE') return false;
  if (node.layoutWrap !== 'WRAP') return false;
  if (!('children' in node) || node.children.length < 3) return false;
  const widths = node.children.filter(c => c.visible).map(c => Math.round(c.width));
  if (widths.length < 2) return false;
  const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
  return widths.every(w => Math.abs(w - avg) / avg < 0.15);
}

// ── CSS Deduplication ──

export function deduplicateCss(cssString) {
  var blocks = [];
  var mediaBlocks = [];
  var otherLines = [];
  var current = '';
  var depth = 0;

  for (var i = 0; i < cssString.length; i++) {
    var ch = cssString[i];
    current += ch;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth <= 0) {
        var trimmed = current.trim();
        if (trimmed) {
          if (trimmed.indexOf('@media') === 0) {
            mediaBlocks.push(trimmed);
          } else if (trimmed.indexOf('@keyframes') === 0) {
            otherLines.push(trimmed);
          } else {
            var braceIdx = trimmed.indexOf('{');
            if (braceIdx > -1) {
              var selector = trimmed.substring(0, braceIdx).trim();
              var body = trimmed.substring(braceIdx + 1, trimmed.lastIndexOf('}')).trim();
              blocks.push({ selector: selector, body: body });
            } else {
              otherLines.push(trimmed);
            }
          }
        }
        current = '';
        depth = 0;
      }
    }
  }
  if (current.trim()) otherLines.push(current.trim());

  var bodyMap = {};
  var order = [];
  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b];
    var key = block.body;
    if (!(key in bodyMap)) {
      bodyMap[key] = [];
      order.push(key);
    }
    if (bodyMap[key].indexOf(block.selector) === -1) {
      bodyMap[key].push(block.selector);
    }
  }

  var out = '';
  for (var o = 0; o < order.length; o++) {
    var bodyKey = order[o];
    var selectors = bodyMap[bodyKey];
    out += selectors.join(',\n') + ' {\n  ' + bodyKey + '\n}\n';
  }
  for (var m = 0; m < mediaBlocks.length; m++) out += mediaBlocks[m] + '\n';
  for (var l = 0; l < otherLines.length; l++) out += otherLines[l] + '\n';
  return out;
}

// ── Base CSS reset ──

export const BASE_CSS = `*{box-sizing:border-box;}
body{margin:0;padding:20px;background-color:#f5f5f5;display:flex;justify-content:center;align-items:flex-start;}
div,p{margin:0;}
svg{display:block;width:100%;height:100%;}
`;

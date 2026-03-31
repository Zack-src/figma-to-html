/**
 * Main node processor: converts a Figma node tree to HTML + CSS.
 * Implements: #1 Smart Animate diff, #2 conditional position:relative,
 * #3 mixed text styles, #4 paragraph wrapping, #10 multiple fills,
 * #11 radial/angular gradients, #15 blur effects, #17 image scaleMode,
 * #18 strokeAlign, #19 counterAxisSpacing, #21 pure image → <img>,
 * #22 text-overflow, #23 cursor:pointer, #25 input/textarea, #26 lists, #32 z-index
 */

import { DEFAULT_OPTIONS } from './config.js';
import {
  rgbaToCss, getClassName, getSemanticTag, getAriaAttrs, getAltText,
  mapEasingToCss, mapFontWeight, getAlign, applySizingRules,
  isExportableAsSvg, fluidFontSize, needsPositionRelative, isPureImageNode,
  getTextOverflowCss, mapLetterSpacing, mapTextDecoration, mapTextCase,
  getRotationCss,
} from './utils.js';
import { collectColorToken, collectTextToken, shouldUseGrid } from './css.js';
import { collectTexts } from './components.js';
import { processInteractiveGraph } from './interactive.js';

// ── #17 Image scale mode mapping ──
function mapScaleMode(scaleMode) {
  switch (scaleMode) {
    case 'FIT': return 'contain';
    case 'TILE': return 'repeat';
    case 'CROP':
    case 'FILL':
    default: return 'cover';
  }
}

// ── #10 Build gradient CSS for any gradient type ──
function buildGradientCss(fill) {
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
  const angleDeg = Math.round(angleRad * (180 / Math.PI));
  return 'linear-gradient(' + (angleDeg + 90) + 'deg, ' + stops + ')';
}

// ── #6 Try to get Figma style name for a fill ──
function getFillStyleName(node) {
  try {
    if ('fillStyleId' in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
      var style = figma.getStyleById(node.fillStyleId);
      if (style && style.name) return style.name;
    }
  } catch (_e) { /* ignore */ }
  return null;
}

export async function processNode(
  node,
  parentLayoutMode = 'NONE',
  isRoot = false,
  context = { js: '', opts: DEFAULT_OPTIONS },
  isVariantState = false
) {
  try {
    if (!node.visible) return { html: '', css: '' };

    const opts = context.opts;
    let html = '';
    let css = '';
    const className = getClassName(node, context);
    const cssRules = [];
    const isText = node.type === 'TEXT';
    const hasReactions = node.reactions && node.reactions.length > 0;

    // ── External link detection ──
    let externalUrl = null;
    if (opts.externalLinks && hasReactions) {
      const urlReaction = node.reactions.find(r => r.action && r.action.type === 'URL');
      if (urlReaction && urlReaction.action.url) {
        externalUrl = urlReaction.action.url;
      }
    }

    // ── #23 cursor:pointer on interactive/linked elements ──
    if (externalUrl || (hasReactions && node.reactions.some(r => r.action))) {
      cssRules.push('cursor: pointer;');
    }

    // ── CHANGE_TO interactions ──
    if (!isVariantState && node.type === 'INSTANCE' && hasReactions) {
      const hasChangeTo = node.reactions.some(r => r.action && r.action.type === 'NODE' && r.action.navigation === 'CHANGE_TO');
      if (hasChangeTo) {
        return await processInteractiveGraph(node, parentLayoutMode, isRoot, context);
      }
    }

    // ── Component reuse detection ──
    if (!isVariantState && node.type === 'INSTANCE') {
      var mainComp = null;
      try { mainComp = await node.getMainComponentAsync(); } catch (_e) { /* ignore */ }
      if (mainComp) {
        var compId = mainComp.id;
        var compName = mainComp.name || 'Component';
        var texts = collectTexts(node);
        if (context.componentRegistry.has(compId)) {
          var reg = context.componentRegistry.get(compId);
          reg.instances.push({ nodeId: node.id, texts: texts });
          var reResult = await processNode(node, parentLayoutMode, isRoot, context, true);
          return { html: '<!-- component: ' + compName + ' -->\n' + reResult.html, css: reResult.css };
        } else {
          context.componentRegistry.set(compId, { name: compName, instances: [{ nodeId: node.id, texts: texts }] });
          var firstResult = await processNode(node, parentLayoutMode, isRoot, context, true);
          return { html: '<!-- component: ' + compName + ' -->\n' + firstResult.html, css: firstResult.css };
        }
      }
    }

    // ── #1 Keyframe animations (Smart Animate — diff-based) ──
    if (opts.keyframeAnim && !isVariantState && hasReactions) {
      for (const react of node.reactions) {
        if (react.action && react.action.transition && react.action.transition.type === 'SMART_ANIMATE') {
          const dur = react.action.transition.duration || 0.3;
          const eas = mapEasingToCss(react.action.transition.easing);
          const animName = 'anim-' + (++context.keyframeCounter);
          // Try to diff destination node properties
          var fromProps = [];
          var toProps = [];
          if (react.action.destinationId) {
            try {
              var destNode = await figma.getNodeByIdAsync(react.action.destinationId);
              if (destNode) {
                if (Math.abs(node.opacity - destNode.opacity) > 0.01) {
                  fromProps.push('opacity: ' + node.opacity);
                  toProps.push('opacity: ' + destNode.opacity);
                }
                if (Math.abs(node.x - destNode.x) > 1 || Math.abs(node.y - destNode.y) > 1) {
                  fromProps.push('transform: translate(' + node.x + 'px, ' + node.y + 'px)');
                  toProps.push('transform: translate(' + destNode.x + 'px, ' + destNode.y + 'px)');
                }
                if ('rotation' in node && 'rotation' in destNode && Math.abs(node.rotation - destNode.rotation) > 0.1) {
                  fromProps.push('transform: rotate(' + (-node.rotation) + 'deg)');
                  toProps.push('transform: rotate(' + (-destNode.rotation) + 'deg)');
                }
              }
            } catch (_e) { /* ignore */ }
          }
          if (fromProps.length === 0) {
            fromProps.push('opacity: 0', 'transform: translateY(10px)');
            toProps.push('opacity: 1', 'transform: translateY(0)');
          }
          context.keyframeCss += '@keyframes ' + animName + ' {\n  from { ' + fromProps.join('; ') + '; }\n  to { ' + toProps.join('; ') + '; }\n}\n';
          cssRules.push('animation: ' + animName + ' ' + dur + 's ' + eas + ' both;');
        }
      }
    }

    // ── #2 Positioning (conditional position:relative) ──
    const isAbsolute = !isRoot && !isVariantState && (
      node.layoutPositioning === 'ABSOLUTE' ||
      (parentLayoutMode === 'NONE' && node.parent && node.parent.type !== 'PAGE' && node.parent.type !== 'DOCUMENT')
    );

    if (isAbsolute) {
      let left = node.x, top = node.y;
      if (node.parent && node.parent.type === 'GROUP') {
        left = node.x - node.parent.x;
        top = node.y - node.parent.y;
      }
      cssRules.push('position: absolute;');
      cssRules.push('left: ' + left + 'px;');
      cssRules.push('top: ' + top + 'px;');
    } else if (isRoot) {
      cssRules.push('position: relative;');
      cssRules.push('margin: 0 auto;');
    } else if (needsPositionRelative(node)) {
      cssRules.push('position: relative;');
    }

    // ── #14 Rotation ──
    var rotCss = getRotationCss(node);
    if (rotCss) cssRules.push(rotCss);

    // ── #21 Pure image node → <img> tag ──
    if (isPureImageNode(node)) {
      const imageFill = node.fills.filter(f => f.visible !== false)[0];
      const image = figma.getImageByHash(imageFill.imageHash);
      if (image) {
        try {
          const bytes = await image.getBytesAsync();
          const base64 = figma.base64Encode(bytes);
          const ext = opts.imageFormat === 'avif' ? 'avif' : (opts.imageFormat === 'png-file' ? 'png' : 'webp');
          var imgFn;
          var ck = imageFill.imageHash + '.' + ext;
          if (context.imageCache.has(ck)) { imgFn = context.imageCache.get(ck); }
          else { imgFn = 'img-' + (++context.imageCounter) + '.' + ext; context.imageCache.set(ck, imgFn); context.imageAssets.push({ filename: imgFn, base64: base64 }); }

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
          if (cssRules.length > 0) css += '.' + className + ' {\n  ' + cssRules.join('\n  ') + '\n}\n';
          var alt = getAltText(node, context);
          var ariaA = getAriaAttrs(node, context);
          var src = opts.imageFormat === 'base64-png' ? 'data:image/png;base64,' + base64 : 'assets/' + imgFn;
          return { html: '<img src="' + src + '" alt="' + alt + '" class="' + className + '"' + ariaA + '>\n', css: css };
        } catch (_e) { /* fall through to normal processing */ }
      }
    }

    // ── SVG export ──
    if (isExportableAsSvg(node)) {
      try {
        const svgBytes = await node.exportAsync({ format: 'SVG' });
        let svgString = '';
        try { svgString = new TextDecoder().decode(svgBytes); }
        catch (_e) { svgString = Array.from(svgBytes).map(b => String.fromCharCode(b)).join(''); }

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

        if (opts.svgMode === 'file') {
          var svgFilename;
          if (context.svgCache.has(svgString)) { svgFilename = context.svgCache.get(svgString); }
          else { svgFilename = 'icon-' + (++context.svgCounter) + '.svg'; context.svgCache.set(svgString, svgFilename); context.svgAssets.push({ filename: svgFilename, content: svgString }); }
          if (cssRules.length > 0) css += '.' + className + ' {\n  ' + cssRules.join('\n  ') + '\n}\n';
          return { html: '<img src="assets/' + svgFilename + '" alt="' + altText + '" class="' + className + '"' + ariaAttrs + '>\n', css };
        } else {
          if (cssRules.length > 0) css += '.' + className + ' {\n  ' + cssRules.join('\n  ') + '\n}\n';
          return { html: '<div class="' + className + '"' + ariaAttrs + '>' + svgString + '</div>\n', css };
        }
      } catch (_svgErr) {
        console.warn('[Plugin] SVG export failed for "' + node.name + '", falling back to div.');
      }
    }

    // ── Opacity ──
    if ('opacity' in node && node.opacity < 1) {
      cssRules.push('opacity: ' + node.opacity + ';');
    }

    // ── #10 Fills (multiple fills support, #11 radial/angular gradients, #17 scaleMode) ──
    if ('fills' in node && Array.isArray(node.fills)) {
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
                if (context.imageCache.has(cacheKey)) { imgFilename = context.imageCache.get(cacheKey); }
                else { imgFilename = 'img-' + (++context.imageCounter) + '.' + ext; context.imageCache.set(cacheKey, imgFilename); context.imageAssets.push({ filename: imgFilename, base64: base64 }); }
                if (imageOpacity < 1) {
                  css += '.' + className + '::before {\n  content: "";\n  position: absolute;\n  top: 0; left: 0; width: 100%; height: 100%;\n  background-image: url(\'assets/' + imgFilename + '\');\n  background-size: ' + bgSize + ';\n  background-position: center;\n  opacity: ' + imageOpacity + ';\n  z-index: -1;\n  border-radius: inherit;\n  pointer-events: none;\n}\n';
                  if (!cssRules.some(r => r.startsWith('position:'))) cssRules.push('position: relative;');
                } else {
                  cssRules.push('background-image: url(\'assets/' + imgFilename + '\');');
                  cssRules.push('background-size: ' + bgSize + ';');
                  cssRules.push('background-position: center;');
                }
              }
            } catch (_imgErr) { console.error('[Plugin] Image fetch failed for ' + node.name); }
          }
        }
      }

      // Gradient fills (#10 multiple, #11 radial/angular)
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
    }

    // ── #18 Strokes (with strokeAlign support) ──
    if ('strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
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

    // ── #15 Effects (shadows + blur) ──
    if ('effects' in node && Array.isArray(node.effects) && node.effects.length > 0) {
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

    // ── Border radius ──
    if ('cornerRadius' in node && node.cornerRadius !== figma.mixed && node.cornerRadius > 0) {
      cssRules.push('border-radius: ' + node.cornerRadius + 'px;');
    } else if ('topLeftRadius' in node) {
      cssRules.push('border-radius: ' + node.topLeftRadius + 'px ' + node.topRightRadius + 'px ' + node.bottomRightRadius + 'px ' + node.bottomLeftRadius + 'px;');
    }

    // ── Overflow ──
    if ('overflowDirection' in node && node.overflowDirection !== 'NONE') {
      if (node.overflowDirection === 'VERTICAL') { cssRules.push('overflow-y: auto;'); cssRules.push('overflow-x: hidden;'); }
      else if (node.overflowDirection === 'HORIZONTAL') { cssRules.push('overflow-x: auto;'); cssRules.push('overflow-y: hidden;'); }
      else cssRules.push('overflow: auto;');
    } else if ('clipsContent' in node && node.clipsContent) {
      cssRules.push('overflow: hidden;');
    }

    // ── Text node (#3 mixed styles, #4 paragraph wrapping, #12/#13/#22) ──
    if (isText) {
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
        context.fonts.add(family);
        if (!context.fontWeights.has(family)) context.fontWeights.set(family, new Set());
        context.fontWeights.get(family).add(weight);
        if (opts.designTokens) {
          collectTextToken(family, node.fontSize !== figma.mixed ? node.fontSize : 16, weight, context);
        }
        cssRules.push("font-family: '" + family + "', sans-serif;");
        cssRules.push('font-weight: ' + weight + ';');
      }
      if (node.fontSize !== figma.mixed) {
        cssRules.push(opts.fluidTypo && node.fontSize > 14
          ? 'font-size: ' + fluidFontSize(node.fontSize) + ';'
          : 'font-size: ' + node.fontSize + 'px;');
      }
      if (node.lineHeight !== figma.mixed) {
        if (node.lineHeight.unit === 'PIXELS') cssRules.push('line-height: ' + node.lineHeight.value + 'px;');
        else if (node.lineHeight.unit === 'PERCENT') cssRules.push('line-height: ' + node.lineHeight.value + '%;');
      }

      // #12 letter-spacing, text-decoration
      var lsCss = mapLetterSpacing(node);
      if (lsCss) cssRules.push(lsCss);
      var tdCss = mapTextDecoration(node);
      if (tdCss) cssRules.push(tdCss);
      // #13 text-transform
      var tcCss = mapTextCase(node);
      if (tcCss) cssRules.push(tcCss);
      // #22 text-overflow
      getTextOverflowCss(node).forEach(r => cssRules.push(r));

      // #3 Mixed text styles → <span> segments; #4 paragraph wrapping
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

      const tag = getSemanticTag(node, context);
      const ariaAttrs = getAriaAttrs(node, context);

      // #25 Input/textarea
      if (tag === 'input') {
        if (cssRules.length > 0) css += '.' + className + ' {\n  ' + cssRules.join('\n  ') + '\n}\n';
        html += '<input type="text" value="' + node.characters.replace(/"/g, '&quot;') + '" class="' + className + '"' + ariaAttrs + '>\n';
      } else if (tag === 'textarea') {
        if (cssRules.length > 0) css += '.' + className + ' {\n  ' + cssRules.join('\n  ') + '\n}\n';
        html += '<textarea class="' + className + '"' + ariaAttrs + '>' + node.characters + '</textarea>\n';
      } else if (externalUrl) {
        html += '<a href="' + externalUrl + '" target="_blank" rel="noopener noreferrer" class="' + className + '"' + ariaAttrs + '>' + textContent + '</a>\n';
      } else {
        html += '<' + tag + ' class="' + className + '"' + ariaAttrs + '>' + textContent + '</' + tag + '>\n';
      }
    } else {
      // ── Container / Frame ──
      const tag = getSemanticTag(node, context);
      const ariaAttrs = getAriaAttrs(node, context);
      if (externalUrl) {
        html += '<a href="' + externalUrl + '" target="_blank" rel="noopener noreferrer" class="' + className + '"' + ariaAttrs + '>\n';
      } else {
        html += '<' + tag + ' class="' + className + '"' + ariaAttrs + '>\n';
      }
    }

    // ── Layout (#19 counterAxisSpacing) ──
    let currentLayoutMode = 'NONE';
    if ('layoutMode' in node && node.layoutMode !== 'NONE') {
      currentLayoutMode = node.layoutMode;
      if (!isText) {
        const useGrid = shouldUseGrid(node, context);
        if (useGrid) {
          const visibleKids = node.children.filter(c => c.visible);
          const avgWidth = Math.round(visibleKids.reduce((a, c) => a + c.width, 0) / visibleKids.length);
          cssRules.push('display: grid;');
          cssRules.push('grid-template-columns: repeat(auto-fill, minmax(' + avgWidth + 'px, 1fr));');
          if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) cssRules.push('column-gap: ' + node.itemSpacing + 'px;');
          if ('counterAxisSpacing' in node && node.counterAxisSpacing !== figma.mixed && node.counterAxisSpacing > 0) {
            cssRules.push('row-gap: ' + node.counterAxisSpacing + 'px;');
          } else if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) {
            cssRules.push('row-gap: ' + node.itemSpacing + 'px;');
          }
        } else {
          cssRules.push('display: flex;');
          cssRules.push('flex-direction: ' + (node.layoutMode === 'HORIZONTAL' ? 'row' : 'column') + ';');
          if (node.layoutWrap === 'WRAP') cssRules.push('flex-wrap: wrap;');
          // #19 separate row-gap / column-gap when counterAxisSpacing differs
          var hasCounter = 'counterAxisSpacing' in node && node.counterAxisSpacing !== figma.mixed && node.counterAxisSpacing > 0;
          var mainGap = (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) ? node.itemSpacing : 0;
          if (hasCounter && node.counterAxisSpacing !== mainGap) {
            if (node.layoutMode === 'HORIZONTAL') {
              if (mainGap > 0) cssRules.push('column-gap: ' + mainGap + 'px;');
              cssRules.push('row-gap: ' + node.counterAxisSpacing + 'px;');
            } else {
              if (mainGap > 0) cssRules.push('row-gap: ' + mainGap + 'px;');
              cssRules.push('column-gap: ' + node.counterAxisSpacing + 'px;');
            }
          } else if (mainGap > 0) {
            cssRules.push('gap: ' + mainGap + 'px;');
          }
        }

        const pt = node.paddingTop !== figma.mixed ? node.paddingTop : 0;
        const pr = node.paddingRight !== figma.mixed ? node.paddingRight : 0;
        const pb = node.paddingBottom !== figma.mixed ? node.paddingBottom : 0;
        const pl = node.paddingLeft !== figma.mixed ? node.paddingLeft : 0;
        if (pt > 0 || pr > 0 || pb > 0 || pl > 0) cssRules.push('padding: ' + pt + 'px ' + pr + 'px ' + pb + 'px ' + pl + 'px;');

        if (!useGrid) {
          cssRules.push('align-items: ' + getAlign(node.counterAxisAlignItems) + ';');
          cssRules.push('justify-content: ' + getAlign(node.primaryAxisAlignItems) + ';');
        }
      }
    }

    // ── Sizing ──
    if (isAbsolute) {
      if ('width' in node) cssRules.push('width: ' + node.width + 'px;');
      if ('height' in node) cssRules.push('height: ' + node.height + 'px;');
    } else if (parentLayoutMode !== 'NONE') {
      applySizingRules(node, parentLayoutMode, cssRules);
    } else {
      if ('width' in node) cssRules.push('width: ' + node.width + 'px;');
      if ('height' in node) cssRules.push('height: ' + node.height + 'px;');
    }

    // ── Emit CSS ──
    if (!isText || (isText && getSemanticTag(node, context) !== 'input' && getSemanticTag(node, context) !== 'textarea')) {
      if (cssRules.length > 0) {
        css += '.' + className + ' {\n  ' + cssRules.join('\n  ') + '\n}\n';
      }
    }

    // ── Children (#32 z-index for absolute children) ──
    if ('children' in node && !isText) {
      for (let ci = 0; ci < node.children.length; ci++) {
        const child = node.children[ci];
        const childResult = await processNode(child, currentLayoutMode, false, context);
        html += childResult.html;
        css += childResult.css;
        // #32 z-index for absolute-positioned children
        if (child.layoutPositioning === 'ABSOLUTE' && ci > 0) {
          css += '.' + getClassName(child, context) + ' { z-index: ' + (ci + 1) + '; }\n';
        }
      }
    }

    // ── Close tag ──
    if (!isText) {
      const tag = getSemanticTag(node, context);
      html += externalUrl ? '</a>\n' : '</' + tag + '>\n';
    }

    return { html, css };
  } catch (err) {
    if (err && err.nodeEnriched) throw err;
    try { figma.currentPage.selection = [node]; figma.viewport.scrollAndZoomIntoView([node]); } catch (_e) { /* ignore */ }
    const errorMsg = (err && err.message) ? err.message : String(err);
    const enrichedError = new Error('[Erreur sur "' + node.name + '" (' + node.type + ')] ' + errorMsg);
    enrichedError.nodeEnriched = true;
    throw enrichedError;
  }
}

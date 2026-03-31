/**
 * Main node processor: converts a Figma node tree to HTML + CSS.
 */

import { DEFAULT_OPTIONS } from './config.js';
import {
  rgbaToCss, getClassName, getSemanticTag, getAriaAttrs, getAltText,
  mapEasingToCss, mapFontWeight, getAlign, applySizingRules,
  isExportableAsSvg, fluidFontSize,
} from './utils.js';
import { collectColorToken, collectTextToken, shouldUseGrid } from './css.js';
import { collectTexts } from './components.js';
import { processInteractiveGraph } from './interactive.js';

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

    // ── External link detection ──
    let externalUrl = null;
    if (opts.externalLinks && node.reactions && node.reactions.length > 0) {
      const urlReaction = node.reactions.find(r => r.action && r.action.type === 'URL');
      if (urlReaction && urlReaction.action.url) {
        externalUrl = urlReaction.action.url;
      }
    }

    // ── CHANGE_TO interactions ──
    if (!isVariantState && node.type === 'INSTANCE' && node.reactions && node.reactions.length > 0) {
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
          context.componentRegistry.set(compId, {
            name: compName,
            instances: [{ nodeId: node.id, texts: texts }],
          });
          var firstResult = await processNode(node, parentLayoutMode, isRoot, context, true);
          return { html: '<!-- component: ' + compName + ' -->\n' + firstResult.html, css: firstResult.css };
        }
      }
    }

    // ── Keyframe animations (Smart Animate) ──
    if (opts.keyframeAnim && !isVariantState && node.reactions && node.reactions.length > 0) {
      for (const react of node.reactions) {
        if (react.action && react.action.transition && react.action.transition.type === 'SMART_ANIMATE') {
          const dur = react.action.transition.duration || 0.3;
          const eas = mapEasingToCss(react.action.transition.easing);
          const animName = `anim-${++context.keyframeCounter}`;
          context.keyframeCss += `@keyframes ${animName} {\n  from { opacity: 0; transform: translateY(10px); }\n  to { opacity: 1; transform: translateY(0); }\n}\n`;
          cssRules.push(`animation: ${animName} ${dur}s ${eas} both;`);
        }
      }
    }

    // ── Positioning ──
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
      cssRules.push(`position: absolute;`);
      cssRules.push(`left: ${left}px;`);
      cssRules.push(`top: ${top}px;`);
    } else if (isRoot) {
      cssRules.push(`position: relative;`);
      cssRules.push(`margin: 0 auto;`);
    } else {
      cssRules.push(`position: relative;`);
    }

    // ── SVG export ──
    if (isExportableAsSvg(node)) {
      try {
        const svgBytes = await node.exportAsync({ format: 'SVG' });
        let svgString = '';
        try { svgString = new TextDecoder().decode(svgBytes); }
        catch (_e) { svgString = Array.from(svgBytes).map(b => String.fromCharCode(b)).join(''); }

        if (isAbsolute) {
          if ('width' in node) cssRules.push(`width: ${node.width}px;`);
          if ('height' in node) cssRules.push(`height: ${node.height}px;`);
        } else if (parentLayoutMode !== 'NONE') {
          applySizingRules(node, parentLayoutMode, cssRules);
        } else {
          if ('width' in node) cssRules.push(`width: ${node.width}px;`);
          if ('height' in node) cssRules.push(`height: ${node.height}px;`);
        }

        const ariaAttrs = getAriaAttrs(node, context);
        const altText = getAltText(node, context);

        if (opts.svgMode === 'file') {
          var svgFilename;
          if (context.svgCache.has(svgString)) {
            svgFilename = context.svgCache.get(svgString);
          } else {
            svgFilename = 'icon-' + (++context.svgCounter) + '.svg';
            context.svgCache.set(svgString, svgFilename);
            context.svgAssets.push({ filename: svgFilename, content: svgString });
          }
          if (cssRules.length > 0) css += `.${className} {\n  ${cssRules.join('\n  ')}\n}\n`;
          return { html: `<img src="assets/${svgFilename}" alt="${altText}" class="${className}"${ariaAttrs}>\n`, css };
        } else {
          if (cssRules.length > 0) css += `.${className} {\n  ${cssRules.join('\n  ')}\n}\n`;
          return { html: `<div class="${className}"${ariaAttrs}>${svgString}</div>\n`, css };
        }
      } catch (_svgErr) {
        console.warn(`[Plugin] SVG export failed for "${node.name}", falling back to div.`);
      }
    }

    // ── Opacity ──
    if ('opacity' in node && node.opacity < 1) {
      cssRules.push(`opacity: ${node.opacity};`);
    }

    // ── Fills ──
    if ('fills' in node && Array.isArray(node.fills)) {
      const visibleFills = node.fills.filter(f => f.visible !== false);
      const imageFill = visibleFills.find(f => f.type === 'IMAGE');
      const gradientFill = visibleFills.find(f => f.type === 'GRADIENT_LINEAR');
      const solidFill = visibleFills.filter(f => f.type === 'SOLID').pop();

      if (imageFill && imageFill.imageHash) {
        const image = figma.getImageByHash(imageFill.imageHash);
        if (image) {
          try {
            const bytes = await image.getBytesAsync();
            const base64 = figma.base64Encode(bytes);
            const imageOpacity = imageFill.opacity !== undefined ? imageFill.opacity : 1;

            if (opts.imageFormat === 'base64-png') {
              if (imageOpacity < 1) {
                css += `.${className}::before {\n  content: "";\n  position: absolute;\n  top: 0; left: 0; width: 100%; height: 100%;\n  background-image: url('data:image/png;base64,${base64}');\n  background-size: cover;\n  background-position: center;\n  opacity: ${imageOpacity};\n  z-index: -1;\n  border-radius: inherit;\n  pointer-events: none;\n}\n`;
                if (!cssRules.some(r => r.startsWith('position:'))) cssRules.push(`position: relative;`);
              } else {
                cssRules.push(`background-image: url('data:image/png;base64,${base64}');`);
                cssRules.push(`background-size: cover;`);
                cssRules.push(`background-position: center;`);
              }
            } else {
              const ext = opts.imageFormat === 'avif' ? 'avif' : (opts.imageFormat === 'png-file' ? 'png' : 'webp');
              var imgFilename;
              var cacheKey = imageFill.imageHash + '.' + ext;
              if (context.imageCache.has(cacheKey)) {
                imgFilename = context.imageCache.get(cacheKey);
              } else {
                imgFilename = 'img-' + (++context.imageCounter) + '.' + ext;
                context.imageCache.set(cacheKey, imgFilename);
                context.imageAssets.push({ filename: imgFilename, base64: base64 });
              }
              if (imageOpacity < 1) {
                css += `.${className}::before {\n  content: "";\n  position: absolute;\n  top: 0; left: 0; width: 100%; height: 100%;\n  background-image: url('assets/${imgFilename}');\n  background-size: cover;\n  background-position: center;\n  opacity: ${imageOpacity};\n  z-index: -1;\n  border-radius: inherit;\n  pointer-events: none;\n}\n`;
                if (!cssRules.some(r => r.startsWith('position:'))) cssRules.push(`position: relative;`);
              } else {
                cssRules.push(`background-image: url('assets/${imgFilename}');`);
                cssRules.push(`background-size: cover;`);
                cssRules.push(`background-position: center;`);
              }
            }
          } catch (_imgErr) {
            console.error(`[Plugin] Image fetch failed for ${node.name}`);
          }
        }
      } else if (gradientFill) {
        const t = gradientFill.gradientTransform;
        const angleRad = Math.atan2(t[1][0], t[0][0]);
        const angleDeg = Math.round(angleRad * (180 / Math.PI));
        const stops = gradientFill.gradientStops.map(stop =>
          `${rgbaToCss(stop.color)} ${Math.round(stop.position * 100)}%`
        ).join(', ');
        const gradientCssVal = `linear-gradient(${angleDeg + 90}deg, ${stops})`;
        if (isText) {
          cssRules.push(`background: ${gradientCssVal};`);
          cssRules.push(`-webkit-background-clip: text;`);
          cssRules.push(`-webkit-text-fill-color: transparent;`);
        } else {
          cssRules.push(`background: ${gradientCssVal};`);
        }
      } else if (solidFill) {
        if (opts.designTokens) {
          const tokenName = collectColorToken(solidFill.color, solidFill.opacity, context);
          cssRules.push(isText ? `color: var(${tokenName});` : `background-color: var(${tokenName});`);
        } else {
          const colorVal = rgbaToCss(solidFill.color, solidFill.opacity);
          cssRules.push(isText ? `color: ${colorVal};` : `background-color: ${colorVal};`);
        }
      }
    }

    // ── Strokes ──
    if ('strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
      const solidStroke = node.strokes.find(s => s.type === 'SOLID' && s.visible !== false);
      if (solidStroke) {
        const strokeColor = rgbaToCss(solidStroke.color, solidStroke.opacity);
        if ('strokeWeight' in node && node.strokeWeight !== figma.mixed) {
          cssRules.push(`border: ${node.strokeWeight}px solid ${strokeColor};`);
        } else {
          if (node.strokeTopWeight > 0) cssRules.push(`border-top: ${node.strokeTopWeight}px solid ${strokeColor};`);
          if (node.strokeRightWeight > 0) cssRules.push(`border-right: ${node.strokeRightWeight}px solid ${strokeColor};`);
          if (node.strokeBottomWeight > 0) cssRules.push(`border-bottom: ${node.strokeBottomWeight}px solid ${strokeColor};`);
          if (node.strokeLeftWeight > 0) cssRules.push(`border-left: ${node.strokeLeftWeight}px solid ${strokeColor};`);
        }
      }
    }

    // ── Effects ──
    if ('effects' in node && Array.isArray(node.effects) && node.effects.length > 0) {
      const shadows = [];
      const textShadows = [];
      for (const e of node.effects) {
        if (e.type === 'DROP_SHADOW' && e.visible !== false) {
          shadows.push(`${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread || 0}px ${rgbaToCss(e.color)}`);
          textShadows.push(`${e.offset.x}px ${e.offset.y}px ${e.radius}px ${rgbaToCss(e.color)}`);
        } else if (e.type === 'INNER_SHADOW' && e.visible !== false) {
          shadows.push(`inset ${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread || 0}px ${rgbaToCss(e.color)}`);
        }
      }
      if (isText && textShadows.length > 0) cssRules.push(`text-shadow: ${textShadows.join(', ')};`);
      else if (!isText && shadows.length > 0) cssRules.push(`box-shadow: ${shadows.join(', ')};`);
    }

    // ── Border radius ──
    if ('cornerRadius' in node && node.cornerRadius !== figma.mixed && node.cornerRadius > 0) {
      cssRules.push(`border-radius: ${node.cornerRadius}px;`);
    } else if ('topLeftRadius' in node) {
      cssRules.push(`border-radius: ${node.topLeftRadius}px ${node.topRightRadius}px ${node.bottomRightRadius}px ${node.bottomLeftRadius}px;`);
    }

    // ── Overflow ──
    if ('overflowDirection' in node && node.overflowDirection !== 'NONE') {
      if (node.overflowDirection === 'VERTICAL') { cssRules.push(`overflow-y: auto;`); cssRules.push(`overflow-x: hidden;`); }
      else if (node.overflowDirection === 'HORIZONTAL') { cssRules.push(`overflow-x: auto;`); cssRules.push(`overflow-y: hidden;`); }
      else cssRules.push(`overflow: auto;`);
    } else if ('clipsContent' in node && node.clipsContent) {
      cssRules.push(`overflow: hidden;`);
    }

    // ── Text node ──
    if (isText) {
      cssRules.push(`display: flex;`);
      cssRules.push(`flex-direction: column;`);

      if (node.textAlignVertical === 'CENTER') cssRules.push(`justify-content: center;`);
      else if (node.textAlignVertical === 'BOTTOM') cssRules.push(`justify-content: flex-end;`);
      else cssRules.push(`justify-content: flex-start;`);

      if (node.textAlignHorizontal === 'CENTER') cssRules.push(`text-align: center;`);
      else if (node.textAlignHorizontal === 'RIGHT') cssRules.push(`text-align: right;`);
      else if (node.textAlignHorizontal === 'JUSTIFIED') cssRules.push(`text-align: justify;`);
      else cssRules.push(`text-align: left;`);

      if (node.fontName !== figma.mixed) {
        const family = node.fontName.family;
        const weight = mapFontWeight(node.fontName.style);
        context.fonts.add(family);
        if (opts.designTokens) {
          collectTextToken(family, node.fontSize !== figma.mixed ? node.fontSize : 16, weight, context);
        }
        cssRules.push(`font-family: '${family}', sans-serif;`);
        cssRules.push(`font-weight: ${weight};`);
      }
      if (node.fontSize !== figma.mixed) {
        cssRules.push(opts.fluidTypo && node.fontSize > 14
          ? `font-size: ${fluidFontSize(node.fontSize)};`
          : `font-size: ${node.fontSize}px;`);
      }
      if (node.lineHeight !== figma.mixed) {
        if (node.lineHeight.unit === 'PIXELS') cssRules.push(`line-height: ${node.lineHeight.value}px;`);
        else if (node.lineHeight.unit === 'PERCENT') cssRules.push(`line-height: ${node.lineHeight.value}%;`);
      }

      const textContent = node.characters.replace(/\n/g, '<br>');
      const tag = getSemanticTag(node, context);
      const ariaAttrs = getAriaAttrs(node, context);

      if (externalUrl) {
        html += `<a href="${externalUrl}" target="_blank" rel="noopener noreferrer" class="${className}"${ariaAttrs}>${textContent}</a>\n`;
      } else {
        html += `<${tag} class="${className}"${ariaAttrs}>${textContent}</${tag}>\n`;
      }
    } else {
      // ── Container / Frame ──
      const tag = getSemanticTag(node, context);
      const ariaAttrs = getAriaAttrs(node, context);
      if (externalUrl) {
        html += `<a href="${externalUrl}" target="_blank" rel="noopener noreferrer" class="${className}"${ariaAttrs}>\n`;
      } else {
        html += `<${tag} class="${className}"${ariaAttrs}>\n`;
      }
    }

    // ── Layout ──
    let currentLayoutMode = 'NONE';
    if ('layoutMode' in node && node.layoutMode !== 'NONE') {
      currentLayoutMode = node.layoutMode;
      if (!isText) {
        const useGrid = shouldUseGrid(node, context);
        if (useGrid) {
          const avgWidth = Math.round(
            node.children.filter(c => c.visible).reduce((a, c) => a + c.width, 0) /
            node.children.filter(c => c.visible).length
          );
          cssRules.push(`display: grid;`);
          cssRules.push(`grid-template-columns: repeat(auto-fill, minmax(${avgWidth}px, 1fr));`);
          if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) cssRules.push(`gap: ${node.itemSpacing}px;`);
        } else {
          cssRules.push(`display: flex;`);
          cssRules.push(`flex-direction: ${node.layoutMode === 'HORIZONTAL' ? 'row' : 'column'};`);
          if (node.layoutWrap === 'WRAP') cssRules.push(`flex-wrap: wrap;`);
          if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) cssRules.push(`gap: ${node.itemSpacing}px;`);
        }

        const pt = node.paddingTop !== figma.mixed ? node.paddingTop : 0;
        const pr = node.paddingRight !== figma.mixed ? node.paddingRight : 0;
        const pb = node.paddingBottom !== figma.mixed ? node.paddingBottom : 0;
        const pl = node.paddingLeft !== figma.mixed ? node.paddingLeft : 0;
        if (pt > 0 || pr > 0 || pb > 0 || pl > 0) cssRules.push(`padding: ${pt}px ${pr}px ${pb}px ${pl}px;`);

        if (!useGrid) {
          cssRules.push(`align-items: ${getAlign(node.counterAxisAlignItems)};`);
          cssRules.push(`justify-content: ${getAlign(node.primaryAxisAlignItems)};`);
        }
      }
    }

    // ── Sizing ──
    if (isAbsolute) {
      if ('width' in node) cssRules.push(`width: ${node.width}px;`);
      if ('height' in node) cssRules.push(`height: ${node.height}px;`);
    } else if (parentLayoutMode !== 'NONE') {
      applySizingRules(node, parentLayoutMode, cssRules);
    } else {
      if ('width' in node) cssRules.push(`width: ${node.width}px;`);
      if ('height' in node) cssRules.push(`height: ${node.height}px;`);
    }

    // ── Emit CSS ──
    if (cssRules.length > 0) {
      css += `.${className} {\n  ${cssRules.join('\n  ')}\n}\n`;
    }

    // ── Children ──
    if ('children' in node && !isText) {
      for (const child of node.children) {
        const childResult = await processNode(child, currentLayoutMode, false, context);
        html += childResult.html;
        css += childResult.css;
      }
    }

    // ── Close tag ──
    if (!isText) {
      const tag = getSemanticTag(node, context);
      html += externalUrl ? `</a>\n` : `</${tag}>\n`;
    }

    return { html, css };
  } catch (err) {
    if (err && err.nodeEnriched) throw err;
    try { figma.currentPage.selection = [node]; figma.viewport.scrollAndZoomIntoView([node]); } catch (_e) { /* ignore */ }
    const errorMsg = (err && err.message) ? err.message : String(err);
    const enrichedError = new Error(`[Erreur sur "${node.name}" (${node.type})] ${errorMsg}`);
    enrichedError.nodeEnriched = true;
    throw enrichedError;
  }
}

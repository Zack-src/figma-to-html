/**
 * Main node processor: converts a Figma node tree to HTML + CSS.
 */

import { DEFAULT_OPTIONS } from '../config.js';
import { rgbaToCss } from '../lib/colors.js';
import { getClassName } from '../lib/naming.js';
import { getSemanticTag, getAriaAttrs, getAltText } from '../lib/semantics.js';
import { mapEasingToCss } from '../lib/mappings.js';
import { applySizingRules, needsPositionRelative, getRotationCss } from '../lib/geometry.js';
import { isExportableAsSvg, isPureImageNode } from '../lib/detection.js';

import { collectColorToken, shouldUseGrid } from '../css.js';
import { collectTexts } from '../components.js';
import { processInteractiveGraph } from '../interactive.js';

import { processImageNode, mapScaleMode } from './images.js';
import { processSvgNode } from './svg.js';
import { processTextNode } from './text.js';
import { processLayout } from './layout.js';
import { applyFills, applyStrokes, applyEffects, applyBorderRadius, applyOverflow } from './styles.js';

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

    // ── cursor:pointer on interactive/linked elements ──
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

    // ── Keyframe animations (Smart Animate) ──
    if (opts.keyframeAnim && !isVariantState && hasReactions) {
      for (const react of node.reactions) {
        if (react.action && react.action.transition && react.action.transition.type === 'SMART_ANIMATE') {
          const dur = react.action.transition.duration || 0.3;
          const eas = mapEasingToCss(react.action.transition.easing);
          const animName = 'anim-' + (++context.keyframeCounter);
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
      cssRules.push('position: absolute;');
      cssRules.push('left: ' + left + 'px;');
      cssRules.push('top: ' + top + 'px;');
    } else if (isRoot) {
      cssRules.push('position: relative;');
      cssRules.push('margin: 0 auto;');
    } else if (needsPositionRelative(node)) {
      cssRules.push('position: relative;');
    }

    // ── Rotation ──
    var rotCss = getRotationCss(node);
    if (rotCss) cssRules.push(rotCss);

    // ── Pure image node → <img> tag ──
    const imageResult = await processImageNode(node, parentLayoutMode, cssRules, context, className);
    if (imageResult) return imageResult;

    // ── SVG export ──
    const svgResult = await processSvgNode(node, parentLayoutMode, cssRules, context, className);
    if (svgResult) return svgResult;

    // ── Styles extraction ──
    if ('opacity' in node && node.opacity < 1) {
      cssRules.push('opacity: ' + node.opacity + ';');
    }

    css += await applyFills(node, className, cssRules, context, isText);
    applyStrokes(node, cssRules);
    applyEffects(node, cssRules, isText);
    applyBorderRadius(node, cssRules);
    applyOverflow(node, cssRules);

    // ── Text processing ──
    let textContent = '';
    if (isText) {
      textContent = processTextNode(node, cssRules, context);
    }

    // ── Layout processing ──
    const currentLayoutMode = processLayout(node, cssRules, context, isText);

    // ── Tag opening ──
    const tag = getSemanticTag(node, context);
    const ariaAttrs = getAriaAttrs(node, context);

    if (isText) {
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
      if (externalUrl) {
        html += '<a href="' + externalUrl + '" target="_blank" rel="noopener noreferrer" class="' + className + '"' + ariaAttrs + '>\n';
      } else {
        html += '<' + tag + ' class="' + className + '"' + ariaAttrs + '>\n';
      }
    }

    // ── Sizing (Fallthrough) ──
    if (isAbsolute) {
      if ('width' in node) cssRules.push('width: ' + node.width + 'px;');
      if ('height' in node) cssRules.push('height: ' + node.height + 'px;');
    } else if (parentLayoutMode !== 'NONE') {
      applySizingRules(node, parentLayoutMode, cssRules);
    } else {
      if ('width' in node) cssRules.push('width: ' + node.width + 'px;');
      if ('height' in node) cssRules.push('height: ' + node.height + 'px;');
    }

    // ── CSS Emitting ──
    if (!isText || (isText && tag !== 'input' && tag !== 'textarea')) {
      if (cssRules.length > 0) {
        css += '.' + className + ' {\n  ' + cssRules.join('\n  ') + '\n}\n';
      }
    }

    // ── Children (Recursion) ──
    if ('children' in node && !isText) {
      for (let ci = 0; ci < node.children.length; ci++) {
        const child = node.children[ci];
        const childResult = await processNode(child, currentLayoutMode, false, context);
        html += childResult.html;
        css += childResult.css;
        if (child.layoutPositioning === 'ABSOLUTE' && ci > 0) {
          css += '.' + getClassName(child, context) + ' { z-index: ' + (ci + 1) + '; }\n';
        }
      }
    }

    // ── Close tag ──
    if (!isText) {
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

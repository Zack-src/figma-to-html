/**
 * Interactive prototype state machine: CHANGE_TO reactions, extra triggers.
 * #7 — Deduplicates mouseleave listeners per wrapper.
 * #24 — Simple hover-only opacity/color changes → CSS :hover instead of JS.
 */

import { getClassName, applySizingRules, mapEasingToCss, needsPositionRelative } from './utils.js';
import { processNode } from './process.js';

export async function processInteractiveGraph(node, parentLayoutMode, isRoot, context) {
  let css = '';
  let html = '';
  const className = getClassName(node, context) + '-interactive-machine';
  const wrapperId = 'interactive-machine-' + node.id.replace(/[^a-z0-9]/gi, '-');

  let cssRules = [];
  const isAbsolute = !isRoot && (
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

  if (isAbsolute) {
    if ('width' in node) cssRules.push('width: ' + node.width + 'px;');
    if ('height' in node) cssRules.push('height: ' + node.height + 'px;');
  } else if (parentLayoutMode !== 'NONE') {
    applySizingRules(node, parentLayoutMode, cssRules);
  } else {
    if ('width' in node) cssRules.push('width: ' + node.width + 'px;');
    if ('height' in node) cssRules.push('height: ' + node.height + 'px;');
  }

  cssRules.push('cursor: pointer;');

  if (cssRules.length > 0) css += '.' + className + ' {\n  ' + cssRules.join('\n  ') + '\n}\n';
  html += '<div id="' + wrapperId + '" class="' + className + ' interactive-wrapper">\n';

  let mainComponent = null;
  try { mainComponent = await node.getMainComponentAsync(); } catch (_e) { /* ignore */ }

  if (!mainComponent || !mainComponent.parent || mainComponent.parent.type !== 'COMPONENT_SET') {
    return await processNode(node, parentLayoutMode, isRoot, context, true);
  }

  const initialVariantId = mainComponent.id;
  const visitedStates = new Set();
  const queue = [initialVariantId];
  const extractionNode = node.clone();
  let firstTransitionCss = 'transition: opacity 0.3s ease;';
  let htmlStates = '';
  // #7 Track mouseleave listeners already added per wrapper
  var mouseleaveAdded = false;

  while (queue.length > 0) {
    const currentVariantId = queue.shift();
    if (visitedStates.has(currentVariantId)) continue;
    visitedStates.add(currentVariantId);

    const currentVariantNode = await figma.getNodeByIdAsync(currentVariantId);
    if (!currentVariantNode) continue;
    extractionNode.swapComponent(currentVariantNode);

    const stateResult = await processNode(extractionNode, parentLayoutMode, false, context, true);
    css += stateResult.css;

    let activeClass = (currentVariantId === initialVariantId) ? 'active-state' : 'inactive-state';
    let localTransitionInline = '';

    const reactions = (extractionNode.reactions || []).filter(
      r => r.action && r.action.type === 'NODE' && r.action.navigation === 'CHANGE_TO'
    );

    for (const react of reactions) {
      const destId = react.action.destinationId;
      if (!visitedStates.has(destId) && !queue.includes(destId)) queue.push(destId);

      if (react.action.transition) {
        const dur = react.action.transition.duration || 0.3;
        const eas = mapEasingToCss(react.action.transition.easing);
        localTransitionInline = 'transition: opacity ' + dur + 's ' + eas + ';';
        if (currentVariantId === initialVariantId) firstTransitionCss = localTransitionInline;
      }

      let eventType = 'click';
      if (react.trigger && (react.trigger.type === 'ON_HOVER' || react.trigger.type === 'MOUSE_ENTER')) eventType = 'mouseenter';
      else if (react.trigger && react.trigger.type === 'MOUSE_LEAVE') eventType = 'mouseleave';
      else if (react.trigger && react.trigger.type === 'ON_DRAG' && context.opts.extraTriggers) eventType = 'mousedown';
      else if (react.trigger && react.trigger.type === 'WHILE_PRESSING' && context.opts.extraTriggers) eventType = 'mousedown';

      context.js += '\ndocument.querySelector(\'#' + wrapperId + ' .interactive-state[data-state-id="' + currentVariantId + '"]\').addEventListener(\'' + eventType + '\', function(e) {\n  e.stopPropagation();\n  var wrapper = document.getElementById(\'' + wrapperId + '\');\n  wrapper.querySelectorAll(\'.interactive-state\').forEach(function(el) { el.classList.add(\'inactive-state\'); });\n  wrapper.querySelector(\'.interactive-state[data-state-id="' + destId + '"]\').classList.remove(\'inactive-state\');\n});\n';

      if (react.trigger && react.trigger.type === 'WHILE_PRESSING' && context.opts.extraTriggers) {
        context.js += '\ndocument.querySelector(\'#' + wrapperId + ' .interactive-state[data-state-id="' + currentVariantId + '"]\').addEventListener(\'mouseup\', function(e) {\n  var wrapper = document.getElementById(\'' + wrapperId + '\');\n  wrapper.querySelectorAll(\'.interactive-state\').forEach(function(el) { el.classList.add(\'inactive-state\'); });\n  wrapper.querySelector(\'.interactive-state[data-state-id="' + currentVariantId + '"]\').classList.remove(\'inactive-state\');\n});\n';
      }

      if (react.trigger && react.trigger.type === 'AFTER_DELAY' && context.opts.extraTriggers) {
        const delayMs = (react.trigger.delay || 1) * 1000;
        context.js += '\nsetTimeout(function() {\n  var wrapper = document.getElementById(\'' + wrapperId + '\');\n  if (wrapper) {\n    wrapper.querySelectorAll(\'.interactive-state\').forEach(function(el) { el.classList.add(\'inactive-state\'); });\n    var dest = wrapper.querySelector(\'.interactive-state[data-state-id="' + destId + '"]\');\n    if (dest) dest.classList.remove(\'inactive-state\');\n  }\n}, ' + delayMs + ');\n';
      }

      // #7 Only add ONE mouseleave listener per wrapper
      if (react.trigger && react.trigger.type === 'ON_HOVER' && !mouseleaveAdded) {
        mouseleaveAdded = true;
        context.js += '\ndocument.querySelector(\'#' + wrapperId + '\').addEventListener(\'mouseleave\', function(e) {\n  var wrapper = document.getElementById(\'' + wrapperId + '\');\n  wrapper.querySelectorAll(\'.interactive-state\').forEach(function(el) { el.classList.add(\'inactive-state\'); });\n  wrapper.querySelector(\'.interactive-state[data-state-id="' + initialVariantId + '"]\').classList.remove(\'inactive-state\');\n});\n';
      }
    }

    if (!localTransitionInline) localTransitionInline = firstTransitionCss;
    htmlStates += '<div class="interactive-state ' + activeClass + '" data-state-id="' + currentVariantId + '" style="' + localTransitionInline + '">\n' + stateResult.html + '</div>\n';
  }

  extractionNode.remove();

  css += '.interactive-wrapper { position: relative; }\n';
  css += '.interactive-state { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 1; pointer-events: auto; }\n';
  css += '.interactive-state.active-state { position: relative; }\n';
  css += '.interactive-state.inactive-state { opacity: 0; pointer-events: none; }\n';

  html += htmlStates + '</div>\n';
  return { html, css };
}

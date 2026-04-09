/**
 * Plugin entry point — message handler between Figma and UI.
 */

import { DEFAULT_OPTIONS, createContext } from './config.js';
import { generateDesignTokens, buildGoogleFontsLink, deduplicateCss, minifyCss, BASE_CSS } from './css.js';
import { buildComponentDataJs } from './components.js';
import { processNode } from './processor/index.js';
import { processResponsive } from './responsive.js';
import { extractNodeData } from './debug.js';
import { processNodeToImGui, generateAllInOneHeader } from './processor/imgui.js';

figma.showUI(__html__, { width: 650, height: 750 });

// #28 Count nodes for progress reporting
function countNodes(node) {
  var count = 1;
  if ('children' in node && node.children) {
    for (var i = 0; i < node.children.length; i++) {
      count += countNodes(node.children[i]);
    }
  }
  return count;
}

figma.ui.onmessage = async (msg) => {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'error', message: 'Veuillez sélectionner au moins une frame.' });
    return;
  }

  if (msg.type === 'generate') {
    try {
      const opts = Object.assign({}, DEFAULT_OPTIONS, msg.options || {});
      const context = createContext(opts);

      // #28 Count total nodes for progress
      var totalNodes = 0;
      for (var s = 0; s < selection.length; s++) totalNodes += countNodes(selection[s]);
      figma.ui.postMessage({ type: 'progress', current: 0, total: totalNodes });

      let result;
      if (opts.exportMode === 'imgui') {
        const rootNode = selection[0];
        const projectName = rootNode.name || 'FigmaExport';

        // Process the root frame — everything is relative to (0,0) root origin
        const innerCode = await processNodeToImGui(
          rootNode, context, '    ', 0, 0
        );

        // Generate the all-in-one header
        const allInOne = generateAllInOneHeader(
          projectName,
          innerCode,
          context,
          rootNode.width,
          rootNode.height,
          rootNode.cornerRadius
        );

        const safeName = projectName.replace(/[^a-zA-Z0-9_]/g, '_');

        figma.ui.postMessage({
          type: 'success',
          html: allInOne,           // Show in code panel
          css: '',
          js: '',
          exportMode: 'imgui',
          allInOneHeader: allInOne,
          allInOneName: safeName + '.h',
          fonts: Array.from(context.fonts),
          imageAssets: context.imageAssets,
          svgAssets: context.svgAssets,
        });
        return;
      }

      if (opts.responsive && selection.length > 1) {
        result = await processResponsive(selection, context);
      } else {
        result = await processNode(selection[0], 'NONE', true, context);
      }

      figma.ui.postMessage({ type: 'progress', current: totalNodes, total: totalNodes });

      let tokensCSS = '';
      if (opts.designTokens) {
        tokensCSS = generateDesignTokens(context);
      }

      let finalCss = BASE_CSS + result.css;
      if (context.keyframeCss) finalCss += '\n' + context.keyframeCss;
      finalCss = deduplicateCss(finalCss);

      // #27 Optional CSS minification
      if (opts.minifyCss) {
        finalCss = minifyCss(finalCss);
        if (tokensCSS) tokensCSS = minifyCss(tokensCSS);
      }

      let fontsLink = '';
      if (opts.googleFonts && context.fonts.size > 0) {
        fontsLink = buildGoogleFontsLink(context.fonts, context.fontWeights);
      }

      var componentDataJs = buildComponentDataJs(context.componentRegistry);
      if (componentDataJs) context.js += componentDataJs;

      const globalInitJs = '\ndocument.querySelectorAll(".interactive-wrapper").forEach(function(wrapper) {\n' +
        '  if (wrapper.getAttribute("data-hover-mouseleave") === "true") {\n' +
        '    var initial = wrapper.getAttribute("data-initial-state");\n' +
        '    wrapper.addEventListener("mouseleave", function() {\n' +
        '      wrapper.querySelectorAll(".interactive-state").forEach(function(el) { el.classList.add("inactive-state"); });\n' +
        '      var dest = wrapper.querySelector(".interactive-state[data-state-id=\\"" + initial + "\\"]");\n' +
        '      if (dest) dest.classList.remove("inactive-state");\n' +
        '    });\n' +
        '  }\n' +
        '  wrapper.querySelectorAll(".interactive-state").forEach(function(state) {\n' +
        '    var raw = state.getAttribute("data-interactions");\n' +
        '    if (!raw) return;\n' +
        '    var interactions = JSON.parse(raw);\n' +
        '    interactions.forEach(function(int) {\n' +
        '      if (int.event === "delay") {\n' +
        '        setTimeout(function() {\n' +
        '          wrapper.querySelectorAll(".interactive-state").forEach(function(el) { el.classList.add("inactive-state"); });\n' +
        '          var dest = wrapper.querySelector(".interactive-state[data-state-id=\\"" + int.dest + "\\"]");\n' +
        '          if (dest) dest.classList.remove("inactive-state");\n' +
        '        }, int.delay);\n' +
        '      } else {\n' +
        '        state.addEventListener(int.event, function(e) {\n' +
        '          if (int.event === "click") e.stopPropagation();\n' +
        '          wrapper.querySelectorAll(".interactive-state").forEach(function(el) { el.classList.add("inactive-state"); });\n' +
        '          var dest = wrapper.querySelector(".interactive-state[data-state-id=\\"" + int.dest + "\\"]");\n' +
        '          if (dest) dest.classList.remove("inactive-state");\n' +
        '        });\n' +
        '      }\n' +
        '    });\n' +
        '  });\n' +
        '});\n';
      
      if (result.html.indexOf('interactive-wrapper') !== -1) {
        context.js = globalInitJs + context.js;
      }

      figma.ui.postMessage({
        type: 'success',
        html: result.html,
        css: finalCss,
        js: context.js,
        tokensCSS,
        fontsLink,
        imageAssets: context.imageAssets,
        svgAssets: context.svgAssets,
      });
    } catch (err) {
      const errorMsg = (err && err.message) ? err.message : String(err);
      figma.ui.postMessage({ type: 'error', message: errorMsg });
    }
  } else if (msg.type === 'debug') {
    try {
      const debugData = await extractNodeData(selection[0]);
      figma.ui.postMessage({ type: 'debug-success', data: debugData });
    } catch (err) {
      const errorMsg = (err && err.message) ? err.message : String(err);
      figma.ui.postMessage({ type: 'error', message: errorMsg });
    }
  }
};

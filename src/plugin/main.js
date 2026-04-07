/**
 * Plugin entry point — message handler between Figma and UI.
 */

import { DEFAULT_OPTIONS, createContext } from './config.js';
import { generateDesignTokens, buildGoogleFontsLink, deduplicateCss, minifyCss, BASE_CSS } from './css.js';
import { buildComponentDataJs } from './components.js';
import { processNode } from './processor/index.js';
import { processResponsive } from './responsive.js';
import { extractNodeData } from './debug.js';

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

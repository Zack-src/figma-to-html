/**
 * Plugin entry point — message handler between Figma and UI.
 */

import { DEFAULT_OPTIONS, createContext } from './config.js';
import { generateDesignTokens, buildGoogleFontsLink, deduplicateCss, BASE_CSS } from './css.js';
import { buildComponentDataJs } from './components.js';
import { processNode } from './process.js';
import { processResponsive } from './responsive.js';
import { extractNodeData } from './debug.js';

figma.showUI(__html__, { width: 650, height: 750 });

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

      let result;
      if (opts.responsive && selection.length > 1) {
        result = await processResponsive(selection, context);
      } else {
        result = await processNode(selection[0], 'NONE', true, context);
      }

      let tokensCSS = '';
      if (opts.designTokens) {
        tokensCSS = generateDesignTokens(context);
      }

      let finalCss = BASE_CSS + result.css;
      if (context.keyframeCss) finalCss += '\n' + context.keyframeCss;
      finalCss = deduplicateCss(finalCss);

      let fontsLink = '';
      if (opts.googleFonts && context.fonts.size > 0) {
        fontsLink = buildGoogleFontsLink(context.fonts);
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

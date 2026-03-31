/**
 * Default plugin options.
 * Merged with user-selected options from the UI.
 */
export const DEFAULT_OPTIONS = {
  cleanCode: true,
  designTokens: true,
  semanticHtml: true,
  cssGrid: false,
  imageFormat: 'webp',
  googleFonts: true,
  svgMode: 'inline',
  responsive: false,
  fluidTypo: false,
  externalLinks: true,
  keyframeAnim: false,
  extraTriggers: false,
  ariaRoles: true,
  altText: true,
  minifyCss: false,
};

/**
 * Creates a fresh generation context shared across all processing functions.
 */
export function createContext(opts) {
  return {
    js: '',
    opts,
    fonts: new Set(),
    fontWeights: new Map(),
    colors: new Map(),
    textStyles: new Map(),
    imageAssets: [],
    svgAssets: [],
    imageCounter: 0,
    svgCounter: 0,
    classNameMap: new Map(),
    classNameCounters: new Map(),
    keyframeCounter: 0,
    keyframeCss: '',
    svgCache: new Map(),
    imageCache: new Map(),
    componentRegistry: new Map(),
    nodeCount: 0,
    processedCount: 0,
  };
}

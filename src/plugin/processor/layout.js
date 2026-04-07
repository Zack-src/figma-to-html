import { getAlign } from '../lib/mappings.js';
import { shouldUseGrid } from '../css.js';

/**
 * Layout processing (Flex, Grid).
 */

export function processLayout(node, cssRules, context, isText) {
  let currentLayoutMode = 'NONE';
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    currentLayoutMode = node.layoutMode;
    if (!isText) {
      const useGrid = shouldUseGrid(node, context);
      if (useGrid) {
        const visibleKids = node.children.filter(c => c.visible);
        if (visibleKids.length > 0) {
          const avgWidth = Math.round(visibleKids.reduce((a, c) => a + c.width, 0) / visibleKids.length);
          cssRules.push('display: grid;');
          cssRules.push('grid-template-columns: repeat(auto-fill, minmax(' + avgWidth + 'px, 1fr));');
          if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) cssRules.push('column-gap: ' + node.itemSpacing + 'px;');
          if ('counterAxisSpacing' in node && node.counterAxisSpacing !== figma.mixed && node.counterAxisSpacing > 0) {
            cssRules.push('row-gap: ' + node.counterAxisSpacing + 'px;');
          } else if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) {
            cssRules.push('row-gap: ' + node.itemSpacing + 'px;');
          }
        }
      } else {
        cssRules.push('display: flex;');
        cssRules.push('flex-direction: ' + (node.layoutMode === 'HORIZONTAL' ? 'row' : 'column') + ';');
        if (node.layoutWrap === 'WRAP') cssRules.push('flex-wrap: wrap;');

        const hasCounter = 'counterAxisSpacing' in node && node.counterAxisSpacing !== figma.mixed && node.counterAxisSpacing > 0;
        const mainGap = (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) ? node.itemSpacing : 0;
        const counterGap = hasCounter ? node.counterAxisSpacing : 0;

        if (mainGap > 0 && counterGap > 0) {
          if (mainGap === counterGap) {
            cssRules.push('gap: ' + mainGap + 'px;');
          } else {
            // Flex direction aware shorthand
            if (node.layoutMode === 'HORIZONTAL') {
              cssRules.push('gap: ' + counterGap + 'px ' + mainGap + 'px;');
            } else {
              cssRules.push('gap: ' + mainGap + 'px ' + counterGap + 'px;');
            }
          }
        } else if (mainGap > 0) {
          cssRules.push('gap: ' + mainGap + 'px;');
        } else if (counterGap > 0) {
          cssRules.push('gap: ' + counterGap + 'px;');
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
  return currentLayoutMode;
}

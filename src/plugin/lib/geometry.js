/**
 * Geometry and layout sizing utilities.
 */

export function getRotationCss(node) {
  // First try the explicit rotation property
  if ('rotation' in node && node.rotation !== 0) {
    return 'transform: rotate(' + (-node.rotation) + 'deg);';
  }
  // Fallback: extract rotation from relativeTransform matrix
  if ('relativeTransform' in node) {
    try {
      var m = node.relativeTransform;
      var angle = Math.atan2(m[1][0], m[0][0]) * (180 / Math.PI);
      if (Math.abs(angle) > 0.1) {
        return 'transform: rotate(' + angle.toFixed(2) + 'deg);';
      }
    } catch (_e) { /* ignore */ }
  }
  return null;
}

export function applySizingRules(node, parentLayoutMode, cssRules) {
  if ('layoutSizingHorizontal' in node) {
    if (node.layoutSizingHorizontal === 'FILL') {
      if (parentLayoutMode === 'HORIZONTAL') {
        cssRules.push('flex: 1 1 0px;');
        cssRules.push('min-width: 0;');
      } else {
        cssRules.push('align-self: stretch;');
        cssRules.push('width: 100%;');
      }
    } else if (node.layoutSizingHorizontal === 'FIXED') {
      cssRules.push(`width: ${node.width}px;`);
      if (parentLayoutMode === 'HORIZONTAL') cssRules.push('flex-shrink: 0;');
    } else if (node.layoutSizingHorizontal === 'HUG') {
      cssRules.push('width: max-content;');
      if (parentLayoutMode === 'HORIZONTAL') cssRules.push('flex-shrink: 0;');
    }
  } else if ('width' in node) {
    cssRules.push(`width: ${node.width}px;`);
  }

  if ('layoutSizingVertical' in node) {
    if (node.layoutSizingVertical === 'FILL') {
      if (parentLayoutMode === 'VERTICAL') {
        cssRules.push('flex: 1 1 0px;');
        cssRules.push('min-height: 0;');
      } else {
        cssRules.push('align-self: stretch;');
        cssRules.push('height: 100%;');
      }
    } else if (node.layoutSizingVertical === 'FIXED') {
      cssRules.push(`height: ${node.height}px;`);
      if (parentLayoutMode === 'VERTICAL') cssRules.push('flex-shrink: 0;');
    } else if (node.layoutSizingVertical === 'HUG') {
      cssRules.push('height: max-content;');
      if (parentLayoutMode === 'VERTICAL') cssRules.push('flex-shrink: 0;');
    }
  } else if ('height' in node) {
    cssRules.push(`height: ${node.height}px;`);
  }
}

export function needsPositionRelative(node) {
  if ('children' in node && node.children) {
    for (const child of node.children) {
      if (child.layoutPositioning === 'ABSOLUTE') return true;
    }
  }
  if ('children' in node && node.children && node.children.length > 0) {
    if (!('layoutMode' in node) || node.layoutMode === 'NONE') {
      if (node.type !== 'PAGE' && node.type !== 'DOCUMENT') return true;
    }
  }
  return false;
}

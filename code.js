figma.showUI(__html__, { width: 600, height: 700 });

figma.ui.onmessage = async (msg) => {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'error', message: 'Veuillez sélectionner au moins une frame.' });
    return;
  }

  if (msg.type === 'generate') {
    try {
      const context = {
        js: ''
      };

      const result = await processNode(selection[0], 'NONE', true, context);
      const finalCss = `
        *{
          box-sizing: border-box;
        }
          
        body {
          margin: 0;
          padding: 20px;
          background-color: #f5f5f5;
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }
        
        div, p {
          margin: 0;
        }
        
        svg {
          display: block;
          width: 100%;
          height: 100%;
        }
      ` + result.css;

      figma.ui.postMessage({
        type: 'success',
        html: result.html,
        css: finalCss,
        js: context.js
      });
    } catch (err) {
      figma.ui.postMessage({ type: 'error', message: err.message });
    }
  } else if (msg.type === 'debug') {
    try {
      const debugData = await extractNodeData(selection[0]);
      figma.ui.postMessage({
        type: 'debug-success',
        data: debugData
      });
    } catch (err) {
      figma.ui.postMessage({ type: 'error', message: err.message });
    }
  }
};

async function extractNodeData(node) {
  const safeKeys = [
    'id',
    'name',
    'type',
    'x', 'y',
    'width', 'height',
    'rotation',
    'layoutMode',
    'layoutPositioning',
    'primaryAxisAlignItems',
    'counterAxisAlignItems',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'itemSpacing',
    'layoutSizingHorizontal', 'layoutSizingVertical', 'layoutWrap',
    'opacity',
    'cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius',
    'fills',
    'strokes', 'strokeWeight',
    'effects',
    'fontName', 'fontSize',
    'characters',
    'textAlignHorizontal',
    'textAlignVertical',
    'lineHeight',
    'componentProperties',
    'variantProperties',
    'clipsContent',
    'overflowDirection',
    'reactions'
  ];

  let obj = {};

  if (node.parent) {
    obj.parentType = node.parent.type;
    if ('layoutMode' in node.parent) {
      obj.parentLayoutMode = node.parent.layoutMode;
    }
  }

  if (node.type === 'INSTANCE') {
    try {
      const mainComp = await node.getMainComponentAsync();
      if (mainComp) {
        obj.mainComponentId = mainComp.id;
        obj.mainComponentName = mainComp.name;
      }
    } catch (e) { }
  }

  for (const key of safeKeys) {
    if (key in node) {
      try {
        if (node[key] === figma.mixed) {
          obj[key] = "mixed";
        } else if (key === 'fills' || key === 'strokes' || key === 'effects') {
          obj[key] = JSON.parse(JSON.stringify(node[key]));
        } else {
          obj[key] = node[key];
        }
      } catch (e) { }
    }
  }

  if ('children' in node && node.children.length > 0) {
    obj.children = await Promise.all(node.children.map(extractNodeData));
  }

  return obj;
}

function rgbaToCss(color, opacity = 1) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = ('a' in color ? color.a : 1) * opacity;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function getClassName(node) {
  let name = node.name.toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!name || /^[0-9]/.test(name)) {
    name = 'n-' + (name || 'node');
  }

  return name + '-' + node.id.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

function mapEasingToCss(easing) {
  if (!easing) return 'ease';
  switch (easing.type) {
    case 'LINEAR': return 'linear';
    case 'EASE_IN': return 'ease-in';
    case 'EASE_OUT': return 'ease-out';
    case 'EASE_IN_AND_OUT': return 'ease-in-out';
    case 'EASE_IN_BACK': return 'cubic-bezier(0.36, 0, 0.66, -0.56)';
    case 'EASE_OUT_BACK': return 'cubic-bezier(0.34, 1.56, 0.64, 1)';
    case 'EASE_IN_AND_OUT_BACK': return 'cubic-bezier(0.68, -0.6, 0.32, 1.6)';
    case 'CUSTOM_CUBIC_BEZIER':
      if (easing.easingFunctionCubicBezier) {
        const { x1, y1, x2, y2 } = easing.easingFunctionCubicBezier;
        return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
      }
      return 'ease';
    default: return 'ease';
  }
}

function mapFontWeight(style) {
  const s = style.toLowerCase();
  if (s.includes('thin') || s.includes('hairline')) return '100';
  if (s.includes('extralight') || s.includes('ultralight')) return '200';
  if (s.includes('light')) return '300';
  if (s.includes('medium')) return '500';
  if (s.includes('semibold') || s.includes('demibold')) return '600';
  if (s.includes('bold')) return '700';
  if (s.includes('extrabold') || s.includes('ultrabold')) return '800';
  if (s.includes('black') || s.includes('heavy')) return '900';
  return '400';
}

function getAlign(align) {
  switch (align) {
    case 'MIN': return 'flex-start';
    case 'CENTER': return 'center';
    case 'MAX': return 'flex-end';
    case 'SPACE_BETWEEN': return 'space-between';
    default: return 'flex-start';
  }
}

function applySizingRules(node, parentLayoutMode, cssRules) {
  if ('layoutSizingHorizontal' in node) {
    if (node.layoutSizingHorizontal === 'FILL') {
      if (parentLayoutMode === 'HORIZONTAL') {
        cssRules.push(`flex: 1 1 0px;`);
        cssRules.push(`min-width: 0;`);
      } else {
        cssRules.push(`align-self: stretch;`);
        cssRules.push(`width: 100%;`);
      }
    } else if (node.layoutSizingHorizontal === 'FIXED') {
      cssRules.push(`width: ${node.width}px;`);
      if (parentLayoutMode === 'HORIZONTAL') cssRules.push(`flex-shrink: 0;`);
    } else if (node.layoutSizingHorizontal === 'HUG') {
      cssRules.push(`width: max-content;`);
      if (parentLayoutMode === 'HORIZONTAL') cssRules.push(`flex-shrink: 0;`);
    }
  } else if ('width' in node) {
    cssRules.push(`width: ${node.width}px;`);
  }

  if ('layoutSizingVertical' in node) {
    if (node.layoutSizingVertical === 'FILL') {
      if (parentLayoutMode === 'VERTICAL') {
        cssRules.push(`flex: 1 1 0px;`);
        cssRules.push(`min-height: 0;`);
      } else {
        cssRules.push(`align-self: stretch;`);
        cssRules.push(`height: 100%;`);
      }
    } else if (node.layoutSizingVertical === 'FIXED') {
      cssRules.push(`height: ${node.height}px;`);
      if (parentLayoutMode === 'VERTICAL') cssRules.push(`flex-shrink: 0;`);
    } else if (node.layoutSizingVertical === 'HUG') {
      cssRules.push(`height: max-content;`);
      if (parentLayoutMode === 'VERTICAL') cssRules.push(`flex-shrink: 0;`);
    }
  } else if ('height' in node) {
    cssRules.push(`height: ${node.height}px;`);
  }
}

function isExportableAsSvg(node) {
  const vectorTypes = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'LINE'];
  if (vectorTypes.includes(node.type)) return true;

  if (['COMPONENT', 'INSTANCE', 'GROUP'].includes(node.type)) {
    let hasOnlyShapes = true;
    let hasAnyShapes = false;

    function checkShapes(n) {
      if (!n.children || n.children.length === 0) {
        hasOnlyShapes = false;
        return;
      }
      for (const child of n.children) {
        if (vectorTypes.includes(child.type)) {
          hasAnyShapes = true;
        } else if (['GROUP', 'BOOLEAN_OPERATION', 'COMPONENT', 'INSTANCE'].includes(child.type)) {
          checkShapes(child);
        } else {
          hasOnlyShapes = false;
        }
      }
    }

    checkShapes(node);
    return hasOnlyShapes && hasAnyShapes;
  }
  return false;
}

async function processInteractiveGraph(node, parentLayoutMode, isRoot, context) {
  let css = '';
  let html = '';
  const className = getClassName(node) + '-interactive-machine';
  const wrapperId = 'interactive-machine-' + node.id.replace(/[^a-z0-9]/gi, '-');

  let cssRules = [];
  const isAbsolute = !isRoot && (node.layoutPositioning === 'ABSOLUTE' || (parentLayoutMode === 'NONE' && node.parent && node.parent.type !== 'PAGE' && node.parent.type !== 'DOCUMENT'));

  if (isAbsolute) {
    let left = node.x;
    let top = node.y;
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

  if (isAbsolute) {
    if ('width' in node) cssRules.push(`width: ${node.width}px;`);
    if ('height' in node) cssRules.push(`height: ${node.height}px;`);
  } else if (parentLayoutMode !== 'NONE') {
    applySizingRules(node, parentLayoutMode, cssRules);
  } else {
    if ('width' in node) cssRules.push(`width: ${node.width}px;`);
    if ('height' in node) cssRules.push(`height: ${node.height}px;`);
  }

  if (cssRules.length > 0) {
    css += `.${className} {\n  ${cssRules.join('\n  ')}\n}\n`;
  }

  html += `<div id="${wrapperId}" class="${className} interactive-wrapper">\n`;

  let mainComponent = null;
  try {
    mainComponent = await node.getMainComponentAsync();
  } catch (e) { }

  if (!mainComponent || !mainComponent.parent || mainComponent.parent.type !== 'COMPONENT_SET') {
    return await processNode(node, parentLayoutMode, isRoot, context, true); // Fallback
  }

  const initialVariantId = mainComponent.id;
  const visitedStates = new Set();
  const queue = [initialVariantId];

  const extractionNode = node.clone();

  let firstTransitionCss = `transition: opacity 0.3s ease;`;
  let htmlStates = '';

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

    const stateChangeToReactions = (extractionNode.reactions || []).filter(r => r.action && r.action.type === 'NODE' && r.action.navigation === 'CHANGE_TO');

    for (const react of stateChangeToReactions) {
      const destId = react.action.destinationId;
      if (!visitedStates.has(destId) && !queue.includes(destId)) {
        queue.push(destId);
      }
      if (react.action.transition) {
        const dur = react.action.transition.duration || 0.3;
        const eas = mapEasingToCss(react.action.transition.easing);
        localTransitionInline = `transition: opacity ${dur}s ${eas};`;
        if (currentVariantId === initialVariantId) firstTransitionCss = localTransitionInline;
      }

      let eventType = 'click';
      if (react.trigger.type === 'ON_HOVER' || react.trigger.type === 'MOUSE_ENTER') eventType = 'mouseenter';
      else if (react.trigger.type === 'MOUSE_LEAVE') eventType = 'mouseleave';

      context.js += `
document.querySelector('#${wrapperId} .interactive-state[data-state-id="${currentVariantId}"]').addEventListener('${eventType}', function(e) {
  e.stopPropagation();
  const wrapper = document.getElementById('${wrapperId}');
  wrapper.querySelectorAll('.interactive-state').forEach(el => el.classList.add('inactive-state'));
  wrapper.querySelector('.interactive-state[data-state-id="${destId}"]').classList.remove('inactive-state');
});\n`;

      if (react.trigger.type === 'ON_HOVER') {
        context.js += `
document.querySelector('#${wrapperId}').addEventListener('mouseleave', function(e) {
  const wrapper = document.getElementById('${wrapperId}');
  wrapper.querySelectorAll('.interactive-state').forEach(el => el.classList.add('inactive-state'));
  wrapper.querySelector('.interactive-state[data-state-id="${currentVariantId}"]').classList.remove('inactive-state');
});\n`;
      }
    }

    if (!localTransitionInline) localTransitionInline = firstTransitionCss;
    htmlStates += `<div class="interactive-state ${activeClass}" data-state-id="${currentVariantId}" style="${localTransitionInline}">\n${stateResult.html}</div>\n`;
  }

  extractionNode.remove();

  css += `.interactive-wrapper { position: relative; }\n`;
  css += `.interactive-state { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 1; pointer-events: auto; }\n`;
  css += `.interactive-state.active-state { position: relative; }\n`;
  css += `.interactive-state.inactive-state { opacity: 0; pointer-events: none; }\n`;

  html += htmlStates + `</div>\n`;

  return { html, css };
}

async function processNode(node, parentLayoutMode = 'NONE', isRoot = false, context = { js: '' }, isVariantState = false) {
  if (!node.visible) return { html: '', css: '' };

  console.log(`[Plugin] Processing node: ${node.name} (ID: ${node.id}, Type: ${node.type})`);

  let html = '';
  let css = '';
  const className = getClassName(node);
  let cssRules = [];
  const isText = node.type === 'TEXT';

  // --- GESTION DES INTERACTIONS (PROTOTYPE) ---
  if (!isVariantState && node.type === 'INSTANCE' && node.reactions && node.reactions.length > 0) {
    const hasChangeTo = node.reactions.some(r => r.action && r.action.type === 'NODE' && r.action.navigation === 'CHANGE_TO');
    if (hasChangeTo) {
      return await processInteractiveGraph(node, parentLayoutMode, isRoot, context);
    }
  }

  const isAbsolute = !isRoot && !isVariantState && (node.layoutPositioning === 'ABSOLUTE' || (parentLayoutMode === 'NONE' && node.parent && node.parent.type !== 'PAGE' && node.parent.type !== 'DOCUMENT'));

  if (isAbsolute) {
    let left = node.x;
    let top = node.y;

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

  if (isExportableAsSvg(node)) {
    console.log(`[Plugin] Exporting SVG for: ${node.name}`);
    const svgStart = Date.now();
    const svgBytes = await node.exportAsync({ format: 'SVG' });
    console.log(`[Plugin] SVG export finished in ${Date.now() - svgStart}ms`);

    const svgString = String.fromCharCode.apply(null, Array.from(new Uint8Array(svgBytes)));

    if (isAbsolute) {
      if ('width' in node) cssRules.push(`width: ${node.width}px;`);
      if ('height' in node) cssRules.push(`height: ${node.height}px;`);
    } else if (parentLayoutMode !== 'NONE') {
      applySizingRules(node, parentLayoutMode, cssRules);
    } else {
      if ('width' in node) cssRules.push(`width: ${node.width}px;`);
      if ('height' in node) cssRules.push(`height: ${node.height}px;`);
    }

    if (cssRules.length > 0) {
      css += `.${className} {\n  ${cssRules.join('\n  ')}\n}\n`;
    }
    return { html: `<div class="${className}">${svgString}</div>\n`, css };
  }

  if ('opacity' in node && node.opacity < 1) {
    cssRules.push(`opacity: ${node.opacity};`);
  }

  if ('fills' in node && Array.isArray(node.fills)) {
    const visibleFills = node.fills.filter(f => f.visible !== false);

    const imageFill = visibleFills.find(f => f.type === 'IMAGE');
    const gradientFill = visibleFills.find(f => f.type === 'GRADIENT_LINEAR');
    const solidFill = visibleFills.filter(f => f.type === 'SOLID').pop();

    if (imageFill && imageFill.imageHash) {
      console.log(`[Plugin] Fetching image bytes for hash: ${imageFill.imageHash}`);
      const imgStart = Date.now();
      const image = figma.getImageByHash(imageFill.imageHash);
      if (image) {
        const bytes = await image.getBytesAsync();
        const base64 = figma.base64Encode(bytes);
        cssRules.push(`background-image: url('data:image/png;base64,${base64}');`);
        cssRules.push(`background-size: cover;`);
        cssRules.push(`background-position: center;`);
        console.log(`[Plugin] Image fetched & encoded in ${Date.now() - imgStart}ms`);
      }
    } else if (gradientFill) {
      const t = gradientFill.gradientTransform;
      const angleRad = Math.atan2(t[1][0], t[0][0]);
      const angleDeg = Math.round(angleRad * (180 / Math.PI));
      const stops = gradientFill.gradientStops.map(stop => {
        return `${rgbaToCss(stop.color)} ${Math.round(stop.position * 100)}%`;
      }).join(', ');

      const gradientCss = `linear-gradient(${angleDeg + 90}deg, ${stops})`;
      if (isText) {
        cssRules.push(`background: ${gradientCss};`);
        cssRules.push(`-webkit-background-clip: text;`);
        cssRules.push(`-webkit-text-fill-color: transparent;`);
      } else {
        cssRules.push(`background: ${gradientCss};`);
      }
    } else if (solidFill) {
      if (isText) {
        cssRules.push(`color: ${rgbaToCss(solidFill.color, solidFill.opacity)};`);
      } else {
        cssRules.push(`background-color: ${rgbaToCss(solidFill.color, solidFill.opacity)};`);
      }
    }
  }

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
    if (isText && textShadows.length > 0) {
      cssRules.push(`text-shadow: ${textShadows.join(', ')};`);
    } else if (!isText && shadows.length > 0) {
      cssRules.push(`box-shadow: ${shadows.join(', ')};`);
    }
  }

  if ('cornerRadius' in node && node.cornerRadius !== figma.mixed && node.cornerRadius > 0) {
    cssRules.push(`border-radius: ${node.cornerRadius}px;`);
  } else if ('topLeftRadius' in node) {
    cssRules.push(`border-radius: ${node.topLeftRadius}px ${node.topRightRadius}px ${node.bottomRightRadius}px ${node.bottomLeftRadius}px;`);
  }

  if ('overflowDirection' in node && node.overflowDirection !== 'NONE') {
    if (node.overflowDirection === 'VERTICAL') {
      cssRules.push(`overflow-y: auto;`);
      cssRules.push(`overflow-x: hidden;`);
    } else if (node.overflowDirection === 'HORIZONTAL') {
      cssRules.push(`overflow-x: auto;`);
      cssRules.push(`overflow-y: hidden;`);
    } else {
      cssRules.push(`overflow: auto;`);
    }
  } else if ('clipsContent' in node && node.clipsContent) {
    cssRules.push(`overflow: hidden;`);
  }

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
      cssRules.push(`font-family: '${node.fontName.family}', sans-serif;`);
      cssRules.push(`font-weight: ${mapFontWeight(node.fontName.style)};`);
    }
    if (node.fontSize !== figma.mixed) {
      cssRules.push(`font-size: ${node.fontSize}px;`);
    }

    if (node.lineHeight !== figma.mixed) {
      if (node.lineHeight.unit === 'PIXELS') {
        cssRules.push(`line-height: ${node.lineHeight.value}px;`);
      } else if (node.lineHeight.unit === 'PERCENT') {
        cssRules.push(`line-height: ${node.lineHeight.value}%;`);
      }
    }

    html += `<div class="${className}">${node.characters.replace(/\n/g, '<br>')}</div>\n`;
  } else {
    html += `<div class="${className}">\n`;
  }

  let currentLayoutMode = 'NONE';
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    currentLayoutMode = node.layoutMode;
    if (!isText) {
      cssRules.push(`display: flex;`);
      cssRules.push(`flex-direction: ${node.layoutMode === 'HORIZONTAL' ? 'row' : 'column'};`);
      if (node.layoutWrap === 'WRAP') cssRules.push(`flex-wrap: wrap;`);

      if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) {
        cssRules.push(`gap: ${node.itemSpacing}px;`);
      }

      const pt = node.paddingTop !== figma.mixed ? node.paddingTop : 0;
      const pr = node.paddingRight !== figma.mixed ? node.paddingRight : 0;
      const pb = node.paddingBottom !== figma.mixed ? node.paddingBottom : 0;
      const pl = node.paddingLeft !== figma.mixed ? node.paddingLeft : 0;
      if (pt > 0 || pr > 0 || pb > 0 || pl > 0) {
        cssRules.push(`padding: ${pt}px ${pr}px ${pb}px ${pl}px;`);
      }

      cssRules.push(`align-items: ${getAlign(node.counterAxisAlignItems)};`);
      cssRules.push(`justify-content: ${getAlign(node.primaryAxisAlignItems)};`);
    }
  }

  if (isAbsolute) {
    if ('width' in node) cssRules.push(`width: ${node.width}px;`);
    if ('height' in node) cssRules.push(`height: ${node.height}px;`);
  } else if (parentLayoutMode !== 'NONE') {
    applySizingRules(node, parentLayoutMode, cssRules);
  } else {
    if ('width' in node) cssRules.push(`width: ${node.width}px;`);
    if ('height' in node) cssRules.push(`height: ${node.height}px;`);
  }

  if (cssRules.length > 0) {
    css += `.${className} {\n  ${cssRules.join('\n  ')}\n}\n`;
  }

  if ('children' in node && !isText) {
    for (const child of node.children) {
      const childResult = await processNode(child, currentLayoutMode, false, context);
      html += childResult.html;
      css += childResult.css;
    }
  }

  if (!isText) {
    html += `</div>\n`;
  }

  return { html, css };
}
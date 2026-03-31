/**
 * Debug: extract raw node data for inspection.
 */

export async function extractNodeData(node) {
  try {
    const safeKeys = [
      'id', 'name', 'type', 'x', 'y', 'width', 'height', 'rotation',
      'layoutMode', 'layoutPositioning',
      'primaryAxisAlignItems', 'counterAxisAlignItems',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'itemSpacing', 'layoutSizingHorizontal', 'layoutSizingVertical', 'layoutWrap',
      'opacity',
      'cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius',
      'fills', 'strokes', 'strokeWeight', 'effects',
      'fontName', 'fontSize', 'characters',
      'textAlignHorizontal', 'textAlignVertical', 'lineHeight',
      'componentProperties', 'variantProperties',
      'clipsContent', 'overflowDirection', 'reactions', 'relativeTransform',
    ];
    const obj = {};

    if (node.parent) {
      obj.parentType = node.parent.type;
      if ('layoutMode' in node.parent) obj.parentLayoutMode = node.parent.layoutMode;
    }
    if (node.type === 'INSTANCE') {
      try {
        const mainComp = await node.getMainComponentAsync();
        if (mainComp) {
          obj.mainComponentId = mainComp.id;
          obj.mainComponentName = mainComp.name;
        }
      } catch (_e) { /* ignore */ }
    }

    for (const key of safeKeys) {
      if (key in node) {
        try {
          if (node[key] === figma.mixed) obj[key] = 'mixed';
          else if (key === 'fills' || key === 'strokes' || key === 'effects') obj[key] = JSON.parse(JSON.stringify(node[key]));
          else obj[key] = node[key];
        } catch (_e) { /* ignore */ }
      }
    }

    if ('children' in node && node.children.length > 0) {
      obj.children = await Promise.all(node.children.map(extractNodeData));
    }
    return obj;
  } catch (err) {
    if (err && err.nodeEnriched) throw err;
    try { figma.currentPage.selection = [node]; figma.viewport.scrollAndZoomIntoView([node]); } catch (_e) { /* ignore */ }
    const errorMsg = (err && err.message) ? err.message : String(err);
    const enrichedError = new Error(`[Erreur sur "${node.name}" (${node.type})] ${errorMsg}`);
    enrichedError.nodeEnriched = true;
    throw enrichedError;
  }
}

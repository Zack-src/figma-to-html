/**
 * Shared detection utilities.
 */

export function isExportableAsSvg(node) {
  const vectorTypes = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'LINE'];
  if (vectorTypes.includes(node.type)) return true;
  if (['COMPONENT', 'INSTANCE', 'GROUP'].includes(node.type)) {
    let hasOnlyShapes = true;
    let hasAnyShapes = false;
    function checkShapes(n) {
      if (!n.children || n.children.length === 0) { hasOnlyShapes = false; return; }
      for (const child of n.children) {
        if (vectorTypes.includes(child.type)) hasAnyShapes = true;
        else if (['GROUP', 'BOOLEAN_OPERATION', 'COMPONENT', 'INSTANCE'].includes(child.type)) checkShapes(child);
        else hasOnlyShapes = false;
      }
    }
    checkShapes(node);
    return hasOnlyShapes && hasAnyShapes;
  }
  return false;
}

export function isPureImageNode(node) {
  if ('children' in node && node.children && node.children.length > 0) return false;
  if (!('fills' in node) || !Array.isArray(node.fills)) return false;
  const visible = node.fills.filter(f => f.visible !== false);
  return visible.length === 1 && visible[0].type === 'IMAGE' && visible[0].imageHash;
}

export function getTextOverflowCss(node) {
  if ('textTruncation' in node && node.textTruncation === 'ENDING') {
    return ['overflow: hidden;', 'text-overflow: ellipsis;', 'white-space: nowrap;'];
  }
  return [];
}

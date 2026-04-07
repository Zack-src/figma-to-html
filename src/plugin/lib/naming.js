/**
 * Class naming utilities (BEM with parent context).
 */

export function sanitizeName(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'element';
}

export function getClassName(node, context) {
  if (!context || !context.opts || !context.opts.cleanCode) {
    let name = sanitizeName(node.name);
    if (!name || /^[0-9]/.test(name)) name = 'n-' + (name || 'node');
    return name + '-' + node.id.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }
  return getBemClassName(node, context);
}

function getBemClassName(node, context) {
  let base = sanitizeName(node.name);
  if (!base || /^[0-9]/.test(base)) base = 'element';

  let parentKey = null;
  if (node.parent && node.parent.type !== 'PAGE' && node.parent.type !== 'DOCUMENT') {
    parentKey = context.classNameMap.get(node.parent.id);
  }

  // Cap nesting depth to Block__Element only (BEM style) 
  // or allow one more level if it is a modifier, but here we simplify:
  // We only keep the last parent's base name as the block.
  let fullKey;
  if (parentKey) {
    const parts = parentKey.split('__');
    const lastBlock = parts[parts.length - 1];
    fullKey = lastBlock + '__' + base;
  } else {
    fullKey = base;
  }

  if (!context.classNameCounters.has(fullKey)) {
    context.classNameCounters.set(fullKey, 0);
    context.classNameMap.set(node.id, fullKey);
    return fullKey;
  }
  const count = context.classNameCounters.get(fullKey) + 1;
  context.classNameCounters.set(fullKey, count);
  const uniqueName = fullKey + '--' + count;
  context.classNameMap.set(node.id, uniqueName);
  return uniqueName;
}

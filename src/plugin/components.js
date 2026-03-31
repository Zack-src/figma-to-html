/**
 * Component registry: detect repeated Figma instances, collect text data.
 */

import { sanitizeName } from './utils.js';

export function collectTexts(node) {
  var texts = [];
  if (node.type === 'TEXT') {
    texts.push({ name: sanitizeName(node.name), value: node.characters || '' });
  }
  if ('children' in node && node.children) {
    for (var i = 0; i < node.children.length; i++) {
      texts = texts.concat(collectTexts(node.children[i]));
    }
  }
  return texts;
}

export function buildComponentDataJs(registry) {
  var js = '';
  registry.forEach(function (entry) {
    if (entry.instances.length < 2) return;
    var safeName = entry.name.replace(/[^a-zA-Z0-9]/g, '_');
    js += '\n/* Component data for "' + entry.name + '" (' + entry.instances.length + ' instances) */\n';
    js += 'var componentData_' + safeName + ' = [\n';
    for (var i = 0; i < entry.instances.length; i++) {
      var inst = entry.instances[i];
      js += '  { ';
      var pairs = [];
      for (var t = 0; t < inst.texts.length; t++) {
        pairs.push('"' + inst.texts[t].name + '": "' + inst.texts[t].value.replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"');
      }
      js += pairs.join(', ');
      js += ' }';
      if (i < entry.instances.length - 1) js += ',';
      js += '\n';
    }
    js += '];\n';
  });
  return js;
}

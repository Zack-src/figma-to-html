/**
 * Semantic HTML5 tags and accessibility utilities.
 */

const SEMANTIC_MAP = {
  'header': 'header', 'en-tête': 'header', 'entete': 'header',
  'footer': 'footer', 'pied': 'footer',
  'nav': 'nav', 'navigation': 'nav', 'navbar': 'nav', 'menu': 'nav',
  'section': 'section',
  'main': 'main', 'contenu': 'main', 'content': 'main',
  'article': 'article',
  'aside': 'aside', 'sidebar': 'aside',
  'button': 'button', 'btn': 'button', 'bouton': 'button', 'cta': 'button',
  'input': 'input', 'champ': 'input', 'field': 'input', 'textbox': 'input',
  'textarea': 'textarea',
  'ul': 'ul', 'ol': 'ol', 'list': 'ul', 'liste': 'ul',
  'li': 'li', 'item': 'li', 'list-item': 'li',
};

export function getSemanticTag(node, context) {
  if (!context || !context.opts || !context.opts.semanticHtml) return 'div';
  const name = node.name.toLowerCase().trim();
  for (const [keyword, tag] of Object.entries(SEMANTIC_MAP)) {
    if (name === keyword || name.startsWith(keyword + ' ') || name.startsWith(keyword + '-') || name.startsWith(keyword + '/')) {
      return tag;
    }
  }
  return 'div';
}

export function getAriaAttrs(node, context) {
  if (!context || !context.opts || !context.opts.ariaRoles) return '';
  const name = node.name.toLowerCase().trim();
  if (/\b(button|btn|bouton|cta)\b/.test(name)) return ' role="button" tabindex="0"';
  if (/\b(link|lien)\b/.test(name)) return ' role="link" tabindex="0"';
  if (/\b(input|champ|field|textbox)\b/.test(name)) return ' role="textbox"';
  if (/\b(image|img|photo|illustration|icon|icone)\b/.test(name)) return ` role="img" aria-label="${node.name}"`;
  return '';
}

export function getAltText(node, context) {
  if (!context || !context.opts || !context.opts.altText) return node.name;
  if (node.name.toLowerCase().startsWith('alt:')) return node.name.substring(4).trim();
  return node.name;
}

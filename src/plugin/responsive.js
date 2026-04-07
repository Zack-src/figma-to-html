/**
 * Responsive: multi-frame breakpoints with media queries.
 */

import { processNode } from './processor/index.js';

export async function processResponsive(frames, context) {
  const sorted = [...frames].sort((a, b) => b.width - a.width);
  let html = '';
  let css = '';

  for (let i = 0; i < sorted.length; i++) {
    const frame = sorted[i];
    const frameResult = await processNode(frame, 'NONE', true, context);

    if (i === 0) {
      html = frameResult.html;
      css += frameResult.css;
    } else {
      const breakpoint = Math.round(sorted[i - 1].width);
      css += `\n@media (max-width: ${breakpoint}px) {\n`;
      css += frameResult.css.split('\n').map(l => '  ' + l).join('\n');
      css += `\n}\n`;
    }
  }

  return { html, css };
}

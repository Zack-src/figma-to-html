"use strict";
(() => {
  // src/plugin/config.js
  var DEFAULT_OPTIONS = {
    cleanCode: true,
    designTokens: true,
    semanticHtml: true,
    cssGrid: false,
    imageFormat: "webp",
    googleFonts: true,
    svgMode: "inline",
    responsive: false,
    fluidTypo: false,
    externalLinks: true,
    keyframeAnim: false,
    extraTriggers: false,
    ariaRoles: true,
    altText: true
  };
  function createContext(opts) {
    return {
      js: "",
      opts,
      fonts: /* @__PURE__ */ new Set(),
      colors: /* @__PURE__ */ new Map(),
      textStyles: /* @__PURE__ */ new Map(),
      imageAssets: [],
      svgAssets: [],
      imageCounter: 0,
      svgCounter: 0,
      classNameMap: /* @__PURE__ */ new Map(),
      classNameCounters: /* @__PURE__ */ new Map(),
      keyframeCounter: 0,
      keyframeCss: "",
      svgCache: /* @__PURE__ */ new Map(),
      imageCache: /* @__PURE__ */ new Map(),
      componentRegistry: /* @__PURE__ */ new Map()
    };
  }

  // src/plugin/utils.js
  function rgbaToCss(color, opacity = 1) {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const a = ("a" in color ? color.a : 1) * opacity;
    if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  function rgbaToHex(color) {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  function sanitizeName(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "element";
  }
  function getClassName(node, context) {
    if (!context || !context.opts || !context.opts.cleanCode) {
      let name = sanitizeName(node.name);
      if (!name || /^[0-9]/.test(name)) name = "n-" + (name || "node");
      return name + "-" + node.id.toLowerCase().replace(/[^a-z0-9]/g, "-");
    }
    return getBemClassName(node, context);
  }
  function getBemClassName(node, context) {
    let base = sanitizeName(node.name);
    if (!base || /^[0-9]/.test(base)) base = "element";
    const key = base;
    if (!context.classNameCounters.has(key)) {
      context.classNameCounters.set(key, 0);
      context.classNameMap.set(node.id, base);
      return base;
    }
    const count = context.classNameCounters.get(key) + 1;
    context.classNameCounters.set(key, count);
    const uniqueName = `${base}--${count}`;
    context.classNameMap.set(node.id, uniqueName);
    return uniqueName;
  }
  var SEMANTIC_MAP = {
    "header": "header",
    "en-t\xEAte": "header",
    "entete": "header",
    "footer": "footer",
    "pied": "footer",
    "nav": "nav",
    "navigation": "nav",
    "navbar": "nav",
    "menu": "nav",
    "section": "section",
    "main": "main",
    "contenu": "main",
    "content": "main",
    "article": "article",
    "aside": "aside",
    "sidebar": "aside",
    "button": "button",
    "btn": "button",
    "bouton": "button",
    "cta": "button"
  };
  function getSemanticTag(node, context) {
    if (!context.opts.semanticHtml) return "div";
    const name = node.name.toLowerCase().trim();
    for (const [keyword, tag] of Object.entries(SEMANTIC_MAP)) {
      if (name === keyword || name.startsWith(keyword + " ") || name.startsWith(keyword + "-") || name.startsWith(keyword + "/")) {
        return tag;
      }
    }
    return "div";
  }
  function getAriaAttrs(node, context) {
    if (!context.opts.ariaRoles) return "";
    const name = node.name.toLowerCase().trim();
    if (/\b(button|btn|bouton|cta)\b/.test(name)) return ' role="button" tabindex="0"';
    if (/\b(link|lien)\b/.test(name)) return ' role="link" tabindex="0"';
    if (/\b(input|champ|field|textbox)\b/.test(name)) return ' role="textbox"';
    if (/\b(image|img|photo|illustration|icon|icone)\b/.test(name)) return ` role="img" aria-label="${node.name}"`;
    return "";
  }
  function getAltText(node, context) {
    if (!context.opts.altText) return node.name;
    if (node.name.toLowerCase().startsWith("alt:")) return node.name.substring(4).trim();
    return node.name;
  }
  function mapEasingToCss(easing) {
    if (!easing) return "ease";
    switch (easing.type) {
      case "LINEAR":
        return "linear";
      case "EASE_IN":
        return "ease-in";
      case "EASE_OUT":
        return "ease-out";
      case "EASE_IN_AND_OUT":
        return "ease-in-out";
      case "EASE_IN_BACK":
        return "cubic-bezier(0.36, 0, 0.66, -0.56)";
      case "EASE_OUT_BACK":
        return "cubic-bezier(0.34, 1.56, 0.64, 1)";
      case "EASE_IN_AND_OUT_BACK":
        return "cubic-bezier(0.68, -0.6, 0.32, 1.6)";
      case "CUSTOM_CUBIC_BEZIER":
        if (easing.easingFunctionCubicBezier) {
          const { x1, y1, x2, y2 } = easing.easingFunctionCubicBezier;
          return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
        }
        return "ease";
      default:
        return "ease";
    }
  }
  function mapFontWeight(style) {
    const s = style.toLowerCase();
    if (s.includes("thin") || s.includes("hairline")) return "100";
    if (s.includes("extralight") || s.includes("ultralight")) return "200";
    if (s.includes("light")) return "300";
    if (s.includes("medium")) return "500";
    if (s.includes("semibold") || s.includes("demibold")) return "600";
    if (s.includes("bold")) return "700";
    if (s.includes("extrabold") || s.includes("ultrabold")) return "800";
    if (s.includes("black") || s.includes("heavy")) return "900";
    return "400";
  }
  function getAlign(align) {
    switch (align) {
      case "MIN":
        return "flex-start";
      case "CENTER":
        return "center";
      case "MAX":
        return "flex-end";
      case "SPACE_BETWEEN":
        return "space-between";
      default:
        return "flex-start";
    }
  }
  function applySizingRules(node, parentLayoutMode, cssRules) {
    if ("layoutSizingHorizontal" in node) {
      if (node.layoutSizingHorizontal === "FILL") {
        if (parentLayoutMode === "HORIZONTAL") {
          cssRules.push("flex: 1 1 0px;");
          cssRules.push("min-width: 0;");
        } else {
          cssRules.push("align-self: stretch;");
          cssRules.push("width: 100%;");
        }
      } else if (node.layoutSizingHorizontal === "FIXED") {
        cssRules.push(`width: ${node.width}px;`);
        if (parentLayoutMode === "HORIZONTAL") cssRules.push("flex-shrink: 0;");
      } else if (node.layoutSizingHorizontal === "HUG") {
        cssRules.push("width: max-content;");
        if (parentLayoutMode === "HORIZONTAL") cssRules.push("flex-shrink: 0;");
      }
    } else if ("width" in node) {
      cssRules.push(`width: ${node.width}px;`);
    }
    if ("layoutSizingVertical" in node) {
      if (node.layoutSizingVertical === "FILL") {
        if (parentLayoutMode === "VERTICAL") {
          cssRules.push("flex: 1 1 0px;");
          cssRules.push("min-height: 0;");
        } else {
          cssRules.push("align-self: stretch;");
          cssRules.push("height: 100%;");
        }
      } else if (node.layoutSizingVertical === "FIXED") {
        cssRules.push(`height: ${node.height}px;`);
        if (parentLayoutMode === "VERTICAL") cssRules.push("flex-shrink: 0;");
      } else if (node.layoutSizingVertical === "HUG") {
        cssRules.push("height: max-content;");
        if (parentLayoutMode === "VERTICAL") cssRules.push("flex-shrink: 0;");
      }
    } else if ("height" in node) {
      cssRules.push(`height: ${node.height}px;`);
    }
  }
  function isExportableAsSvg(node) {
    const vectorTypes = ["VECTOR", "BOOLEAN_OPERATION", "STAR", "POLYGON", "ELLIPSE", "LINE"];
    if (vectorTypes.includes(node.type)) return true;
    if (["COMPONENT", "INSTANCE", "GROUP"].includes(node.type)) {
      let checkShapes2 = function(n) {
        if (!n.children || n.children.length === 0) {
          hasOnlyShapes = false;
          return;
        }
        for (const child of n.children) {
          if (vectorTypes.includes(child.type)) hasAnyShapes = true;
          else if (["GROUP", "BOOLEAN_OPERATION", "COMPONENT", "INSTANCE"].includes(child.type)) checkShapes2(child);
          else hasOnlyShapes = false;
        }
      };
      var checkShapes = checkShapes2;
      let hasOnlyShapes = true;
      let hasAnyShapes = false;
      checkShapes2(node);
      return hasOnlyShapes && hasAnyShapes;
    }
    return false;
  }
  function fluidFontSize(sizePx) {
    const minSize = Math.max(12, Math.round(sizePx * 0.7));
    const maxSize = sizePx;
    const preferred = (sizePx / 16).toFixed(3);
    return `clamp(${minSize}px, ${preferred}rem + 0.5vw, ${maxSize}px)`;
  }

  // src/plugin/css.js
  function collectColorToken(color, opacity, context) {
    const css = rgbaToCss(color, opacity);
    const key = css;
    if (!context.colors.has(key)) {
      const idx = context.colors.size + 1;
      const name = `--color-${idx}`;
      context.colors.set(key, { name, value: css, hex: rgbaToHex(color) });
    }
    return context.colors.get(key).name;
  }
  function collectTextToken(family, size, weight, context) {
    const key = `${family}-${size}-${weight}`;
    if (!context.textStyles.has(key)) {
      const idx = context.textStyles.size + 1;
      const name = `--font-${idx}`;
      context.textStyles.set(key, { name, family, size, weight });
    }
    return context.textStyles.get(key).name;
  }
  function generateDesignTokens(context) {
    if (context.colors.size === 0 && context.textStyles.size === 0) return "";
    let css = ":root {\n";
    for (const [, val] of context.colors) {
      css += `  ${val.name}: ${val.value};
`;
    }
    for (const [, val] of context.textStyles) {
      css += `  ${val.name}-family: '${val.family}', sans-serif;
`;
      css += `  ${val.name}-size: ${val.size}px;
`;
      css += `  ${val.name}-weight: ${val.weight};
`;
    }
    css += "}\n";
    return css;
  }
  function buildGoogleFontsLink(fontsSet) {
    const families = Array.from(fontsSet).map((f) => {
      return "family=" + encodeURIComponent(f).replace(/%20/g, "+") + ":wght@100;200;300;400;500;600;700;800;900";
    }).join("&");
    return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?${families}&display=swap" rel="stylesheet">`;
  }
  function shouldUseGrid(node, context) {
    if (!context.opts.cssGrid) return false;
    if (!("layoutMode" in node) || node.layoutMode === "NONE") return false;
    if (node.layoutWrap !== "WRAP") return false;
    if (!("children" in node) || node.children.length < 3) return false;
    const widths = node.children.filter((c) => c.visible).map((c) => Math.round(c.width));
    if (widths.length < 2) return false;
    const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
    return widths.every((w) => Math.abs(w - avg) / avg < 0.15);
  }
  function deduplicateCss(cssString) {
    var blocks = [];
    var mediaBlocks = [];
    var otherLines = [];
    var current = "";
    var depth = 0;
    for (var i = 0; i < cssString.length; i++) {
      var ch = cssString[i];
      current += ch;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth <= 0) {
          var trimmed = current.trim();
          if (trimmed) {
            if (trimmed.indexOf("@media") === 0) {
              mediaBlocks.push(trimmed);
            } else if (trimmed.indexOf("@keyframes") === 0) {
              otherLines.push(trimmed);
            } else {
              var braceIdx = trimmed.indexOf("{");
              if (braceIdx > -1) {
                var selector = trimmed.substring(0, braceIdx).trim();
                var body = trimmed.substring(braceIdx + 1, trimmed.lastIndexOf("}")).trim();
                blocks.push({ selector, body });
              } else {
                otherLines.push(trimmed);
              }
            }
          }
          current = "";
          depth = 0;
        }
      }
    }
    if (current.trim()) otherLines.push(current.trim());
    var bodyMap = {};
    var order = [];
    for (var b = 0; b < blocks.length; b++) {
      var block = blocks[b];
      var key = block.body;
      if (!(key in bodyMap)) {
        bodyMap[key] = [];
        order.push(key);
      }
      if (bodyMap[key].indexOf(block.selector) === -1) {
        bodyMap[key].push(block.selector);
      }
    }
    var out = "";
    for (var o = 0; o < order.length; o++) {
      var bodyKey = order[o];
      var selectors = bodyMap[bodyKey];
      out += selectors.join(",\n") + " {\n  " + bodyKey + "\n}\n";
    }
    for (var m = 0; m < mediaBlocks.length; m++) out += mediaBlocks[m] + "\n";
    for (var l = 0; l < otherLines.length; l++) out += otherLines[l] + "\n";
    return out;
  }
  var BASE_CSS = `*{box-sizing:border-box;}
body{margin:0;padding:20px;background-color:#f5f5f5;display:flex;justify-content:center;align-items:flex-start;}
div,p{margin:0;}
svg{display:block;width:100%;height:100%;}
`;

  // src/plugin/components.js
  function collectTexts(node) {
    var texts = [];
    if (node.type === "TEXT") {
      texts.push({ name: sanitizeName(node.name), value: node.characters || "" });
    }
    if ("children" in node && node.children) {
      for (var i = 0; i < node.children.length; i++) {
        texts = texts.concat(collectTexts(node.children[i]));
      }
    }
    return texts;
  }
  function buildComponentDataJs(registry) {
    var js = "";
    registry.forEach(function(entry) {
      if (entry.instances.length < 2) return;
      var safeName = entry.name.replace(/[^a-zA-Z0-9]/g, "_");
      js += '\n/* Component data for "' + entry.name + '" (' + entry.instances.length + " instances) */\n";
      js += "var componentData_" + safeName + " = [\n";
      for (var i = 0; i < entry.instances.length; i++) {
        var inst = entry.instances[i];
        js += "  { ";
        var pairs = [];
        for (var t = 0; t < inst.texts.length; t++) {
          pairs.push('"' + inst.texts[t].name + '": "' + inst.texts[t].value.replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"');
        }
        js += pairs.join(", ");
        js += " }";
        if (i < entry.instances.length - 1) js += ",";
        js += "\n";
      }
      js += "];\n";
    });
    return js;
  }

  // src/plugin/interactive.js
  async function processInteractiveGraph(node, parentLayoutMode, isRoot, context) {
    let css = "";
    let html = "";
    const className = getClassName(node, context) + "-interactive-machine";
    const wrapperId = "interactive-machine-" + node.id.replace(/[^a-z0-9]/gi, "-");
    let cssRules = [];
    const isAbsolute = !isRoot && (node.layoutPositioning === "ABSOLUTE" || parentLayoutMode === "NONE" && node.parent && node.parent.type !== "PAGE" && node.parent.type !== "DOCUMENT");
    if (isAbsolute) {
      let left = node.x, top = node.y;
      if (node.parent && node.parent.type === "GROUP") {
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
      if ("width" in node) cssRules.push(`width: ${node.width}px;`);
      if ("height" in node) cssRules.push(`height: ${node.height}px;`);
    } else if (parentLayoutMode !== "NONE") {
      applySizingRules(node, parentLayoutMode, cssRules);
    } else {
      if ("width" in node) cssRules.push(`width: ${node.width}px;`);
      if ("height" in node) cssRules.push(`height: ${node.height}px;`);
    }
    if (cssRules.length > 0) css += `.${className} {
  ${cssRules.join("\n  ")}
}
`;
    html += `<div id="${wrapperId}" class="${className} interactive-wrapper">
`;
    let mainComponent = null;
    try {
      mainComponent = await node.getMainComponentAsync();
    } catch (_e) {
    }
    if (!mainComponent || !mainComponent.parent || mainComponent.parent.type !== "COMPONENT_SET") {
      return await processNode(node, parentLayoutMode, isRoot, context, true);
    }
    const initialVariantId = mainComponent.id;
    const visitedStates = /* @__PURE__ */ new Set();
    const queue = [initialVariantId];
    const extractionNode = node.clone();
    let firstTransitionCss = "transition: opacity 0.3s ease;";
    let htmlStates = "";
    while (queue.length > 0) {
      const currentVariantId = queue.shift();
      if (visitedStates.has(currentVariantId)) continue;
      visitedStates.add(currentVariantId);
      const currentVariantNode = await figma.getNodeByIdAsync(currentVariantId);
      if (!currentVariantNode) continue;
      extractionNode.swapComponent(currentVariantNode);
      const stateResult = await processNode(extractionNode, parentLayoutMode, false, context, true);
      css += stateResult.css;
      let activeClass = currentVariantId === initialVariantId ? "active-state" : "inactive-state";
      let localTransitionInline = "";
      const reactions = (extractionNode.reactions || []).filter(
        (r) => r.action && r.action.type === "NODE" && r.action.navigation === "CHANGE_TO"
      );
      for (const react of reactions) {
        const destId = react.action.destinationId;
        if (!visitedStates.has(destId) && !queue.includes(destId)) queue.push(destId);
        if (react.action.transition) {
          const dur = react.action.transition.duration || 0.3;
          const eas = mapEasingToCss(react.action.transition.easing);
          localTransitionInline = `transition: opacity ${dur}s ${eas};`;
          if (currentVariantId === initialVariantId) firstTransitionCss = localTransitionInline;
        }
        let eventType = "click";
        if (react.trigger && (react.trigger.type === "ON_HOVER" || react.trigger.type === "MOUSE_ENTER")) eventType = "mouseenter";
        else if (react.trigger && react.trigger.type === "MOUSE_LEAVE") eventType = "mouseleave";
        else if (react.trigger && react.trigger.type === "ON_DRAG" && context.opts.extraTriggers) eventType = "mousedown";
        else if (react.trigger && react.trigger.type === "WHILE_PRESSING" && context.opts.extraTriggers) eventType = "mousedown";
        context.js += `
document.querySelector('#${wrapperId} .interactive-state[data-state-id="${currentVariantId}"]').addEventListener('${eventType}', function(e) {
  e.stopPropagation();
  var wrapper = document.getElementById('${wrapperId}');
  wrapper.querySelectorAll('.interactive-state').forEach(function(el) { el.classList.add('inactive-state'); });
  wrapper.querySelector('.interactive-state[data-state-id="${destId}"]').classList.remove('inactive-state');
});
`;
        if (react.trigger && react.trigger.type === "WHILE_PRESSING" && context.opts.extraTriggers) {
          context.js += `
document.querySelector('#${wrapperId} .interactive-state[data-state-id="${currentVariantId}"]').addEventListener('mouseup', function(e) {
  var wrapper = document.getElementById('${wrapperId}');
  wrapper.querySelectorAll('.interactive-state').forEach(function(el) { el.classList.add('inactive-state'); });
  wrapper.querySelector('.interactive-state[data-state-id="${currentVariantId}"]').classList.remove('inactive-state');
});
`;
        }
        if (react.trigger && react.trigger.type === "AFTER_DELAY" && context.opts.extraTriggers) {
          const delayMs = (react.trigger.delay || 1) * 1e3;
          context.js += `
setTimeout(function() {
  var wrapper = document.getElementById('${wrapperId}');
  if (wrapper) {
    wrapper.querySelectorAll('.interactive-state').forEach(function(el) { el.classList.add('inactive-state'); });
    var dest = wrapper.querySelector('.interactive-state[data-state-id="${destId}"]');
    if (dest) dest.classList.remove('inactive-state');
  }
}, ${delayMs});
`;
        }
        if (react.trigger && react.trigger.type === "ON_HOVER") {
          context.js += `
document.querySelector('#${wrapperId}').addEventListener('mouseleave', function(e) {
  var wrapper = document.getElementById('${wrapperId}');
  wrapper.querySelectorAll('.interactive-state').forEach(function(el) { el.classList.add('inactive-state'); });
  wrapper.querySelector('.interactive-state[data-state-id="${currentVariantId}"]').classList.remove('inactive-state');
});
`;
        }
      }
      if (!localTransitionInline) localTransitionInline = firstTransitionCss;
      htmlStates += `<div class="interactive-state ${activeClass}" data-state-id="${currentVariantId}" style="${localTransitionInline}">
${stateResult.html}</div>
`;
    }
    extractionNode.remove();
    css += `.interactive-wrapper { position: relative; }
`;
    css += `.interactive-state { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 1; pointer-events: auto; }
`;
    css += `.interactive-state.active-state { position: relative; }
`;
    css += `.interactive-state.inactive-state { opacity: 0; pointer-events: none; }
`;
    html += htmlStates + `</div>
`;
    return { html, css };
  }

  // src/plugin/process.js
  async function processNode(node, parentLayoutMode = "NONE", isRoot = false, context = { js: "", opts: DEFAULT_OPTIONS }, isVariantState = false) {
    try {
      if (!node.visible) return { html: "", css: "" };
      const opts = context.opts;
      let html = "";
      let css = "";
      const className = getClassName(node, context);
      const cssRules = [];
      const isText = node.type === "TEXT";
      let externalUrl = null;
      if (opts.externalLinks && node.reactions && node.reactions.length > 0) {
        const urlReaction = node.reactions.find((r) => r.action && r.action.type === "URL");
        if (urlReaction && urlReaction.action.url) {
          externalUrl = urlReaction.action.url;
        }
      }
      if (!isVariantState && node.type === "INSTANCE" && node.reactions && node.reactions.length > 0) {
        const hasChangeTo = node.reactions.some((r) => r.action && r.action.type === "NODE" && r.action.navigation === "CHANGE_TO");
        if (hasChangeTo) {
          return await processInteractiveGraph(node, parentLayoutMode, isRoot, context);
        }
      }
      if (!isVariantState && node.type === "INSTANCE") {
        var mainComp = null;
        try {
          mainComp = await node.getMainComponentAsync();
        } catch (_e) {
        }
        if (mainComp) {
          var compId = mainComp.id;
          var compName = mainComp.name || "Component";
          var texts = collectTexts(node);
          if (context.componentRegistry.has(compId)) {
            var reg = context.componentRegistry.get(compId);
            reg.instances.push({ nodeId: node.id, texts });
            var reResult = await processNode(node, parentLayoutMode, isRoot, context, true);
            return { html: "<!-- component: " + compName + " -->\n" + reResult.html, css: reResult.css };
          } else {
            context.componentRegistry.set(compId, {
              name: compName,
              instances: [{ nodeId: node.id, texts }]
            });
            var firstResult = await processNode(node, parentLayoutMode, isRoot, context, true);
            return { html: "<!-- component: " + compName + " -->\n" + firstResult.html, css: firstResult.css };
          }
        }
      }
      if (opts.keyframeAnim && !isVariantState && node.reactions && node.reactions.length > 0) {
        for (const react of node.reactions) {
          if (react.action && react.action.transition && react.action.transition.type === "SMART_ANIMATE") {
            const dur = react.action.transition.duration || 0.3;
            const eas = mapEasingToCss(react.action.transition.easing);
            const animName = `anim-${++context.keyframeCounter}`;
            context.keyframeCss += `@keyframes ${animName} {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
            cssRules.push(`animation: ${animName} ${dur}s ${eas} both;`);
          }
        }
      }
      const isAbsolute = !isRoot && !isVariantState && (node.layoutPositioning === "ABSOLUTE" || parentLayoutMode === "NONE" && node.parent && node.parent.type !== "PAGE" && node.parent.type !== "DOCUMENT");
      if (isAbsolute) {
        let left = node.x, top = node.y;
        if (node.parent && node.parent.type === "GROUP") {
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
        try {
          const svgBytes = await node.exportAsync({ format: "SVG" });
          let svgString = "";
          try {
            svgString = new TextDecoder().decode(svgBytes);
          } catch (_e) {
            svgString = Array.from(svgBytes).map((b) => String.fromCharCode(b)).join("");
          }
          if (isAbsolute) {
            if ("width" in node) cssRules.push(`width: ${node.width}px;`);
            if ("height" in node) cssRules.push(`height: ${node.height}px;`);
          } else if (parentLayoutMode !== "NONE") {
            applySizingRules(node, parentLayoutMode, cssRules);
          } else {
            if ("width" in node) cssRules.push(`width: ${node.width}px;`);
            if ("height" in node) cssRules.push(`height: ${node.height}px;`);
          }
          const ariaAttrs = getAriaAttrs(node, context);
          const altText = getAltText(node, context);
          if (opts.svgMode === "file") {
            var svgFilename;
            if (context.svgCache.has(svgString)) {
              svgFilename = context.svgCache.get(svgString);
            } else {
              svgFilename = "icon-" + ++context.svgCounter + ".svg";
              context.svgCache.set(svgString, svgFilename);
              context.svgAssets.push({ filename: svgFilename, content: svgString });
            }
            if (cssRules.length > 0) css += `.${className} {
  ${cssRules.join("\n  ")}
}
`;
            return { html: `<img src="assets/${svgFilename}" alt="${altText}" class="${className}"${ariaAttrs}>
`, css };
          } else {
            if (cssRules.length > 0) css += `.${className} {
  ${cssRules.join("\n  ")}
}
`;
            return { html: `<div class="${className}"${ariaAttrs}>${svgString}</div>
`, css };
          }
        } catch (_svgErr) {
          console.warn(`[Plugin] SVG export failed for "${node.name}", falling back to div.`);
        }
      }
      if ("opacity" in node && node.opacity < 1) {
        cssRules.push(`opacity: ${node.opacity};`);
      }
      if ("fills" in node && Array.isArray(node.fills)) {
        const visibleFills = node.fills.filter((f) => f.visible !== false);
        const imageFill = visibleFills.find((f) => f.type === "IMAGE");
        const gradientFill = visibleFills.find((f) => f.type === "GRADIENT_LINEAR");
        const solidFill = visibleFills.filter((f) => f.type === "SOLID").pop();
        if (imageFill && imageFill.imageHash) {
          const image = figma.getImageByHash(imageFill.imageHash);
          if (image) {
            try {
              const bytes = await image.getBytesAsync();
              const base64 = figma.base64Encode(bytes);
              const imageOpacity = imageFill.opacity !== void 0 ? imageFill.opacity : 1;
              if (opts.imageFormat === "base64-png") {
                if (imageOpacity < 1) {
                  css += `.${className}::before {
  content: "";
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background-image: url('data:image/png;base64,${base64}');
  background-size: cover;
  background-position: center;
  opacity: ${imageOpacity};
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
}
`;
                  if (!cssRules.some((r) => r.startsWith("position:"))) cssRules.push(`position: relative;`);
                } else {
                  cssRules.push(`background-image: url('data:image/png;base64,${base64}');`);
                  cssRules.push(`background-size: cover;`);
                  cssRules.push(`background-position: center;`);
                }
              } else {
                const ext = opts.imageFormat === "avif" ? "avif" : opts.imageFormat === "png-file" ? "png" : "webp";
                var imgFilename;
                var cacheKey = imageFill.imageHash + "." + ext;
                if (context.imageCache.has(cacheKey)) {
                  imgFilename = context.imageCache.get(cacheKey);
                } else {
                  imgFilename = "img-" + ++context.imageCounter + "." + ext;
                  context.imageCache.set(cacheKey, imgFilename);
                  context.imageAssets.push({ filename: imgFilename, base64 });
                }
                if (imageOpacity < 1) {
                  css += `.${className}::before {
  content: "";
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background-image: url('assets/${imgFilename}');
  background-size: cover;
  background-position: center;
  opacity: ${imageOpacity};
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
}
`;
                  if (!cssRules.some((r) => r.startsWith("position:"))) cssRules.push(`position: relative;`);
                } else {
                  cssRules.push(`background-image: url('assets/${imgFilename}');`);
                  cssRules.push(`background-size: cover;`);
                  cssRules.push(`background-position: center;`);
                }
              }
            } catch (_imgErr) {
              console.error(`[Plugin] Image fetch failed for ${node.name}`);
            }
          }
        } else if (gradientFill) {
          const t = gradientFill.gradientTransform;
          const angleRad = Math.atan2(t[1][0], t[0][0]);
          const angleDeg = Math.round(angleRad * (180 / Math.PI));
          const stops = gradientFill.gradientStops.map(
            (stop) => `${rgbaToCss(stop.color)} ${Math.round(stop.position * 100)}%`
          ).join(", ");
          const gradientCssVal = `linear-gradient(${angleDeg + 90}deg, ${stops})`;
          if (isText) {
            cssRules.push(`background: ${gradientCssVal};`);
            cssRules.push(`-webkit-background-clip: text;`);
            cssRules.push(`-webkit-text-fill-color: transparent;`);
          } else {
            cssRules.push(`background: ${gradientCssVal};`);
          }
        } else if (solidFill) {
          if (opts.designTokens) {
            const tokenName = collectColorToken(solidFill.color, solidFill.opacity, context);
            cssRules.push(isText ? `color: var(${tokenName});` : `background-color: var(${tokenName});`);
          } else {
            const colorVal = rgbaToCss(solidFill.color, solidFill.opacity);
            cssRules.push(isText ? `color: ${colorVal};` : `background-color: ${colorVal};`);
          }
        }
      }
      if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
        const solidStroke = node.strokes.find((s) => s.type === "SOLID" && s.visible !== false);
        if (solidStroke) {
          const strokeColor = rgbaToCss(solidStroke.color, solidStroke.opacity);
          if ("strokeWeight" in node && node.strokeWeight !== figma.mixed) {
            cssRules.push(`border: ${node.strokeWeight}px solid ${strokeColor};`);
          } else {
            if (node.strokeTopWeight > 0) cssRules.push(`border-top: ${node.strokeTopWeight}px solid ${strokeColor};`);
            if (node.strokeRightWeight > 0) cssRules.push(`border-right: ${node.strokeRightWeight}px solid ${strokeColor};`);
            if (node.strokeBottomWeight > 0) cssRules.push(`border-bottom: ${node.strokeBottomWeight}px solid ${strokeColor};`);
            if (node.strokeLeftWeight > 0) cssRules.push(`border-left: ${node.strokeLeftWeight}px solid ${strokeColor};`);
          }
        }
      }
      if ("effects" in node && Array.isArray(node.effects) && node.effects.length > 0) {
        const shadows = [];
        const textShadows = [];
        for (const e of node.effects) {
          if (e.type === "DROP_SHADOW" && e.visible !== false) {
            shadows.push(`${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread || 0}px ${rgbaToCss(e.color)}`);
            textShadows.push(`${e.offset.x}px ${e.offset.y}px ${e.radius}px ${rgbaToCss(e.color)}`);
          } else if (e.type === "INNER_SHADOW" && e.visible !== false) {
            shadows.push(`inset ${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread || 0}px ${rgbaToCss(e.color)}`);
          }
        }
        if (isText && textShadows.length > 0) cssRules.push(`text-shadow: ${textShadows.join(", ")};`);
        else if (!isText && shadows.length > 0) cssRules.push(`box-shadow: ${shadows.join(", ")};`);
      }
      if ("cornerRadius" in node && node.cornerRadius !== figma.mixed && node.cornerRadius > 0) {
        cssRules.push(`border-radius: ${node.cornerRadius}px;`);
      } else if ("topLeftRadius" in node) {
        cssRules.push(`border-radius: ${node.topLeftRadius}px ${node.topRightRadius}px ${node.bottomRightRadius}px ${node.bottomLeftRadius}px;`);
      }
      if ("overflowDirection" in node && node.overflowDirection !== "NONE") {
        if (node.overflowDirection === "VERTICAL") {
          cssRules.push(`overflow-y: auto;`);
          cssRules.push(`overflow-x: hidden;`);
        } else if (node.overflowDirection === "HORIZONTAL") {
          cssRules.push(`overflow-x: auto;`);
          cssRules.push(`overflow-y: hidden;`);
        } else cssRules.push(`overflow: auto;`);
      } else if ("clipsContent" in node && node.clipsContent) {
        cssRules.push(`overflow: hidden;`);
      }
      if (isText) {
        cssRules.push(`display: flex;`);
        cssRules.push(`flex-direction: column;`);
        if (node.textAlignVertical === "CENTER") cssRules.push(`justify-content: center;`);
        else if (node.textAlignVertical === "BOTTOM") cssRules.push(`justify-content: flex-end;`);
        else cssRules.push(`justify-content: flex-start;`);
        if (node.textAlignHorizontal === "CENTER") cssRules.push(`text-align: center;`);
        else if (node.textAlignHorizontal === "RIGHT") cssRules.push(`text-align: right;`);
        else if (node.textAlignHorizontal === "JUSTIFIED") cssRules.push(`text-align: justify;`);
        else cssRules.push(`text-align: left;`);
        if (node.fontName !== figma.mixed) {
          const family = node.fontName.family;
          const weight = mapFontWeight(node.fontName.style);
          context.fonts.add(family);
          if (opts.designTokens) {
            collectTextToken(family, node.fontSize !== figma.mixed ? node.fontSize : 16, weight, context);
          }
          cssRules.push(`font-family: '${family}', sans-serif;`);
          cssRules.push(`font-weight: ${weight};`);
        }
        if (node.fontSize !== figma.mixed) {
          cssRules.push(opts.fluidTypo && node.fontSize > 14 ? `font-size: ${fluidFontSize(node.fontSize)};` : `font-size: ${node.fontSize}px;`);
        }
        if (node.lineHeight !== figma.mixed) {
          if (node.lineHeight.unit === "PIXELS") cssRules.push(`line-height: ${node.lineHeight.value}px;`);
          else if (node.lineHeight.unit === "PERCENT") cssRules.push(`line-height: ${node.lineHeight.value}%;`);
        }
        const textContent = node.characters.replace(/\n/g, "<br>");
        const tag = getSemanticTag(node, context);
        const ariaAttrs = getAriaAttrs(node, context);
        if (externalUrl) {
          html += `<a href="${externalUrl}" target="_blank" rel="noopener noreferrer" class="${className}"${ariaAttrs}>${textContent}</a>
`;
        } else {
          html += `<${tag} class="${className}"${ariaAttrs}>${textContent}</${tag}>
`;
        }
      } else {
        const tag = getSemanticTag(node, context);
        const ariaAttrs = getAriaAttrs(node, context);
        if (externalUrl) {
          html += `<a href="${externalUrl}" target="_blank" rel="noopener noreferrer" class="${className}"${ariaAttrs}>
`;
        } else {
          html += `<${tag} class="${className}"${ariaAttrs}>
`;
        }
      }
      let currentLayoutMode = "NONE";
      if ("layoutMode" in node && node.layoutMode !== "NONE") {
        currentLayoutMode = node.layoutMode;
        if (!isText) {
          const useGrid = shouldUseGrid(node, context);
          if (useGrid) {
            const avgWidth = Math.round(
              node.children.filter((c) => c.visible).reduce((a, c) => a + c.width, 0) / node.children.filter((c) => c.visible).length
            );
            cssRules.push(`display: grid;`);
            cssRules.push(`grid-template-columns: repeat(auto-fill, minmax(${avgWidth}px, 1fr));`);
            if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) cssRules.push(`gap: ${node.itemSpacing}px;`);
          } else {
            cssRules.push(`display: flex;`);
            cssRules.push(`flex-direction: ${node.layoutMode === "HORIZONTAL" ? "row" : "column"};`);
            if (node.layoutWrap === "WRAP") cssRules.push(`flex-wrap: wrap;`);
            if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) cssRules.push(`gap: ${node.itemSpacing}px;`);
          }
          const pt = node.paddingTop !== figma.mixed ? node.paddingTop : 0;
          const pr = node.paddingRight !== figma.mixed ? node.paddingRight : 0;
          const pb = node.paddingBottom !== figma.mixed ? node.paddingBottom : 0;
          const pl = node.paddingLeft !== figma.mixed ? node.paddingLeft : 0;
          if (pt > 0 || pr > 0 || pb > 0 || pl > 0) cssRules.push(`padding: ${pt}px ${pr}px ${pb}px ${pl}px;`);
          if (!useGrid) {
            cssRules.push(`align-items: ${getAlign(node.counterAxisAlignItems)};`);
            cssRules.push(`justify-content: ${getAlign(node.primaryAxisAlignItems)};`);
          }
        }
      }
      if (isAbsolute) {
        if ("width" in node) cssRules.push(`width: ${node.width}px;`);
        if ("height" in node) cssRules.push(`height: ${node.height}px;`);
      } else if (parentLayoutMode !== "NONE") {
        applySizingRules(node, parentLayoutMode, cssRules);
      } else {
        if ("width" in node) cssRules.push(`width: ${node.width}px;`);
        if ("height" in node) cssRules.push(`height: ${node.height}px;`);
      }
      if (cssRules.length > 0) {
        css += `.${className} {
  ${cssRules.join("\n  ")}
}
`;
      }
      if ("children" in node && !isText) {
        for (const child of node.children) {
          const childResult = await processNode(child, currentLayoutMode, false, context);
          html += childResult.html;
          css += childResult.css;
        }
      }
      if (!isText) {
        const tag = getSemanticTag(node, context);
        html += externalUrl ? `</a>
` : `</${tag}>
`;
      }
      return { html, css };
    } catch (err) {
      if (err && err.nodeEnriched) throw err;
      try {
        figma.currentPage.selection = [node];
        figma.viewport.scrollAndZoomIntoView([node]);
      } catch (_e) {
      }
      const errorMsg = err && err.message ? err.message : String(err);
      const enrichedError = new Error(`[Erreur sur "${node.name}" (${node.type})] ${errorMsg}`);
      enrichedError.nodeEnriched = true;
      throw enrichedError;
    }
  }

  // src/plugin/responsive.js
  async function processResponsive(frames, context) {
    const sorted = [...frames].sort((a, b) => b.width - a.width);
    let html = "";
    let css = "";
    for (let i = 0; i < sorted.length; i++) {
      const frame = sorted[i];
      const frameResult = await processNode(frame, "NONE", true, context);
      if (i === 0) {
        html = frameResult.html;
        css += frameResult.css;
      } else {
        const breakpoint = Math.round(sorted[i - 1].width);
        css += `
@media (max-width: ${breakpoint}px) {
`;
        css += frameResult.css.split("\n").map((l) => "  " + l).join("\n");
        css += `
}
`;
      }
    }
    return { html, css };
  }

  // src/plugin/debug.js
  async function extractNodeData(node) {
    try {
      const safeKeys = [
        "id",
        "name",
        "type",
        "x",
        "y",
        "width",
        "height",
        "rotation",
        "layoutMode",
        "layoutPositioning",
        "primaryAxisAlignItems",
        "counterAxisAlignItems",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "itemSpacing",
        "layoutSizingHorizontal",
        "layoutSizingVertical",
        "layoutWrap",
        "opacity",
        "cornerRadius",
        "topLeftRadius",
        "topRightRadius",
        "bottomLeftRadius",
        "bottomRightRadius",
        "fills",
        "strokes",
        "strokeWeight",
        "effects",
        "fontName",
        "fontSize",
        "characters",
        "textAlignHorizontal",
        "textAlignVertical",
        "lineHeight",
        "componentProperties",
        "variantProperties",
        "clipsContent",
        "overflowDirection",
        "reactions"
      ];
      const obj = {};
      if (node.parent) {
        obj.parentType = node.parent.type;
        if ("layoutMode" in node.parent) obj.parentLayoutMode = node.parent.layoutMode;
      }
      if (node.type === "INSTANCE") {
        try {
          const mainComp = await node.getMainComponentAsync();
          if (mainComp) {
            obj.mainComponentId = mainComp.id;
            obj.mainComponentName = mainComp.name;
          }
        } catch (_e) {
        }
      }
      for (const key of safeKeys) {
        if (key in node) {
          try {
            if (node[key] === figma.mixed) obj[key] = "mixed";
            else if (key === "fills" || key === "strokes" || key === "effects") obj[key] = JSON.parse(JSON.stringify(node[key]));
            else obj[key] = node[key];
          } catch (_e) {
          }
        }
      }
      if ("children" in node && node.children.length > 0) {
        obj.children = await Promise.all(node.children.map(extractNodeData));
      }
      return obj;
    } catch (err) {
      if (err && err.nodeEnriched) throw err;
      try {
        figma.currentPage.selection = [node];
        figma.viewport.scrollAndZoomIntoView([node]);
      } catch (_e) {
      }
      const errorMsg = err && err.message ? err.message : String(err);
      const enrichedError = new Error(`[Erreur sur "${node.name}" (${node.type})] ${errorMsg}`);
      enrichedError.nodeEnriched = true;
      throw enrichedError;
    }
  }

  // src/plugin/main.js
  figma.showUI(__html__, { width: 650, height: 750 });
  figma.ui.onmessage = async (msg) => {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({ type: "error", message: "Veuillez s\xE9lectionner au moins une frame." });
      return;
    }
    if (msg.type === "generate") {
      try {
        const opts = Object.assign({}, DEFAULT_OPTIONS, msg.options || {});
        const context = createContext(opts);
        let result;
        if (opts.responsive && selection.length > 1) {
          result = await processResponsive(selection, context);
        } else {
          result = await processNode(selection[0], "NONE", true, context);
        }
        let tokensCSS = "";
        if (opts.designTokens) {
          tokensCSS = generateDesignTokens(context);
        }
        let finalCss = BASE_CSS + result.css;
        if (context.keyframeCss) finalCss += "\n" + context.keyframeCss;
        finalCss = deduplicateCss(finalCss);
        let fontsLink = "";
        if (opts.googleFonts && context.fonts.size > 0) {
          fontsLink = buildGoogleFontsLink(context.fonts);
        }
        var componentDataJs = buildComponentDataJs(context.componentRegistry);
        if (componentDataJs) context.js += componentDataJs;
        figma.ui.postMessage({
          type: "success",
          html: result.html,
          css: finalCss,
          js: context.js,
          tokensCSS,
          fontsLink,
          imageAssets: context.imageAssets,
          svgAssets: context.svgAssets
        });
      } catch (err) {
        const errorMsg = err && err.message ? err.message : String(err);
        figma.ui.postMessage({ type: "error", message: errorMsg });
      }
    } else if (msg.type === "debug") {
      try {
        const debugData = await extractNodeData(selection[0]);
        figma.ui.postMessage({ type: "debug-success", data: debugData });
      } catch (err) {
        const errorMsg = err && err.message ? err.message : String(err);
        figma.ui.postMessage({ type: "error", message: errorMsg });
      }
    }
  };
})();

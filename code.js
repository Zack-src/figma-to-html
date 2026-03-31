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
    altText: true,
    minifyCss: false
  };
  function createContext(opts) {
    return {
      js: "",
      opts,
      fonts: /* @__PURE__ */ new Set(),
      fontWeights: /* @__PURE__ */ new Map(),
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
      componentRegistry: /* @__PURE__ */ new Map(),
      nodeCount: 0,
      processedCount: 0
    };
  }

  // src/plugin/utils.js
  function rgbaToCss(color, opacity = 1) {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const a = ("a" in color ? color.a : 1) * opacity;
    if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
    return `rgba(${r}, ${g}, ${b}, ${parseFloat(a.toFixed(3))})`;
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
    let parentBase = null;
    if (node.parent && node.parent.type !== "PAGE" && node.parent.type !== "DOCUMENT") {
      parentBase = context.classNameMap.get(node.parent.id);
    }
    const fullKey = parentBase ? parentBase + "__" + base : base;
    if (!context.classNameCounters.has(fullKey)) {
      context.classNameCounters.set(fullKey, 0);
      context.classNameMap.set(node.id, fullKey);
      return fullKey;
    }
    const count = context.classNameCounters.get(fullKey) + 1;
    context.classNameCounters.set(fullKey, count);
    const uniqueName = fullKey + "--" + count;
    context.classNameMap.set(node.id, fullKey);
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
    "cta": "button",
    "input": "input",
    "champ": "input",
    "field": "input",
    "textbox": "input",
    "textarea": "textarea",
    "ul": "ul",
    "ol": "ol",
    "list": "ul",
    "liste": "ul",
    "li": "li",
    "item": "li",
    "list-item": "li"
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
  function mapLetterSpacing(node) {
    if (!("letterSpacing" in node) || node.letterSpacing === figma.mixed) return null;
    const ls = node.letterSpacing;
    if (ls.unit === "PIXELS" && ls.value !== 0) return `letter-spacing: ${ls.value}px;`;
    if (ls.unit === "PERCENT" && ls.value !== 0) return `letter-spacing: ${(ls.value / 100).toFixed(3)}em;`;
    return null;
  }
  function mapTextDecoration(node) {
    if (!("textDecoration" in node) || node.textDecoration === figma.mixed) return null;
    switch (node.textDecoration) {
      case "UNDERLINE":
        return "text-decoration: underline;";
      case "STRIKETHROUGH":
        return "text-decoration: line-through;";
      default:
        return null;
    }
  }
  function mapTextCase(node) {
    if (!("textCase" in node) || node.textCase === figma.mixed) return null;
    switch (node.textCase) {
      case "UPPER":
        return "text-transform: uppercase;";
      case "LOWER":
        return "text-transform: lowercase;";
      case "TITLE":
        return "text-transform: capitalize;";
      default:
        return null;
    }
  }
  function getRotationCss(node) {
    if ("rotation" in node && node.rotation !== 0) {
      return "transform: rotate(" + -node.rotation + "deg);";
    }
    if ("relativeTransform" in node) {
      try {
        var m = node.relativeTransform;
        var angle = Math.atan2(m[1][0], m[0][0]) * (180 / Math.PI);
        if (Math.abs(angle) > 0.1) {
          return "transform: rotate(" + angle.toFixed(2) + "deg);";
        }
      } catch (_e) {
      }
    }
    return null;
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
    const minVw = 320;
    const maxVw = 1440;
    const minSize = Math.max(12, Math.round(sizePx * 0.65));
    const maxSize = sizePx;
    const slope = (maxSize - minSize) / (maxVw - minVw);
    const intercept = minSize - slope * minVw;
    const preferred = (slope * 100).toFixed(4) + "vw + " + intercept.toFixed(2) + "px";
    return `clamp(${minSize}px, ${preferred}, ${maxSize}px)`;
  }
  function needsPositionRelative(node) {
    if ("children" in node && node.children) {
      for (const child of node.children) {
        if (child.layoutPositioning === "ABSOLUTE") return true;
      }
    }
    if ("children" in node && node.children && node.children.length > 0) {
      if (!("layoutMode" in node) || node.layoutMode === "NONE") {
        if (node.type !== "PAGE" && node.type !== "DOCUMENT") return true;
      }
    }
    return false;
  }
  function isPureImageNode(node) {
    if ("children" in node && node.children && node.children.length > 0) return false;
    if (!("fills" in node) || !Array.isArray(node.fills)) return false;
    const visible = node.fills.filter((f) => f.visible !== false);
    return visible.length === 1 && visible[0].type === "IMAGE" && visible[0].imageHash;
  }
  function getTextOverflowCss(node) {
    if ("textTruncation" in node && node.textTruncation === "ENDING") {
      return ["overflow: hidden;", "text-overflow: ellipsis;", "white-space: nowrap;"];
    }
    return [];
  }

  // src/plugin/css.js
  function collectColorToken(color, opacity, context, styleName) {
    const css = rgbaToCss(color, opacity);
    const key = css;
    if (!context.colors.has(key)) {
      let name;
      if (styleName) {
        name = "--" + sanitizeName(styleName);
      } else {
        const idx = context.colors.size + 1;
        name = "--color-" + idx;
      }
      context.colors.set(key, { name, value: css, hex: rgbaToHex(color) });
    }
    return context.colors.get(key).name;
  }
  function collectTextToken(family, size, weight, context) {
    const key = family + "-" + size + "-" + weight;
    if (!context.textStyles.has(key)) {
      const idx = context.textStyles.size + 1;
      const name = "--font-" + idx;
      context.textStyles.set(key, { name, family, size, weight });
    }
    return context.textStyles.get(key).name;
  }
  function generateDesignTokens(context) {
    if (context.colors.size === 0 && context.textStyles.size === 0) return "";
    let css = ":root {\n";
    for (const [, val] of context.colors) {
      css += "  " + val.name + ": " + val.value + ";\n";
    }
    for (const [, val] of context.textStyles) {
      css += "  " + val.name + "-family: '" + val.family + "', sans-serif;\n";
      css += "  " + val.name + "-size: " + val.size + "px;\n";
      css += "  " + val.name + "-weight: " + val.weight + ";\n";
    }
    css += "}\n";
    return css;
  }
  function buildGoogleFontsLink(fontsSet, fontWeights) {
    const families = Array.from(fontsSet).map(function(f) {
      var weights = fontWeights && fontWeights.has(f) ? Array.from(fontWeights.get(f)).sort().join(";") : "400";
      return "family=" + encodeURIComponent(f).replace(/%20/g, "+") + ":wght@" + weights;
    }).join("&");
    return '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?' + families + '&display=swap" rel="stylesheet">';
  }
  function shouldUseGrid(node, context) {
    if (!context.opts.cssGrid) return false;
    if (!("layoutMode" in node) || node.layoutMode === "NONE") return false;
    if (node.layoutWrap !== "WRAP") return false;
    if (!("children" in node) || node.children.length < 3) return false;
    const widths = node.children.filter(function(c) {
      return c.visible;
    }).map(function(c) {
      return Math.round(c.width);
    });
    if (widths.length < 2) return false;
    const avg = widths.reduce(function(a, b) {
      return a + b;
    }, 0) / widths.length;
    return widths.every(function(w) {
      return Math.abs(w - avg) / avg < 0.15;
    });
  }
  function deduplicateCss(cssString) {
    var blocks = [];
    var pseudoBlocks = [];
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
                if (selector.indexOf("::") !== -1) {
                  pseudoBlocks.push({ selector, body });
                } else {
                  blocks.push({ selector, body });
                }
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
    for (var p = 0; p < pseudoBlocks.length; p++) {
      out += pseudoBlocks[p].selector + " {\n  " + pseudoBlocks[p].body + "\n}\n";
    }
    for (var m = 0; m < mediaBlocks.length; m++) out += mediaBlocks[m] + "\n";
    for (var l = 0; l < otherLines.length; l++) out += otherLines[l] + "\n";
    return out;
  }
  function minifyCss(cssString) {
    return cssString.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s*\n\s*/g, "").replace(/\s*{\s*/g, "{").replace(/\s*}\s*/g, "}").replace(/\s*:\s*/g, ":").replace(/\s*;\s*/g, ";").replace(/;}/g, "}").replace(/\s*,\s*/g, ",").trim();
  }
  var BASE_CSS = "*{box-sizing:border-box;}\nbody{margin:0;padding:20px;background-color:#f5f5f5;display:flex;justify-content:center;align-items:flex-start;}\ndiv,p{margin:0;}\nsvg{display:block;width:100%;height:100%;}\n";

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
      cssRules.push("position: absolute;");
      cssRules.push("left: " + left + "px;");
      cssRules.push("top: " + top + "px;");
    } else if (isRoot) {
      cssRules.push("position: relative;");
      cssRules.push("margin: 0 auto;");
    } else if (needsPositionRelative(node)) {
      cssRules.push("position: relative;");
    }
    if (isAbsolute) {
      if ("width" in node) cssRules.push("width: " + node.width + "px;");
      if ("height" in node) cssRules.push("height: " + node.height + "px;");
    } else if (parentLayoutMode !== "NONE") {
      applySizingRules(node, parentLayoutMode, cssRules);
    } else {
      if ("width" in node) cssRules.push("width: " + node.width + "px;");
      if ("height" in node) cssRules.push("height: " + node.height + "px;");
    }
    cssRules.push("cursor: pointer;");
    if (cssRules.length > 0) css += "." + className + " {\n  " + cssRules.join("\n  ") + "\n}\n";
    html += '<div id="' + wrapperId + '" class="' + className + ' interactive-wrapper">\n';
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
    var mouseleaveAdded = false;
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
          localTransitionInline = "transition: opacity " + dur + "s " + eas + ";";
          if (currentVariantId === initialVariantId) firstTransitionCss = localTransitionInline;
        }
        let eventType = "click";
        if (react.trigger && (react.trigger.type === "ON_HOVER" || react.trigger.type === "MOUSE_ENTER")) eventType = "mouseenter";
        else if (react.trigger && react.trigger.type === "MOUSE_LEAVE") eventType = "mouseleave";
        else if (react.trigger && react.trigger.type === "ON_DRAG" && context.opts.extraTriggers) eventType = "mousedown";
        else if (react.trigger && react.trigger.type === "WHILE_PRESSING" && context.opts.extraTriggers) eventType = "mousedown";
        context.js += "\ndocument.querySelector('#" + wrapperId + ' .interactive-state[data-state-id="' + currentVariantId + `"]').addEventListener('` + eventType + "', function(e) {\n  e.stopPropagation();\n  var wrapper = document.getElementById('" + wrapperId + `');
  wrapper.querySelectorAll('.interactive-state').forEach(function(el) { el.classList.add('inactive-state'); });
  wrapper.querySelector('.interactive-state[data-state-id="` + destId + `"]').classList.remove('inactive-state');
});
`;
        if (react.trigger && react.trigger.type === "WHILE_PRESSING" && context.opts.extraTriggers) {
          context.js += "\ndocument.querySelector('#" + wrapperId + ' .interactive-state[data-state-id="' + currentVariantId + `"]').addEventListener('mouseup', function(e) {
  var wrapper = document.getElementById('` + wrapperId + `');
  wrapper.querySelectorAll('.interactive-state').forEach(function(el) { el.classList.add('inactive-state'); });
  wrapper.querySelector('.interactive-state[data-state-id="` + currentVariantId + `"]').classList.remove('inactive-state');
});
`;
        }
        if (react.trigger && react.trigger.type === "AFTER_DELAY" && context.opts.extraTriggers) {
          const delayMs = (react.trigger.delay || 1) * 1e3;
          context.js += "\nsetTimeout(function() {\n  var wrapper = document.getElementById('" + wrapperId + `');
  if (wrapper) {
    wrapper.querySelectorAll('.interactive-state').forEach(function(el) { el.classList.add('inactive-state'); });
    var dest = wrapper.querySelector('.interactive-state[data-state-id="` + destId + `"]');
    if (dest) dest.classList.remove('inactive-state');
  }
}, ` + delayMs + ");\n";
        }
        if (react.trigger && react.trigger.type === "ON_HOVER" && !mouseleaveAdded) {
          mouseleaveAdded = true;
          context.js += "\ndocument.querySelector('#" + wrapperId + "').addEventListener('mouseleave', function(e) {\n  var wrapper = document.getElementById('" + wrapperId + `');
  wrapper.querySelectorAll('.interactive-state').forEach(function(el) { el.classList.add('inactive-state'); });
  wrapper.querySelector('.interactive-state[data-state-id="` + initialVariantId + `"]').classList.remove('inactive-state');
});
`;
        }
      }
      if (!localTransitionInline) localTransitionInline = firstTransitionCss;
      htmlStates += '<div class="interactive-state ' + activeClass + '" data-state-id="' + currentVariantId + '" style="' + localTransitionInline + '">\n' + stateResult.html + "</div>\n";
    }
    extractionNode.remove();
    css += ".interactive-wrapper { position: relative; }\n";
    css += ".interactive-state { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 1; pointer-events: auto; }\n";
    css += ".interactive-state.active-state { position: relative; }\n";
    css += ".interactive-state.inactive-state { opacity: 0; pointer-events: none; }\n";
    html += htmlStates + "</div>\n";
    return { html, css };
  }

  // src/plugin/process.js
  function mapScaleMode(scaleMode) {
    switch (scaleMode) {
      case "FIT":
        return "contain";
      case "TILE":
        return "repeat";
      case "CROP":
      case "FILL":
      default:
        return "cover";
    }
  }
  function buildGradientCss(fill) {
    const stops = fill.gradientStops.map(
      (s) => rgbaToCss(s.color) + " " + Math.round(s.position * 100) + "%"
    ).join(", ");
    if (fill.type === "GRADIENT_RADIAL") {
      return "radial-gradient(ellipse at center, " + stops + ")";
    }
    if (fill.type === "GRADIENT_ANGULAR" || fill.type === "GRADIENT_DIAMOND") {
      return "conic-gradient(" + stops + ")";
    }
    const t = fill.gradientTransform;
    const angleRad = Math.atan2(t[1][0], t[0][0]);
    const angleDeg = Math.round(angleRad * (180 / Math.PI));
    return "linear-gradient(" + (angleDeg + 90) + "deg, " + stops + ")";
  }
  function getFillStyleName(node) {
    try {
      if ("fillStyleId" in node && node.fillStyleId && node.fillStyleId !== figma.mixed) {
        var style = figma.getStyleById(node.fillStyleId);
        if (style && style.name) return style.name;
      }
    } catch (_e) {
    }
    return null;
  }
  async function processNode(node, parentLayoutMode = "NONE", isRoot = false, context = { js: "", opts: DEFAULT_OPTIONS }, isVariantState = false) {
    try {
      if (!node.visible) return { html: "", css: "" };
      const opts = context.opts;
      let html = "";
      let css = "";
      const className = getClassName(node, context);
      const cssRules = [];
      const isText = node.type === "TEXT";
      const hasReactions = node.reactions && node.reactions.length > 0;
      let externalUrl = null;
      if (opts.externalLinks && hasReactions) {
        const urlReaction = node.reactions.find((r) => r.action && r.action.type === "URL");
        if (urlReaction && urlReaction.action.url) {
          externalUrl = urlReaction.action.url;
        }
      }
      if (externalUrl || hasReactions && node.reactions.some((r) => r.action)) {
        cssRules.push("cursor: pointer;");
      }
      if (!isVariantState && node.type === "INSTANCE" && hasReactions) {
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
            context.componentRegistry.set(compId, { name: compName, instances: [{ nodeId: node.id, texts }] });
            var firstResult = await processNode(node, parentLayoutMode, isRoot, context, true);
            return { html: "<!-- component: " + compName + " -->\n" + firstResult.html, css: firstResult.css };
          }
        }
      }
      if (opts.keyframeAnim && !isVariantState && hasReactions) {
        for (const react of node.reactions) {
          if (react.action && react.action.transition && react.action.transition.type === "SMART_ANIMATE") {
            const dur = react.action.transition.duration || 0.3;
            const eas = mapEasingToCss(react.action.transition.easing);
            const animName = "anim-" + ++context.keyframeCounter;
            var fromProps = [];
            var toProps = [];
            if (react.action.destinationId) {
              try {
                var destNode = await figma.getNodeByIdAsync(react.action.destinationId);
                if (destNode) {
                  if (Math.abs(node.opacity - destNode.opacity) > 0.01) {
                    fromProps.push("opacity: " + node.opacity);
                    toProps.push("opacity: " + destNode.opacity);
                  }
                  if (Math.abs(node.x - destNode.x) > 1 || Math.abs(node.y - destNode.y) > 1) {
                    fromProps.push("transform: translate(" + node.x + "px, " + node.y + "px)");
                    toProps.push("transform: translate(" + destNode.x + "px, " + destNode.y + "px)");
                  }
                  if ("rotation" in node && "rotation" in destNode && Math.abs(node.rotation - destNode.rotation) > 0.1) {
                    fromProps.push("transform: rotate(" + -node.rotation + "deg)");
                    toProps.push("transform: rotate(" + -destNode.rotation + "deg)");
                  }
                }
              } catch (_e) {
              }
            }
            if (fromProps.length === 0) {
              fromProps.push("opacity: 0", "transform: translateY(10px)");
              toProps.push("opacity: 1", "transform: translateY(0)");
            }
            context.keyframeCss += "@keyframes " + animName + " {\n  from { " + fromProps.join("; ") + "; }\n  to { " + toProps.join("; ") + "; }\n}\n";
            cssRules.push("animation: " + animName + " " + dur + "s " + eas + " both;");
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
        cssRules.push("position: absolute;");
        cssRules.push("left: " + left + "px;");
        cssRules.push("top: " + top + "px;");
      } else if (isRoot) {
        cssRules.push("position: relative;");
        cssRules.push("margin: 0 auto;");
      } else if (needsPositionRelative(node)) {
        cssRules.push("position: relative;");
      }
      var rotCss = getRotationCss(node);
      if (rotCss) cssRules.push(rotCss);
      if (isPureImageNode(node)) {
        const imageFill = node.fills.filter((f) => f.visible !== false)[0];
        const image = figma.getImageByHash(imageFill.imageHash);
        if (image) {
          try {
            const bytes = await image.getBytesAsync();
            const base64 = figma.base64Encode(bytes);
            const ext = opts.imageFormat === "avif" ? "avif" : opts.imageFormat === "png-file" ? "png" : "webp";
            var imgFn;
            var ck = imageFill.imageHash + "." + ext;
            if (context.imageCache.has(ck)) {
              imgFn = context.imageCache.get(ck);
            } else {
              imgFn = "img-" + ++context.imageCounter + "." + ext;
              context.imageCache.set(ck, imgFn);
              context.imageAssets.push({ filename: imgFn, base64 });
            }
            if (isAbsolute) {
              if ("width" in node) cssRules.push("width: " + node.width + "px;");
              if ("height" in node) cssRules.push("height: " + node.height + "px;");
            } else if (parentLayoutMode !== "NONE") {
              applySizingRules(node, parentLayoutMode, cssRules);
            } else {
              if ("width" in node) cssRules.push("width: " + node.width + "px;");
              if ("height" in node) cssRules.push("height: " + node.height + "px;");
            }
            cssRules.push("object-fit: " + mapScaleMode(imageFill.scaleMode) + ";");
            if (cssRules.length > 0) css += "." + className + " {\n  " + cssRules.join("\n  ") + "\n}\n";
            var alt = getAltText(node, context);
            var ariaA = getAriaAttrs(node, context);
            var src = opts.imageFormat === "base64-png" ? "data:image/png;base64," + base64 : "assets/" + imgFn;
            return { html: '<img src="' + src + '" alt="' + alt + '" class="' + className + '"' + ariaA + ">\n", css };
          } catch (_e) {
          }
        }
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
            if ("width" in node) cssRules.push("width: " + node.width + "px;");
            if ("height" in node) cssRules.push("height: " + node.height + "px;");
          } else if (parentLayoutMode !== "NONE") {
            applySizingRules(node, parentLayoutMode, cssRules);
          } else {
            if ("width" in node) cssRules.push("width: " + node.width + "px;");
            if ("height" in node) cssRules.push("height: " + node.height + "px;");
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
            if (cssRules.length > 0) css += "." + className + " {\n  " + cssRules.join("\n  ") + "\n}\n";
            return { html: '<img src="assets/' + svgFilename + '" alt="' + altText + '" class="' + className + '"' + ariaAttrs + ">\n", css };
          } else {
            if (cssRules.length > 0) css += "." + className + " {\n  " + cssRules.join("\n  ") + "\n}\n";
            return { html: '<div class="' + className + '"' + ariaAttrs + ">" + svgString + "</div>\n", css };
          }
        } catch (_svgErr) {
          console.warn('[Plugin] SVG export failed for "' + node.name + '", falling back to div.');
        }
      }
      if ("opacity" in node && node.opacity < 1) {
        cssRules.push("opacity: " + node.opacity + ";");
      }
      if ("fills" in node && Array.isArray(node.fills)) {
        const visibleFills = node.fills.filter((f) => f.visible !== false);
        const imageFills = visibleFills.filter((f) => f.type === "IMAGE");
        const gradientFills = visibleFills.filter((f) => f.type && f.type.indexOf("GRADIENT") === 0);
        const solidFills = visibleFills.filter((f) => f.type === "SOLID");
        if (imageFills.length > 0) {
          const imageFill = imageFills[0];
          if (imageFill.imageHash) {
            const image = figma.getImageByHash(imageFill.imageHash);
            if (image) {
              try {
                const bytes = await image.getBytesAsync();
                const base64 = figma.base64Encode(bytes);
                const imageOpacity = imageFill.opacity !== void 0 ? imageFill.opacity : 1;
                const bgSize = mapScaleMode(imageFill.scaleMode);
                if (opts.imageFormat === "base64-png") {
                  if (imageOpacity < 1) {
                    css += "." + className + `::before {
  content: "";
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background-image: url('data:image/png;base64,` + base64 + "');\n  background-size: " + bgSize + ";\n  background-position: center;\n  opacity: " + imageOpacity + ";\n  z-index: -1;\n  border-radius: inherit;\n  pointer-events: none;\n}\n";
                    if (!cssRules.some((r) => r.startsWith("position:"))) cssRules.push("position: relative;");
                  } else {
                    cssRules.push("background-image: url('data:image/png;base64," + base64 + "');");
                    cssRules.push("background-size: " + bgSize + ";");
                    cssRules.push("background-position: center;");
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
                    css += "." + className + `::before {
  content: "";
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background-image: url('assets/` + imgFilename + "');\n  background-size: " + bgSize + ";\n  background-position: center;\n  opacity: " + imageOpacity + ";\n  z-index: -1;\n  border-radius: inherit;\n  pointer-events: none;\n}\n";
                    if (!cssRules.some((r) => r.startsWith("position:"))) cssRules.push("position: relative;");
                  } else {
                    cssRules.push("background-image: url('assets/" + imgFilename + "');");
                    cssRules.push("background-size: " + bgSize + ";");
                    cssRules.push("background-position: center;");
                  }
                }
              } catch (_imgErr) {
                console.error("[Plugin] Image fetch failed for " + node.name);
              }
            }
          }
        }
        if (gradientFills.length > 0) {
          const gradCss = gradientFills.map((g) => buildGradientCss(g)).join(", ");
          if (isText) {
            cssRules.push("background: " + gradCss + ";");
            cssRules.push("-webkit-background-clip: text;");
            cssRules.push("-webkit-text-fill-color: transparent;");
          } else if (imageFills.length === 0) {
            cssRules.push("background: " + gradCss + ";");
          }
        }
        if (solidFills.length > 0 && imageFills.length === 0 && gradientFills.length === 0) {
          const solidFill = solidFills[solidFills.length - 1];
          const styleName = getFillStyleName(node);
          if (opts.designTokens) {
            const tokenName = collectColorToken(solidFill.color, solidFill.opacity, context, styleName);
            cssRules.push(isText ? "color: var(" + tokenName + ");" : "background-color: var(" + tokenName + ");");
          } else {
            const colorVal = rgbaToCss(solidFill.color, solidFill.opacity);
            cssRules.push(isText ? "color: " + colorVal + ";" : "background-color: " + colorVal + ";");
          }
        }
      }
      if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
        const solidStroke = node.strokes.find((s) => s.type === "SOLID" && s.visible !== false);
        if (solidStroke) {
          const strokeColor = rgbaToCss(solidStroke.color, solidStroke.opacity);
          const align = "strokeAlign" in node ? node.strokeAlign : "CENTER";
          if ("strokeWeight" in node && node.strokeWeight !== figma.mixed) {
            const w = node.strokeWeight;
            if (align === "INSIDE") {
              cssRules.push("box-shadow: inset 0 0 0 " + w + "px " + strokeColor + ";");
            } else if (align === "OUTSIDE") {
              cssRules.push("outline: " + w + "px solid " + strokeColor + ";");
              cssRules.push("outline-offset: 0;");
            } else {
              cssRules.push("border: " + w + "px solid " + strokeColor + ";");
            }
          } else {
            if (node.strokeTopWeight > 0) cssRules.push("border-top: " + node.strokeTopWeight + "px solid " + strokeColor + ";");
            if (node.strokeRightWeight > 0) cssRules.push("border-right: " + node.strokeRightWeight + "px solid " + strokeColor + ";");
            if (node.strokeBottomWeight > 0) cssRules.push("border-bottom: " + node.strokeBottomWeight + "px solid " + strokeColor + ";");
            if (node.strokeLeftWeight > 0) cssRules.push("border-left: " + node.strokeLeftWeight + "px solid " + strokeColor + ";");
          }
        }
      }
      if ("effects" in node && Array.isArray(node.effects) && node.effects.length > 0) {
        const shadows = [];
        const textShadows = [];
        for (const e of node.effects) {
          if (!e.visible) continue;
          if (e.type === "DROP_SHADOW") {
            shadows.push(e.offset.x + "px " + e.offset.y + "px " + e.radius + "px " + (e.spread || 0) + "px " + rgbaToCss(e.color));
            textShadows.push(e.offset.x + "px " + e.offset.y + "px " + e.radius + "px " + rgbaToCss(e.color));
          } else if (e.type === "INNER_SHADOW") {
            shadows.push("inset " + e.offset.x + "px " + e.offset.y + "px " + e.radius + "px " + (e.spread || 0) + "px " + rgbaToCss(e.color));
          } else if (e.type === "LAYER_BLUR") {
            cssRules.push("filter: blur(" + e.radius + "px);");
          } else if (e.type === "BACKGROUND_BLUR") {
            cssRules.push("backdrop-filter: blur(" + e.radius + "px);");
          }
        }
        if (isText && textShadows.length > 0) cssRules.push("text-shadow: " + textShadows.join(", ") + ";");
        else if (!isText && shadows.length > 0) cssRules.push("box-shadow: " + shadows.join(", ") + ";");
      }
      if ("cornerRadius" in node && node.cornerRadius !== figma.mixed && node.cornerRadius > 0) {
        cssRules.push("border-radius: " + node.cornerRadius + "px;");
      } else if ("topLeftRadius" in node) {
        cssRules.push("border-radius: " + node.topLeftRadius + "px " + node.topRightRadius + "px " + node.bottomRightRadius + "px " + node.bottomLeftRadius + "px;");
      }
      if ("overflowDirection" in node && node.overflowDirection !== "NONE") {
        if (node.overflowDirection === "VERTICAL") {
          cssRules.push("overflow-y: auto;");
          cssRules.push("overflow-x: hidden;");
        } else if (node.overflowDirection === "HORIZONTAL") {
          cssRules.push("overflow-x: auto;");
          cssRules.push("overflow-y: hidden;");
        } else cssRules.push("overflow: auto;");
      } else if ("clipsContent" in node && node.clipsContent) {
        cssRules.push("overflow: hidden;");
      }
      if (isText) {
        cssRules.push("display: flex;");
        cssRules.push("flex-direction: column;");
        if (node.textAlignVertical === "CENTER") cssRules.push("justify-content: center;");
        else if (node.textAlignVertical === "BOTTOM") cssRules.push("justify-content: flex-end;");
        else cssRules.push("justify-content: flex-start;");
        if (node.textAlignHorizontal === "CENTER") cssRules.push("text-align: center;");
        else if (node.textAlignHorizontal === "RIGHT") cssRules.push("text-align: right;");
        else if (node.textAlignHorizontal === "JUSTIFIED") cssRules.push("text-align: justify;");
        else cssRules.push("text-align: left;");
        if (node.fontName !== figma.mixed) {
          const family = node.fontName.family;
          const weight = mapFontWeight(node.fontName.style);
          context.fonts.add(family);
          if (!context.fontWeights.has(family)) context.fontWeights.set(family, /* @__PURE__ */ new Set());
          context.fontWeights.get(family).add(weight);
          if (opts.designTokens) {
            collectTextToken(family, node.fontSize !== figma.mixed ? node.fontSize : 16, weight, context);
          }
          cssRules.push("font-family: '" + family + "', sans-serif;");
          cssRules.push("font-weight: " + weight + ";");
        }
        if (node.fontSize !== figma.mixed) {
          cssRules.push(opts.fluidTypo && node.fontSize > 14 ? "font-size: " + fluidFontSize(node.fontSize) + ";" : "font-size: " + node.fontSize + "px;");
        }
        if (node.lineHeight !== figma.mixed) {
          if (node.lineHeight.unit === "PIXELS") cssRules.push("line-height: " + node.lineHeight.value + "px;");
          else if (node.lineHeight.unit === "PERCENT") cssRules.push("line-height: " + node.lineHeight.value + "%;");
        }
        var lsCss = mapLetterSpacing(node);
        if (lsCss) cssRules.push(lsCss);
        var tdCss = mapTextDecoration(node);
        if (tdCss) cssRules.push(tdCss);
        var tcCss = mapTextCase(node);
        if (tcCss) cssRules.push(tcCss);
        getTextOverflowCss(node).forEach((r) => cssRules.push(r));
        var textContent;
        if (node.fontName === figma.mixed || node.fontSize === figma.mixed) {
          try {
            var segments = node.getStyledTextSegments(["fontName", "fontSize", "fontWeight", "fills", "textDecoration", "textCase", "letterSpacing"]);
            textContent = segments.map(function(seg) {
              var styles = [];
              if (seg.fontName) styles.push("font-family:'" + seg.fontName.family + "',sans-serif");
              if (seg.fontSize) styles.push("font-size:" + seg.fontSize + "px");
              if (seg.fontWeight) styles.push("font-weight:" + seg.fontWeight);
              if (seg.textDecoration === "UNDERLINE") styles.push("text-decoration:underline");
              if (seg.textDecoration === "STRIKETHROUGH") styles.push("text-decoration:line-through");
              var text = seg.characters.replace(/\n/g, "<br>");
              if (styles.length > 0) return '<span style="' + styles.join(";") + '">' + text + "</span>";
              return text;
            }).join("");
          } catch (_e) {
            textContent = node.characters.replace(/\n/g, "<br>");
          }
        } else {
          textContent = node.characters.replace(/\n/g, "<br>");
        }
        const tag = getSemanticTag(node, context);
        const ariaAttrs = getAriaAttrs(node, context);
        if (tag === "input") {
          if (cssRules.length > 0) css += "." + className + " {\n  " + cssRules.join("\n  ") + "\n}\n";
          html += '<input type="text" value="' + node.characters.replace(/"/g, "&quot;") + '" class="' + className + '"' + ariaAttrs + ">\n";
        } else if (tag === "textarea") {
          if (cssRules.length > 0) css += "." + className + " {\n  " + cssRules.join("\n  ") + "\n}\n";
          html += '<textarea class="' + className + '"' + ariaAttrs + ">" + node.characters + "</textarea>\n";
        } else if (externalUrl) {
          html += '<a href="' + externalUrl + '" target="_blank" rel="noopener noreferrer" class="' + className + '"' + ariaAttrs + ">" + textContent + "</a>\n";
        } else {
          html += "<" + tag + ' class="' + className + '"' + ariaAttrs + ">" + textContent + "</" + tag + ">\n";
        }
      } else {
        const tag = getSemanticTag(node, context);
        const ariaAttrs = getAriaAttrs(node, context);
        if (externalUrl) {
          html += '<a href="' + externalUrl + '" target="_blank" rel="noopener noreferrer" class="' + className + '"' + ariaAttrs + ">\n";
        } else {
          html += "<" + tag + ' class="' + className + '"' + ariaAttrs + ">\n";
        }
      }
      let currentLayoutMode = "NONE";
      if ("layoutMode" in node && node.layoutMode !== "NONE") {
        currentLayoutMode = node.layoutMode;
        if (!isText) {
          const useGrid = shouldUseGrid(node, context);
          if (useGrid) {
            const visibleKids = node.children.filter((c) => c.visible);
            const avgWidth = Math.round(visibleKids.reduce((a, c) => a + c.width, 0) / visibleKids.length);
            cssRules.push("display: grid;");
            cssRules.push("grid-template-columns: repeat(auto-fill, minmax(" + avgWidth + "px, 1fr));");
            if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) cssRules.push("column-gap: " + node.itemSpacing + "px;");
            if ("counterAxisSpacing" in node && node.counterAxisSpacing !== figma.mixed && node.counterAxisSpacing > 0) {
              cssRules.push("row-gap: " + node.counterAxisSpacing + "px;");
            } else if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) {
              cssRules.push("row-gap: " + node.itemSpacing + "px;");
            }
          } else {
            cssRules.push("display: flex;");
            cssRules.push("flex-direction: " + (node.layoutMode === "HORIZONTAL" ? "row" : "column") + ";");
            if (node.layoutWrap === "WRAP") cssRules.push("flex-wrap: wrap;");
            var hasCounter = "counterAxisSpacing" in node && node.counterAxisSpacing !== figma.mixed && node.counterAxisSpacing > 0;
            var mainGap = node.itemSpacing !== figma.mixed && node.itemSpacing > 0 ? node.itemSpacing : 0;
            if (hasCounter && node.counterAxisSpacing !== mainGap) {
              if (node.layoutMode === "HORIZONTAL") {
                if (mainGap > 0) cssRules.push("column-gap: " + mainGap + "px;");
                cssRules.push("row-gap: " + node.counterAxisSpacing + "px;");
              } else {
                if (mainGap > 0) cssRules.push("row-gap: " + mainGap + "px;");
                cssRules.push("column-gap: " + node.counterAxisSpacing + "px;");
              }
            } else if (mainGap > 0) {
              cssRules.push("gap: " + mainGap + "px;");
            }
          }
          const pt = node.paddingTop !== figma.mixed ? node.paddingTop : 0;
          const pr = node.paddingRight !== figma.mixed ? node.paddingRight : 0;
          const pb = node.paddingBottom !== figma.mixed ? node.paddingBottom : 0;
          const pl = node.paddingLeft !== figma.mixed ? node.paddingLeft : 0;
          if (pt > 0 || pr > 0 || pb > 0 || pl > 0) cssRules.push("padding: " + pt + "px " + pr + "px " + pb + "px " + pl + "px;");
          if (!useGrid) {
            cssRules.push("align-items: " + getAlign(node.counterAxisAlignItems) + ";");
            cssRules.push("justify-content: " + getAlign(node.primaryAxisAlignItems) + ";");
          }
        }
      }
      if (isAbsolute) {
        if ("width" in node) cssRules.push("width: " + node.width + "px;");
        if ("height" in node) cssRules.push("height: " + node.height + "px;");
      } else if (parentLayoutMode !== "NONE") {
        applySizingRules(node, parentLayoutMode, cssRules);
      } else {
        if ("width" in node) cssRules.push("width: " + node.width + "px;");
        if ("height" in node) cssRules.push("height: " + node.height + "px;");
      }
      if (!isText || isText && getSemanticTag(node, context) !== "input" && getSemanticTag(node, context) !== "textarea") {
        if (cssRules.length > 0) {
          css += "." + className + " {\n  " + cssRules.join("\n  ") + "\n}\n";
        }
      }
      if ("children" in node && !isText) {
        for (let ci = 0; ci < node.children.length; ci++) {
          const child = node.children[ci];
          const childResult = await processNode(child, currentLayoutMode, false, context);
          html += childResult.html;
          css += childResult.css;
          if (child.layoutPositioning === "ABSOLUTE" && ci > 0) {
            css += "." + getClassName(child, context) + " { z-index: " + (ci + 1) + "; }\n";
          }
        }
      }
      if (!isText) {
        const tag = getSemanticTag(node, context);
        html += externalUrl ? "</a>\n" : "</" + tag + ">\n";
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
      const enrichedError = new Error('[Erreur sur "' + node.name + '" (' + node.type + ")] " + errorMsg);
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
        "reactions",
        "relativeTransform"
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
  function countNodes(node) {
    var count = 1;
    if ("children" in node && node.children) {
      for (var i = 0; i < node.children.length; i++) {
        count += countNodes(node.children[i]);
      }
    }
    return count;
  }
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
        var totalNodes = 0;
        for (var s = 0; s < selection.length; s++) totalNodes += countNodes(selection[s]);
        figma.ui.postMessage({ type: "progress", current: 0, total: totalNodes });
        let result;
        if (opts.responsive && selection.length > 1) {
          result = await processResponsive(selection, context);
        } else {
          result = await processNode(selection[0], "NONE", true, context);
        }
        figma.ui.postMessage({ type: "progress", current: totalNodes, total: totalNodes });
        let tokensCSS = "";
        if (opts.designTokens) {
          tokensCSS = generateDesignTokens(context);
        }
        let finalCss = BASE_CSS + result.css;
        if (context.keyframeCss) finalCss += "\n" + context.keyframeCss;
        finalCss = deduplicateCss(finalCss);
        if (opts.minifyCss) {
          finalCss = minifyCss(finalCss);
          if (tokensCSS) tokensCSS = minifyCss(tokensCSS);
        }
        let fontsLink = "";
        if (opts.googleFonts && context.fonts.size > 0) {
          fontsLink = buildGoogleFontsLink(context.fonts, context.fontWeights);
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

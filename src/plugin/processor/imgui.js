import { sanitizeCppName } from '../lib/assets_cpp.js';

// =============================================================================
// HELPERS
// =============================================================================

function safeNum(val, fallback) {
  if (fallback === undefined) fallback = 0;
  return (typeof val === 'number') ? val : fallback;
}

/** Format number as C++ float literal */
function f(n) {
  return n.toFixed(1) + 'f';
}

/**
 * Convert Figma RGBA color + opacity to IM_COL32 string.
 * color.a (if present) is multiplied with opacity.
 */
function toImCol32(color, opacity, ctx, hint) {
  if (opacity === undefined) opacity = 1;
  var r = Math.round(color.r * 255);
  var g = Math.round(color.g * 255);
  var b = Math.round(color.b * 255);
  var a = Math.round(('a' in color ? color.a : 1) * opacity * 255);
  var key = 'IM_COL32(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
  if (ctx && ctx.cppColors) {
    if (!ctx.cppColors.has(key)) {
      ctx.cppColors.set(key, { r: r, g: g, b: b, a: a, usageHints: new Set() });
    }
    if (hint) ctx.cppColors.get(key).usageHints.add(hint);
  }
  return key;
}

/** Screen-position ImVec2 using __BX/__BY placeholders */
function pos(x, y) {
  return 'ImVec2(__BX + ' + f(x) + ', __BY + ' + f(y) + ')';
}

/** Compute corner rounding value + ImDrawFlags */
function getCornerRounding(node) {
  var rounding = 0;
  var flags = '';
  var cr = node.cornerRadius;
  if (cr !== undefined && cr !== 0 && typeof cr === 'number') {
    rounding = cr;
  } else {
    var tl = safeNum(node.topLeftRadius, 0);
    var tr = safeNum(node.topRightRadius, 0);
    var br = safeNum(node.bottomRightRadius, 0);
    var bl = safeNum(node.bottomLeftRadius, 0);
    rounding = Math.max(tl, tr, br, bl);
    if (rounding > 0) {
      var parts = [];
      if (tl > 0) parts.push('ImDrawFlags_RoundCornersTopLeft');
      if (tr > 0) parts.push('ImDrawFlags_RoundCornersTopRight');
      if (br > 0) parts.push('ImDrawFlags_RoundCornersBottomRight');
      if (bl > 0) parts.push('ImDrawFlags_RoundCornersBottomLeft');
      if (parts.length < 4) flags = parts.join(' | ');
    }
  }
  return { rounding: rounding, flags: flags };
}

function hasImageFill(node) {
  return node.fills && node.fills.some(function(fl) { return fl.type === 'IMAGE' && fl.visible !== false; });
}

// =============================================================================
// NODE PROCESSING
//
// Coordinate model:
//   absX / absY = absolute offset from root frame origin.
//   In Figma Plugin API, node.x / node.y are relative to the parent.
//   We accumulate: child.absX = parent.absX + child.x
//   Generated code uses __BX/__BY placeholders replaced later:
//     root  → __O.x / __O.y  (window content origin)
//     comp  → __bx  / __by   (component function params)
// =============================================================================

/**
 * Main entry point: process a Figma node tree into ImGui C++ code.
 *
 * @param {SceneNode} node   Figma node
 * @param {object}    ctx    Generation context
 * @param {string}    indent Current indentation
 * @param {number}    absX   Absolute X from root frame origin
 * @param {number}    absY   Absolute Y from root frame origin
 */
export async function processNodeToImGui(node, ctx, indent, absX, absY) {
  if (indent === undefined) indent = '    ';
  if (absX === undefined) absX = 0;
  if (absY === undefined) absY = 0;

  if (!node.visible) return '';

  var type = node.type;

  // ── Component / Instance → separate function ─────────────────────────────
  if (type === 'COMPONENT' || type === 'INSTANCE') {
    return await renderComponent(node, ctx, indent, absX, absY);
  }

  var code = indent + '// ' + (node.name || type) + '\n';

  if (type === 'TEXT') {
    code += renderText(node, ctx, indent, absX, absY);
  } else if (type === 'ELLIPSE') {
    code += renderEllipse(node, ctx, indent, absX, absY);
  } else if (type === 'LINE') {
    code += renderLine(node, ctx, indent, absX, absY);
  } else if (type === 'FRAME' || type === 'GROUP' || type === 'RECTANGLE' ||
             type === 'SECTION' || type === 'BOOLEAN_OPERATION' || type === 'COMPONENT_SET') {
    code += await renderBox(node, ctx, indent, absX, absY);
  } else if (type === 'VECTOR' || type === 'POLYGON' || type === 'STAR') {
    if (hasImageFill(node)) {
      code += await renderImageFill(node, ctx, indent, absX, absY);
    } else {
      code += await renderBox(node, ctx, indent, absX, absY);
    }
  } else {
    // Fallback: try to render as a box if it has any visual properties
    if (node.fills || node.strokes) {
      code += await renderBox(node, ctx, indent, absX, absY);
    } else {
      code += indent + '// unsupported: ' + type + '\n';
    }
  }

  return code;
}

/**
 * Process all children. Each child's absolute position =
 * parent's absolute position + child's relative position (Figma API).
 */
async function processChildren(node, ctx, indent, parentAbsX, parentAbsY) {
  if (!node.children || node.children.length === 0) return '';
  var out = '';
  for (var i = 0; i < node.children.length; i++) {
    var child = node.children[i];
    out += await processNodeToImGui(
      child, ctx, indent,
      parentAbsX + child.x,
      parentAbsY + child.y
    );
  }
  return out;
}

// =============================================================================
// RENDERERS
// =============================================================================

async function renderComponent(node, ctx, indent, absX, absY) {
  var compName = 'Render' + sanitizeCppName(node.name || 'Component');

  if (!ctx.cppComponents.has(compName)) {
    ctx.cppComponents.set(compName, ''); // guard against recursion
    // Generate the component body at local origin (0,0).
    // renderBox draws the node's own fills/strokes AND its children.
    var body = await renderBox(node, ctx, '    ', 0, 0);
    ctx.cppComponents.set(compName, buildComponentFunction(compName, body));
  }

  var out = indent + '// ' + (node.name || 'Component') + '\n';
  out += indent + compName + '(__BX + ' + f(absX) + ', __BY + ' + f(absY) + ');\n';
  return out;
}

/**
 * Render a rectangular node: fills, strokes, effects, children.
 * Used for FRAME, GROUP, RECTANGLE, SECTION, BOOLEAN_OPERATION, VECTOR, etc.
 */
async function renderBox(node, ctx, indent, absX, absY) {
  var opacity = safeNum(node.opacity, 1);
  var w = safeNum(node.width, 0);
  var h = safeNum(node.height, 0);
  var cr = getCornerRounding(node);
  var rounding = cr.rounding;
  var roundFlags = cr.flags;
  var out = '';

  // ── Drop shadows (behind everything) ──────────────────────────────────────
  if (node.effects) {
    for (var ei = 0; ei < node.effects.length; ei++) {
      var eff = node.effects[ei];
      if (eff.visible === false || eff.type !== 'DROP_SHADOW') continue;
      var sCol = toImCol32(eff.color, safeNum(eff.color.a, 0.25), ctx, 'shadow');
      var ox = safeNum(eff.offset.x, 0);
      var oy = safeNum(eff.offset.y, 0);
      var sr = safeNum(eff.radius, 0);
      var sp = safeNum(eff.spread, 0);
      out += indent + '__dl->AddRectFilled(';
      out += pos(absX + ox - sr - sp, absY + oy - sr - sp) + ', ';
      out += pos(absX + w + ox + sr + sp, absY + h + oy + sr + sp) + ', ';
      out += sCol + ', ' + f(rounding + sr) + ');\n';
    }
  }

  // ── Fills ─────────────────────────────────────────────────────────────────
  if (node.fills) {
    for (var i = 0; i < node.fills.length; i++) {
      var fill = node.fills[i];
      if (fill.visible === false) continue;

      if (fill.type === 'SOLID') {
        var col = toImCol32(fill.color, safeNum(fill.opacity, 1) * opacity, ctx, 'fill');
        out += indent + '__dl->AddRectFilled(';
        out += pos(absX, absY) + ', ' + pos(absX + w, absY + h) + ', ';
        out += col + ', ' + f(rounding) + (roundFlags ? ', ' + roundFlags : '') + ');\n';

      } else if (fill.type === 'GRADIENT_LINEAR' && fill.gradientStops && fill.gradientStops.length >= 2) {
        var stops = fill.gradientStops;
        var gt = fill.gradientTransform;
        var angle = gt ? Math.atan2(gt[1][0], gt[0][0]) : 0;
        var fillOp = safeNum(fill.opacity, 1) * opacity;
        var c0 = toImCol32(stops[0].color, fillOp, ctx, 'gradient');
        var c1 = toImCol32(stops[stops.length - 1].color, fillOp, ctx, 'gradient');
        var colTL, colTR, colBL, colBR;
        if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) {
          var lc = Math.cos(angle) >= 0 ? c0 : c1;
          var rc = Math.cos(angle) >= 0 ? c1 : c0;
          colTL = lc; colTR = rc; colBL = lc; colBR = rc;
        } else {
          var tc = Math.sin(angle) >= 0 ? c0 : c1;
          var bc = Math.sin(angle) >= 0 ? c1 : c0;
          colTL = tc; colTR = tc; colBL = bc; colBR = bc;
        }
        out += indent + '__dl->AddRectFilledMultiColor(';
        out += pos(absX, absY) + ', ' + pos(absX + w, absY + h) + ', ';
        out += colTL + ', ' + colTR + ', ' + colBR + ', ' + colBL + ');\n';

      } else if (fill.type && fill.type.indexOf('GRADIENT') === 0 && fill.gradientStops && fill.gradientStops.length > 0) {
        // Non-linear gradient: use first stop as solid fallback
        var gs = fill.gradientStops[0];
        var fc = toImCol32(gs.color, safeNum(fill.opacity, 1) * opacity, ctx, 'gradient');
        out += indent + '__dl->AddRectFilled(';
        out += pos(absX, absY) + ', ' + pos(absX + w, absY + h) + ', ';
        out += fc + ', ' + f(rounding) + (roundFlags ? ', ' + roundFlags : '') + ');\n';

      } else if (fill.type === 'IMAGE') {
        out += await emitImageFill(node, fill, ctx, indent, absX, absY, w, h);
      }
    }
  }

  // ── Inner shadows (after fills, before strokes) ───────────────────────────
  if (node.effects) {
    for (var isi = 0; isi < node.effects.length; isi++) {
      var ie = node.effects[isi];
      if (ie.visible === false || ie.type !== 'INNER_SHADOW') continue;
      var iCol = toImCol32(ie.color, safeNum(ie.color.a, 0.25), ctx, 'inner-shadow');
      var iox = safeNum(ie.offset.x, 0);
      var ioy = safeNum(ie.offset.y, 0);
      var ir = safeNum(ie.radius, 0);
      out += indent + '__dl->PushClipRect(' + pos(absX, absY) + ', ' + pos(absX + w, absY + h) + ', true);\n';
      out += indent + '__dl->AddRect(';
      out += pos(absX + iox, absY + ioy) + ', ' + pos(absX + w + iox, absY + h + ioy) + ', ';
      out += iCol + ', ' + f(rounding) + ', 0, ' + f(ir * 2) + ');\n';
      out += indent + '__dl->PopClipRect();\n';
    }
  }

  // ── Strokes ───────────────────────────────────────────────────────────────
  if (node.strokes) {
    for (var j = 0; j < node.strokes.length; j++) {
      var stroke = node.strokes[j];
      if (stroke.visible === false) continue;
      if (stroke.type === 'SOLID') {
        var sc = toImCol32(stroke.color, safeNum(stroke.opacity, 1) * opacity, ctx, 'stroke');
        var sw = safeNum(node.strokeWeight, 1);
        out += indent + '__dl->AddRect(';
        out += pos(absX, absY) + ', ' + pos(absX + w, absY + h) + ', ';
        out += sc + ', ' + f(rounding) + ', ' + (roundFlags || '0') + ', ' + f(sw) + ');\n';
      }
    }
  }

  // ── Children ──────────────────────────────────────────────────────────────
  // BOOLEAN_OPERATION children are geometric operands, not visual children.
  if (node.type !== 'BOOLEAN_OPERATION' && node.children && node.children.length > 0) {
    if (node.clipsContent) {
      out += indent + '__dl->PushClipRect(' + pos(absX, absY) + ', ' + pos(absX + w, absY + h) + ', true);\n';
    }
    out += await processChildren(node, ctx, indent, absX, absY);
    if (node.clipsContent) {
      out += indent + '__dl->PopClipRect();\n';
    }
  }

  return out;
}

function renderText(node, ctx, indent, absX, absY) {
  var opacity = safeNum(node.opacity, 1);
  var fill = (node.fills && node.fills.length > 0) ? node.fills[0] : null;
  var r = 1, g = 1, b = 1, a = opacity;
  if (fill && fill.color && fill.visible !== false) {
    r = fill.color.r;
    g = fill.color.g;
    b = fill.color.b;
    a = safeNum(fill.opacity, 1) * opacity;
    toImCol32(fill.color, a, ctx, 'text');
  }
  var col = 'ImVec4(' + r.toFixed(3) + 'f, ' + g.toFixed(3) + 'f, ' + b.toFixed(3) + 'f, ' + a.toFixed(3) + 'f)';

  var fontName = (node.fontName && node.fontName.family) ? node.fontName.family : 'Default';
  ctx.fonts.add(fontName);

  var fontSize = safeNum(node.fontSize, 13);
  var scale = fontSize / 13.0;

  var safeText = (node.characters || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');

  var out = '';
  out += indent + 'ImGui::SetWindowFontScale(' + f(scale) + ');\n';
  out += indent + 'ImGui::SetCursorScreenPos(' + pos(absX, absY) + ');\n';
  out += indent + 'ImGui::PushStyleColor(ImGuiCol_Text, ' + col + ');\n';
  out += indent + 'ImGui::TextUnformatted("' + safeText + '");\n';
  out += indent + 'ImGui::PopStyleColor();\n';
  out += indent + 'ImGui::SetWindowFontScale(1.0f);\n';
  return out;
}

function renderEllipse(node, ctx, indent, absX, absY) {
  var opacity = safeNum(node.opacity, 1);
  var cx = absX + node.width / 2;
  var cy = absY + node.height / 2;
  var radius = Math.min(node.width, node.height) / 2;
  var out = '';

  if (node.fills) {
    for (var i = 0; i < node.fills.length; i++) {
      var fill = node.fills[i];
      if (fill.visible === false) continue;
      if (fill.type === 'SOLID') {
        var col = toImCol32(fill.color, safeNum(fill.opacity, 1) * opacity, ctx, 'fill');
        out += indent + '__dl->AddCircleFilled(' + pos(cx, cy) + ', ' + f(radius) + ', ' + col + ', 64);\n';
      } else if (fill.type && fill.type.indexOf('GRADIENT') === 0 && fill.gradientStops && fill.gradientStops.length > 0) {
        var gc = toImCol32(fill.gradientStops[0].color, safeNum(fill.opacity, 1) * opacity, ctx, 'gradient');
        out += indent + '__dl->AddCircleFilled(' + pos(cx, cy) + ', ' + f(radius) + ', ' + gc + ', 64);\n';
      }
    }
  }
  if (node.strokes) {
    for (var j = 0; j < node.strokes.length; j++) {
      var stroke = node.strokes[j];
      if (stroke.visible === false) continue;
      if (stroke.type === 'SOLID') {
        var sc = toImCol32(stroke.color, safeNum(stroke.opacity, 1) * opacity, ctx, 'stroke');
        var sw = safeNum(node.strokeWeight, 1);
        out += indent + '__dl->AddCircle(' + pos(cx, cy) + ', ' + f(radius) + ', ' + sc + ', 64, ' + f(sw) + ');\n';
      }
    }
  }
  return out;
}

function renderLine(node, ctx, indent, absX, absY) {
  var opacity = safeNum(node.opacity, 1);
  var out = '';
  if (node.strokes) {
    for (var i = 0; i < node.strokes.length; i++) {
      var stroke = node.strokes[i];
      if (stroke.visible === false) continue;
      if (stroke.type === 'SOLID') {
        var col = toImCol32(stroke.color, safeNum(stroke.opacity, 1) * opacity, ctx, 'stroke');
        var sw = safeNum(node.strokeWeight, 1);
        out += indent + '__dl->AddLine(' + pos(absX, absY) + ', ';
        out += pos(absX + node.width, absY + node.height) + ', ';
        out += col + ', ' + f(sw) + ');\n';
      }
    }
  }
  return out;
}

/** Render a node whose primary visual is an IMAGE fill */
async function renderImageFill(node, ctx, indent, absX, absY) {
  if (!node.fills) return '';
  for (var i = 0; i < node.fills.length; i++) {
    if (node.fills[i].type === 'IMAGE' && node.fills[i].visible !== false) {
      return await emitImageFill(node, node.fills[i], ctx, indent, absX, absY, node.width, node.height);
    }
  }
  return indent + '// image fill missing\n';
}

/** Emit ImGui::Image for a single IMAGE fill */
async function emitImageFill(node, fill, ctx, indent, absX, absY, w, h) {
  if (!fill.imageHash) return indent + '// image hash missing\n';
  var image = figma.getImageByHash(fill.imageHash);
  if (!image) return indent + '// image data missing\n';

  var bytes = await image.getBytesAsync();
  var base64 = figma.base64Encode(bytes);
  var baseName = sanitizeCppName(node.name || 'img');
  var filename = baseName + '.png';

  if (!ctx.imageCache.has(fill.imageHash)) {
    ctx.imageAssets.push({ filename: filename, base64: base64, isHeader: false });
    ctx.imageCache.set(fill.imageHash, baseName);
  }
  var varName = ctx.imageCache.get(fill.imageHash);

  var out = '';
  out += indent + 'ImGui::SetCursorScreenPos(' + pos(absX, absY) + ');\n';
  out += indent + 'ImGui::Image(GetTextureID("' + varName + '"), ImVec2(' + f(w) + ', ' + f(h) + '));\n';
  return out;
}

// =============================================================================
// CODE GENERATION
// =============================================================================

function buildComponentFunction(compName, innerCode) {
  var code = innerCode.split('__BX').join('__bx').split('__BY').join('__by');
  return 'inline void ' + compName + '(float __bx, float __by) {\n'
       + '    auto* __dl = ImGui::GetWindowDrawList();\n'
       + code
       + '}\n';
}

/**
 * Generate a self-contained .h file with everything needed to render the UI.
 */
export function generateAllInOneHeader(projectName, innerCode, ctx, frameW, frameH, cornerRad) {
  var safeName = sanitizeCppName(projectName);
  var w = f(frameW);
  var h = f(frameH);
  var r = f(safeNum(cornerRad, 0));

  var out = '';

  // ── Header ────────────────────────────────────────────────────────────────
  out += '// ================================================================\n';
  out += '// Auto-generated ImGui UI: ' + projectName + '\n';
  out += '// Generated by Figma-to-ImGui plugin\n';
  out += '//\n';
  out += '// USAGE:\n';
  out += '//   #include "' + safeName + '.h"\n';
  out += '//   Render' + safeName + '();  // in your render loop\n';
  out += '// ================================================================\n';
  out += '#pragma once\n';
  out += '#include "imgui.h"\n\n';

  // ── Texture loader stub ───────────────────────────────────────────────────
  out += '// Implement this for your rendering backend (OpenGL / DX11 / Vulkan)\n';
  out += 'inline ImTextureID GetTextureID(const char* /*name*/) {\n';
  out += '    return nullptr;\n';
  out += '}\n\n';

  // ── Color palette ─────────────────────────────────────────────────────────
  out += 'namespace Colors {\n';
  if (ctx.cppColors && ctx.cppColors.size > 0) {
    var colorEntries = Array.from(ctx.cppColors.entries());
    for (var ci = 0; ci < colorEntries.length; ci++) {
      var ck = colorEntries[ci][0];
      var cv = colorEntries[ci][1];
      var hints = cv.usageHints ? Array.from(cv.usageHints) : [];
      var pad = '';
      for (var pi = 0; pi < Math.max(0, 32 - ck.length); pi++) pad += ' ';
      out += '    constexpr ImU32 Color_' + ci + pad + '= ' + ck + '; // ' + hints.join(', ') + '\n';
    }
  } else {
    out += '    // No colors extracted\n';
  }
  out += '} // namespace Colors\n\n';

  // ── Components ────────────────────────────────────────────────────────────
  if (ctx.cppComponents && ctx.cppComponents.size > 0) {
    out += '// ================================================================\n';
    out += '// COMPONENTS\n';
    out += '// ================================================================\n';
    var compEntries = Array.from(ctx.cppComponents.entries());
    for (var coi = 0; coi < compEntries.length; coi++) {
      out += compEntries[coi][1] + '\n';
    }
  }

  // ── Root render function ──────────────────────────────────────────────────
  var rootCode = innerCode.split('__BX').join('__O.x').split('__BY').join('__O.y');

  out += '// ================================================================\n';
  out += '// MAIN UI FUNCTION\n';
  out += '// ================================================================\n';
  out += 'inline void Render' + safeName + '() {\n';
  out += '    ImGui::SetNextWindowSize(ImVec2(' + w + ', ' + h + '), ImGuiCond_Always);\n';
  out += '    ImGui::SetNextWindowPos(ImVec2(0.0f, 0.0f), ImGuiCond_Once);\n';
  out += '    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(0.0f, 0.0f));\n';
  out += '    ImGui::PushStyleVar(ImGuiStyleVar_WindowRounding, ' + r + ');\n';
  out += '    ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 0.0f);\n';
  out += '    const bool __open = ImGui::Begin("##' + safeName + '", nullptr,\n';
  out += '        ImGuiWindowFlags_NoTitleBar |\n';
  out += '        ImGuiWindowFlags_NoScrollbar |\n';
  out += '        ImGuiWindowFlags_NoScrollWithMouse |\n';
  out += '        ImGuiWindowFlags_NoResize |\n';
  out += '        ImGuiWindowFlags_NoBackground);\n';
  out += '    ImGui::PopStyleVar(3);\n';
  out += '    if (!__open) { ImGui::End(); return; }\n\n';
  out += '    auto* __dl = ImGui::GetWindowDrawList();\n';
  out += '    const ImVec2 __O = ImGui::GetCursorScreenPos();\n\n';
  out += rootCode;
  out += '\n    ImGui::End();\n';
  out += '}\n';

  return out;
}

// =============================================================================
// LEGACY EXPORTS
// =============================================================================

export function generateImGuiWrapper(projectName, innerCode) {
  return '// Use generateAllInOneHeader() instead.\n' + innerCode;
}

export function buildColorHeader() { return null; }
export function buildTextureLoaderHeader() { return null; }

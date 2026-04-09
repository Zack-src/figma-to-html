/**
 * Utilities for converting binary assets to C++ headers.
 */

/**
 * Converts a Uint8Array to a C++ header file content (hex array).
 * @param {string} name - The variable name.
 * @param {Uint8Array} bytes - The binary data.
 * @returns {string} The header file content.
 */
export function toHexHeader(name, bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i].toString(16).padStart(2, '0');
    hex += '0x' + byte + (i === bytes.length - 1 ? '' : ', ');
    if ((i + 1) % 12 === 0) hex += '\n    ';
  }

  return `
#ifndef ${name.toUpperCase()}_H
#define ${name.toUpperCase()}_H

// Auto-generated asset header
const unsigned int ${name}_size = ${bytes.length};
const unsigned char ${name}_data[] = {
    ${hex}
};

#endif // ${name.toUpperCase()}_H
`;
}

/**
 * Sanitizes a string for use as a C++ identifier.
 */
export function sanitizeCppName(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}

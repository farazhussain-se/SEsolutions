/* utils/colorUtils.ts
    ------------------------------------------------------------
    Perceptual Color Comparison Utilities (CIEDE2000)
    ------------------------------------------------------------
*/

/**
 * Converts a hex color string to an RGB array.
 * @param {string} hex - The hex color string (e.g., "#RRGGBB").
 * @returns {number[]} An array [r, g, b].
 */
function hexToRgb(hex: string): number[] {
    if (!hex || typeof hex !== "string") return [0, 0, 0];
    let r = 0,
      g = 0,
      b = 0;
    // 3 digits
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    }
    // 6 digits
    else if (hex.length === 7) {
      r = parseInt(hex.substring(1, 3), 16);
      g = parseInt(hex.substring(3, 5), 16);
      b = parseInt(hex.substring(5, 7), 16);
    }
    return [r, g, b];
  }
  
  /**
   * Converts an RGB color value to CIE 1931 XYZ values.
   * @param {number[]} rgb - The RGB color array [r, g, b].
   * @returns {number[]} The XYZ values [x, y, z].
   */
  function rgbToXyz(rgb: number[]): number[] {
    let [r, g, b] = rgb.map((c) => c / 255);
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
    r *= 100;
    g *= 100;
    b *= 100;
    const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
    return [x, y, z];
  }
  
  /**
   * Converts CIE 1931 XYZ values to CIE L*a*b*.
   * @param {number[]} xyz - The XYZ values [x, y, z].
   * @returns {number[]} The L*a*b* values [l, a, b].
   */
  function xyzToLab(xyz: number[]): number[] {
    let [x, y, z] = xyz;
    const refX = 95.047,
      refY = 100.0,
      refZ = 108.883;
    x /= refX;
    y /= refY;
    z /= refZ;
    x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116;
    y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116;
    z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116;
    const l = 116 * y - 16;
    const a = 500 * (x - y);
    const b = 200 * (y - z);
    return [l, a, b];
  }
  
  /**
   * Calculates the CIEDE2000 color difference between two L*a*b* colors.
   * @param {number[]} lab1 The first L*a*b* color.
   * @param {number[]} lab2 The second L*a*b* color.
   * @returns {number} The Delta E 2000 value.
   */
  function deltaE2000(lab1: number[], lab2: number[]): number {
    const [L1, a1, b1] = lab1;
    const [L2, a2, b2] = lab2;
    const kL = 1,
      kC = 1,
      kH = 1;
    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const C_bar = (C1 + C2) / 2;
    const G =
      0.5 * (1 - Math.sqrt(Math.pow(C_bar, 7) / (Math.pow(C_bar, 7) + Math.pow(25, 7))));
    const a1_prime = (1 + G) * a1;
    const a2_prime = (1 + G) * a2;
    const C1_prime = Math.sqrt(a1_prime * a1_prime + b1 * b1);
    const C2_prime = Math.sqrt(a2_prime * a2_prime + b2 * b2);
    const h1_rad = Math.atan2(b1, a1_prime);
    const h1_prime =
      h1_rad >= 0 ? h1_rad * (180 / Math.PI) : h1_rad * (180 / Math.PI) + 360;
    const h2_rad = Math.atan2(b2, a2_prime);
    const h2_prime =
      h2_rad >= 0 ? h2_rad * (180 / Math.PI) : h2_rad * (180 / Math.PI) + 360;
    const deltaL_prime = L2 - L1;
    const deltaC_prime = C2_prime - C1_prime;
    let deltah_prime;
    if (C1_prime * C2_prime === 0) deltah_prime = 0;
    else if (Math.abs(h2_prime - h1_prime) <= 180)
      deltah_prime = h2_prime - h1_prime;
    else if (h2_prime - h1_prime > 180) deltah_prime = h2_prime - h1_prime - 360;
    else deltah_prime = h2_prime - h1_prime + 360;
    const deltaH_prime =
      2 * Math.sqrt(C1_prime * C2_prime) * Math.sin((deltah_prime * Math.PI) / 180 / 2);
    const L_bar_prime = (L1 + L2) / 2;
    const C_bar_prime = (C1_prime + C2_prime) / 2;
    let h_bar_prime;
    if (C1_prime * C2_prime === 0) h_bar_prime = h1_prime + h2_prime;
    else if (Math.abs(h1_prime - h2_prime) <= 180)
      h_bar_prime = (h1_prime + h2_prime) / 2;
    else if (h1_prime + h2_prime < 360)
      h_bar_prime = (h1_prime + h2_prime + 360) / 2;
    else h_bar_prime = (h1_prime + h2_prime - 360) / 2;
    const T =
      1 -
      0.17 * Math.cos(((h_bar_prime - 30) * Math.PI) / 180) +
      0.24 * Math.cos(((2 * h_bar_prime) * Math.PI) / 180) +
      0.32 * Math.cos(((3 * h_bar_prime + 6) * Math.PI) / 180) -
      0.2 * Math.cos(((4 * h_bar_prime - 63) * Math.PI) / 180);
    const delta_theta =
      (30 * Math.PI) /
      180 *
      Math.exp(-Math.pow((h_bar_prime - 275) / 25, 2));
    const R_C =
      2 * Math.sqrt(Math.pow(C_bar_prime, 7) / (Math.pow(C_bar_prime, 7) + Math.pow(25, 7)));
    const S_L =
      1 +
      (0.015 * Math.pow(L_bar_prime - 50, 2)) /
        Math.sqrt(20 + Math.pow(L_bar_prime - 50, 2));
    const S_C = 1 + 0.045 * C_bar_prime;
    const S_H = 1 + 0.015 * C_bar_prime * T;
    const R_T = -Math.sin(2 * delta_theta) * R_C;
    const termL = deltaL_prime / (kL * S_L);
    const termC = deltaC_prime / (kC * S_C);
    const termH = deltaH_prime / (kH * S_H);
    return Math.sqrt(
      Math.pow(termL, 2) +
        Math.pow(termC, 2) +
        Math.pow(termH, 2) +
        R_T * termC * termH
    );
  }
  
  /**
   * Checks if two hex colors are perceptually similar using the CIEDE2000 formula.
   * @param {string} hex1 - The first color in hex format (e.g., "#FFF", "#FFFFFF").
   * @param {string} hex2 - The second color in hex format.
   * @param {number} [threshold=15] - The Delta E value below which colors are considered similar.
   * @returns {boolean} `true` if colors are similar, `false` otherwise.
   */

/**
 * Validates and normalises a hex color string to 6-digit form.
 * @param {string} value - Input color string.
 * @param {string} fallback - Returned when value is not a valid hex color.
 * @returns {string} A valid 6-digit hex string or the fallback.
 */
export function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

export function areColorsSimilar(hex1: string, hex2: string, threshold: number = 15): boolean {
    const lab1 = xyzToLab(rgbToXyz(hexToRgb(hex1)));
    const lab2 = xyzToLab(rgbToXyz(hexToRgb(hex2)));
    const delta = deltaE2000(lab1, lab2);
    return delta < threshold;
  }
  
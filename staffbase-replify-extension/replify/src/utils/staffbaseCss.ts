/* utils/staffbaseCSS.ts
    ------------------------------------------------------------
    Staffbase CSS API helpers
    ------------------------------------------------------------
*/

import { areColorsSimilar } from "./colorUtils";

interface ThemeObject {
  id?: string;
  desktopTheme?: {
    customCss?: string;
    components?: {
      navigation?: {
        accentColor?: string;
        backgroundColor?: string;
        textColor?: string;
      };
    };
  };
  globalTheme?: {
    interfaceColor?: string;
  };
  [key: string]: unknown;
}

export interface ColorConfig {
  primary: string;
  text: string;
  background: string;
  floatingNavText: string;
  floatingNavBg: string;
}

interface UpdateResult {
  system: "new" | "old";
  status: number;
  data: unknown;
}

/**
 * [READ-ONLY] Fetches CSS from the legacy custom.css endpoint.
 */
export async function fetchCurrentCSS(token: string, domain: string = "app.staffbase.com"): Promise<string> {
  if (!token) throw new Error("No token provided.");
  const url = `https://${domain}/api/custom.css`;
  const res = await fetch(url, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    headers: {
      Authorization: `Basic ${token.trim()}`,
      "Cache-Control": "no-cache",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch CSS: ${res.status} - ${res.statusText}`);
  }

  const css = await res.text();
  return css;
}

/**
 * Resets the App/Intranet branding by fetching the primary theme,
 * removing the `desktopTheme` object, and updating it.
 * @param {string} token - Staffbase API token.
 */
export async function resetDesktopTheme(token: string, domain: string = "app.staffbase.com"): Promise<unknown> {
  if (!token) throw new Error("No token provided for theme reset.");

  // 1. Get the primary theme to find its ID and current state
  const themeRes = await fetch(`https://${domain}/api/theming/themes/primary`, {
    headers: { Authorization: `Basic ${token}` },
  });

  if (!themeRes.ok) {
    throw new Error(`Theme Reset (GET): ${themeRes.statusText}`);
  }

  const themeObject = (await themeRes.json()) as ThemeObject;
  const themeId = themeObject.id;
  if (!themeId) throw new Error("Theme Reset: Could not find theme ID.");

  // 2. Remove the desktopTheme object from the payload
  delete themeObject.desktopTheme;

  // 3. PUT the updated object (without the desktop theme) back to the endpoint
  const updateRes = await fetch(`https://app.staffbase.com/api/theming/themes/${themeId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/vnd.staffbase.theming.themes.theme+json",
      Authorization: `Basic ${token}`,
    },
    body: JSON.stringify(themeObject),
  });

  if (!updateRes.ok) {
    const errorBody = await updateRes.text();
    console.error("Theme Reset PUT Error:", errorBody);
    throw new Error(`Theme Reset (PUT): ${updateRes.statusText}`);
  }

  return await updateRes.json();
}

/**
 * Posts the provided CSS and color configuration to BOTH the new Theme API
 * and the old Branch Config API in parallel.
 */
export async function postUpdatedCSS(
  token: string,
  branchId: string,
  cssText: string,
  colorConfig?: ColorConfig,
  domain: string = "app.staffbase.com"
): Promise<PromiseSettledResult<UpdateResult>[]> {
  if (!token || !branchId) {
    throw new Error("Token and Branch ID are required for CSS update.");
  }
  if (typeof cssText !== "string") {
    throw new Error("CSS text must be a string.");
  }

  // --- Promise for the new Theme API update ---
  const updateNewSystem = async (): Promise<UpdateResult> => {
    // 1. Get the primary theme to find its ID
    const themeRes = await fetch(`https://${domain}/api/theming/themes/primary`, {
      headers: { Authorization: `Basic ${token}` },
    });

    if (!themeRes.ok) {
      throw new Error(`Theme API (GET): ${themeRes.statusText}`);
    }

    const themeObject = (await themeRes.json()) as ThemeObject;
    const themeId = themeObject.id;
    if (!themeId) throw new Error("Theme API: Could not find theme ID.");

    // 2. Update the CSS and Colors in the object
    // Ensure nested objects exist before assigning to them
    themeObject.desktopTheme = themeObject.desktopTheme || {};
    themeObject.globalTheme = themeObject.globalTheme || {};

    // Always update the custom CSS
    themeObject.desktopTheme.customCss = cssText;

    // If colorConfig is provided, update the color properties
    if (colorConfig) {
      themeObject.desktopTheme.components = themeObject.desktopTheme.components || {};
      themeObject.desktopTheme.components.navigation =
        themeObject.desktopTheme.components.navigation || {};

      // Deconstruct all colors from the config
      const { primary, text, background, floatingNavText, floatingNavBg } = colorConfig;

      // ---- Accent Color Logic ----
      let accentColor = text;
      if (areColorsSimilar(floatingNavText, text)) {
        if (areColorsSimilar(floatingNavText, primary)) {
          accentColor = floatingNavBg;
        } else {
          accentColor = primary;
        }
      }
      // ---- End Accent Color Logic ----

      // ---- Background Color Logic ----
      let finalBackgroundColor = background;
      // CHECK 1: Is the background color too similar to the floating nav text color?
      if (areColorsSimilar(floatingNavText, background)) {
        // If so, CHECK 2: Is the main branding text color also too similar?
        if (areColorsSimilar(floatingNavText, text)) {
          // FALLBACK: Both are too similar, use the floating nav's BG color.
          finalBackgroundColor = floatingNavBg;
        } else {
          // PRIMARY: Use the main branding text color as the background.
          finalBackgroundColor = text;
        }
      }
      // ---- End Background Color Logic ----

      // Map colors based on the final determined values
      themeObject.desktopTheme.components.navigation.accentColor = accentColor;
      themeObject.desktopTheme.components.navigation.backgroundColor = finalBackgroundColor;
      themeObject.desktopTheme.components.navigation.textColor = text;
      themeObject.globalTheme.interfaceColor = primary;
    }

    // 3. PUT the updated object to the specific theme endpoint
    const updateRes = await fetch(`https://${domain}/api/theming/themes/${themeId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/vnd.staffbase.theming.themes.theme+json",
        Authorization: `Basic ${token}`,
      },
      body: JSON.stringify(themeObject),
    });

    if (!updateRes.ok) {
      const errorBody = await updateRes.text();
      console.error("Theme API PUT Error:", errorBody);
      throw new Error(`Theme API (PUT): ${updateRes.statusText}`);
    }

    return {
      system: "new",
      status: updateRes.status,
      data: await updateRes.json(),
    };
  };

  // --- Promise for the OLD Branch Config API update ---
  const updateOldSystem = async (): Promise<UpdateResult> => {
    const url = `https://${domain}/api/branches/${branchId}/config`;
    const res = await fetch(url, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        Authorization: `Basic ${token.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customCSS: cssText }),
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(`Branch API (POST): ${res.status} ${msg.slice(0, 100)}`);
    }

    return { system: "old", status: res.status, data: await res.json() };
  };

  // --- Run both updates concurrently and return their results ---
  return Promise.allSettled([updateNewSystem(), updateOldSystem()]);
}

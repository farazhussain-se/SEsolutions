
// src/utils/branding.js

// This function takes the CSS text as an argument.
export const parseBrandingFromCSS = (cssText: string, blockRegex: RegExp) => {
    // These helper functions are fine to keep inside
    const clean = (val = "") => val.replace(/!important/i, "").trim().replace(/^['"]|['"]$/g, "");
    const pxToNum = (val = "") => parseInt(val.replace("px", ""), 10) || 0;
    const extractUrl = (raw = "") => (raw.match(/url\(["']?(.*?)["']?\)/i) || [])[1] || "";
  
    const match = cssText.match(blockRegex);
    if (!match) {
      // Instead of setting a response, throw an error that the component can catch.
      throw new Error("No Replify block found in the CSS.");
    }
  
    const block = match[0];
    const grabRaw = (v: string) => (block.match(new RegExp(`--${v}\\s*:\\s*([^;]+);`, "i")) || [])[1]?.trim();
    const nameMatch = block.match(/\/\*\s*prospect:(.*?)\*\//i);

    // Step 2: Parse the entire CSS string for the conditional logo sizing rule
    let changeLogoSize = false;
    let logoHeight, logoMarginTop;

    const sizeRuleRegex = /\.header-left-container\s*{([^}])}/i;
    const sizeRuleMatch = cssText.match(sizeRuleRegex);

    if (sizeRuleMatch) {
        // This regex is intentionally broad to find the rule regardless of prefixing
        const ruleContent = sizeRuleMatch[1];
        const heightMatch = ruleContent.match(/height:\s*([^;!])/i);
        const marginTopMatch = ruleContent.match(/margin-top:\s*([^;!])/i);
        
        if (heightMatch && pxToNum(heightMatch[1])) {
        changeLogoSize = true; 
        logoHeight = pxToNum(heightMatch[1]);
        logoMarginTop = marginTopMatch ? pxToNum(marginTopMatch[1]) : 0;
        }
    }
      
    // Parse header transparency from the CSS variable
    const headerTransparencyRaw = grabRaw("header-transparency");
    const headerTransparency = headerTransparencyRaw ? Math.round(parseFloat(headerTransparencyRaw) * 100) : 70;
    // Return a single object with all the parsed data
    return {
      prospectName: nameMatch ? nameMatch[1].trim() : undefined,
      primaryColor: clean(grabRaw("color-client-primary")),
      textColor: clean(grabRaw("color-client-text")),
      backgroundColor: clean(grabRaw("color-client-background")),
      floatingNavBgColor: clean(grabRaw("color-floating-nav-bg")),
      floatingNavTextColor: clean(grabRaw("color-floating-nav-text")),
      bgUrl: extractUrl(grabRaw("bg-image")),
      logoUrl: extractUrl(grabRaw("logo-url")),
      logoPadHeight: pxToNum((grabRaw("padding-logo-size") || "").split(" ")[0]),
      logoPadWidth: pxToNum((grabRaw("padding-logo-size") || "").split(" ")[1]),
      bgVertical: parseInt(((grabRaw("bg-image-position") || "").split(" ")[1] || "").replace("%", ""), 10),
      changeLogoSize,
      logoHeight,
      logoMarginTop,
      headerTransparency,
    };
  };

/**
 * Parses multi-branding configurations from a CSS string.
 * @param {string} cssText The full CSS text.
 * @param {Array} allGroups An array of all available groups with {id, name}.
 * @returns {Array} An array of multi-branding configuration objects.
 */
export const parseMultiBrandingFromCSS = (cssText: string, allGroups: { id?: string; name?: string }[] = []) => {
  const multiBrandingRegex = /\/\*\s*♡\s*REPLIFY MULTIBRANDING START\s*♡\s*\*\/([\s\S]*?)\/\*\s*♡\s*REPLIFY MULTIBRANDING END\s*♡\s*\*\//i;
  const multiBrandingMatch = cssText.match(multiBrandingRegex);

  if (!multiBrandingMatch) {
    return [];
  }


  const multiBrandingBlock = multiBrandingMatch[1];
  const groupBlocks = multiBrandingBlock.split(/\/\*\s*Branding for Group ID:/).slice(1);

  const parsedBrandings = groupBlocks.map((block: string) => {
    const groupIdMatch = block.match(/^(.*?)\s*\*\//);
    if (!groupIdMatch) return null;

    const groupId = groupIdMatch[1].trim();
    const groupName = allGroups.find(g => g.id === groupId)?.name || groupId;
    const prefix = `.group-${groupId}`;

    const grabCssValue = (property: string, selector: string) => {
      // Regex to find a CSS rule and capture the value of a specific property inside it.
      // It handles various selector formats created by the prefixer.
      const selectorPattern = selector.replace(
        /([.[\]*])/g, // Escape dots, brackets, and asterisks
        '\\$1'
      ).replace(/\s/g, '\\s*'); // Allow for flexible whitespace


      const ruleRegex = new RegExp(`${selectorPattern}\\s*{[^}]*?${property}:\\s*([^;!]+)`, 'i');
      const match = block.match(ruleRegex);
      return match ? match[1].trim() : null;
    };

    const extractUrl = (raw = "") => (raw.match(/url\(["']?(.*?)["']?\)/i) || [])[1] || "";
    const pxToNum = (val = "") => parseInt(String(val).replace("px", ""), 10) || 0;

    // --- Parse Colors from the data comment ---
    const dataCommentRegex = /\/\*\s*♡\s*data:\s*({.*?})\s*♡\s*\*\//;
    const dataMatch = block.match(dataCommentRegex);
    let colors: Record<string, string | null> = {};
    if (dataMatch && dataMatch[1]) {
      try {
        colors = JSON.parse(dataMatch[1]) as Record<string, string | null>;
      } catch (e) {
        console.error("Failed to parse multi-branding data comment:", e);
      }
    }
    const primaryColor = colors.primaryColor || null;
    const textColor = colors.textColor || null;
    const backgroundColor = colors.backgroundColor || null;
    const floatingNavBgColor = colors.floatingNavBgColor || null;
    const floatingNavTextColor = colors.floatingNavTextColor || null;

    // --- Parse Images & Positioning ---
    const bgUrlRaw = grabCssValue('background-image', `html${prefix}.desktop:not(.without-page-background):has(.home-social)::before`);
    const bgUrl = bgUrlRaw ? extractUrl(bgUrlRaw) : '';
    const bgPositionRaw = grabCssValue('background-position', `html${prefix}.desktop:not(.without-page-background):has(.home-social):before`);
    const bgVertical = bgPositionRaw ? parseInt((bgPositionRaw.split(" ")[1] || "50").replace("%", ""), 10) : 50;

    // --- Parse Logo ---
    const logoUrlRaw = grabCssValue('background-image', `${prefix}.desktop.wow-header-activated .header-left-container::after`);
    const logoUrl = logoUrlRaw ? extractUrl(logoUrlRaw) : '';
    const logoPaddingRaw = grabCssValue('padding', `${prefix}.desktop.wow-header-activated .header-left-container`);
    const logoPadHeight = logoPaddingRaw ? pxToNum(logoPaddingRaw.split(" ")[0]) : 0;
    const logoPadWidth = logoPaddingRaw ? pxToNum(logoPaddingRaw.split(" ")[1] || logoPaddingRaw.split(" ")[0]) : 0;

    // --- Parse Custom Logo Sizing ---
    const logoHeightRaw = grabCssValue('height', `${prefix} .header-left-container`);
    const logoMarginTopRaw = grabCssValue('margin-top', `${prefix} .header-left-container`);
    const changeLogoSize = !!(logoHeightRaw || logoMarginTopRaw);
    const logoHeight = changeLogoSize ? pxToNum(logoHeightRaw ?? "") : 100;
    const logoMarginTop = changeLogoSize ? pxToNum(logoMarginTopRaw ?? "") : 0;

    // --- Parse Header Transparency ---
    const headerTransparencyRaw = grabCssValue('--header-transparency', `:root${prefix}`);
    const headerTransparency = headerTransparencyRaw ? Math.round(parseFloat(headerTransparencyRaw) * 100) : 70;

    return {
      groupId,
      groupName,
      primaryColor,
      textColor,
      backgroundColor,
      floatingNavBgColor,
      floatingNavTextColor,
      bgUrl,
      logoUrl,
      logoPadWidth,
      logoPadHeight,
      bgVertical,
      changeLogoSize,
      logoHeight,
      logoMarginTop,
      headerTransparency,
    };
  });


  // Filter out any nulls from failed parses and return
  return parsedBrandings.filter((b): b is NonNullable<typeof b> => b !== null && b.primaryColor !== null);
};
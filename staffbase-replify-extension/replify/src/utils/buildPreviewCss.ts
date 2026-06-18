
interface BrandOptions {
  primary: string;
  text: string;
  background: string;
  floatingNavBg?: string;
  floatingNavText?: string;
  /** Link Tiles widget background — drives the CSS preview override on
   *  `.quick-links-widget__item`. Optional: when omitted, primary is used. */
  tileBg?: string;
  /** Link Tiles widget text color — same convention as tileBg. */
  tileText?: string;
  bg?: string;
  logo?: string;
  padW?: number;
  padH?: number;
  bgVert?: number;
  changeLogoSize?: boolean;
  logoHeight?: number;
  logoMarginTop?: number;
  logoH?: number;
  headerTransparency?: number;
  prospectName?: string;
  /**
   * When true, the output CSS includes PREVIEW-ONLY overlays — currently
   * just `.quick-links-widget__item { background-color/color !important }`,
   * which is needed only when the user clicks Preview Branding (data
   * hasn't changed yet, so we have to override at the CSS layer).
   *
   * When false (the default — used by handleCreateDemo + handleApplyDemoConfig
   * which write the result PERSISTENTLY via postUpdatedCSS → /api/branches/{id}/config),
   * those overlays are OMITTED so the actual stored `data-widget-conf-tile-bg-color`
   * attribute drives the rendering. Without this flag, the !important CSS
   * leaked into the persistent theme and masked whether the Pages API
   * data-attribute write actually landed.
   */
  previewOnly?: boolean;
}

interface MultiBrandConfig {
  groupId: string;
  primaryColor?: string | null;
  textColor?: string | null;
  backgroundColor?: string | null;
  floatingNavBgColor?: string | null;
  floatingNavTextColor?: string | null;
  bgUrl?: string | null;
  logoUrl?: string | null;
  logoPadWidth?: number | null;
  logoPadHeight?: number | null;
  bgVertical?: number | null;
  changeLogoSize?: boolean | null;
  logoHeight?: number | null;
  logoMarginTop?: number | null;
  headerTransparency?: number | null;
}

/* utils/buildPreviewCss.js
   ------------------------------------------------------------
   Generate a **single giant CSS string** that can be injected
   into a Staffbase page for live-preview or permanent branding.
   ------------------------------------------------------------
       @param {Object} o  “options” object
     {
       primary         : "#RRGGBB",     // main brand colour
       text            : "#RRGGBB",     // text colour for nav / icons
       background      : "#RRGGBB",     // neutral card-background colour
       floatingNavBg   : "#RRGGBB",     // floating nav background colour
       floatingNavText : "#RRGGBB",     // floating nav text colour
       bg              : "url|string",  // hero/cover photo (optional)
       logo            : "url|string",  // custom logo         (optional)
       padW, padH      : Number (px)    // logo padding
       bgVert          : Number (0-100) // bg vertical %
       changeLogoSize  : Boolean,       // flag for custom logo size
       logoHeight      : Number (px)    // custom logo container height
       logoMarginTop   : Number (px)    // custom logo container margin
       logoH           : Number (px)    // logo height (rarely used)
       headerTransparency: Number (0-100) // header background opacity
     }
   @returns {String} – fully-formed CSS ready for <style> injection

*/
export default function buildPreviewCss(o: BrandOptions, multiBrandings: MultiBrandConfig[] = [], customCss = "") {
  /* ════════════════════════════════════════════
     1.  Helper functions
     ════════════════════════════════════════════ */
  const hexToRgba = (hex: string, alpha: number) =>
    `rgba(${parseInt(hex.slice(1, 3), 16)},` +
    `${parseInt(hex.slice(3, 5), 16)},` +
    `${parseInt(hex.slice(5, 7), 16)},${alpha})`;

  const isDarkColor = (hex: string) => {
    if (!hex || hex.length < 7) return false;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return 0.299 * r + 0.587 * g + 0.114 * b < 128;
  };

  const hexToHsl = (hex: string) => {
    if (!hex || hex.length < 7) return { h: 0, s: 0, l: 0 };
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
        default: h = 0; // Default case to handle unexpected values
      }
      h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  };

  /* Helper for generating color, background, and general branding CSS.
   */
  const buildCssBlock = (options: BrandOptions, useVariables = true) => {
    // Derived colours
    const primaryInverse = isDarkColor(options.primary) ? "#fff" : "rgba(0,0,0,.7)";
    const widgetTextColor = isDarkColor(options.background) ? "#fff" : "#000";
    // Convert header transparency from percentage (e.g., 70) to a CSS alpha value (e.g., 0.7)
    const headerOpacity = (options.headerTransparency ?? 70) / 100;
    const headerBgTranslucent = hexToRgba(options.primary, headerOpacity);
    const textOpposite = isDarkColor(options.text) ? "#fff" : "#000";
    const metaTextColor = isDarkColor(options.background)
      ? "rgba(255,255,255,0.7)"
      : "rgba(0,0,0,0.7)";

    const getSurveyColor = () => {
      const primaryIsDark = isDarkColor(options.primary);
      const textIsDark = isDarkColor(options.text);
      if (primaryIsDark) return options.primary;
      if (textIsDark) return options.text;
      const primaryHsl = hexToHsl(options.primary);
      const textHsl = hexToHsl(options.text);
      return (primaryHsl.s >= textHsl.s) ? options.primary : options.text;
    };

    const surveyColor = getSurveyColor();
    const surveyColorInverse = isDarkColor(surveyColor) ? '#fff' : 'rgba(0,0,0,0.7)';
    const textColorHsl = hexToHsl(options.text);
    const buttonBgColor = textColorHsl.l > 95 ? options.primary : options.text;
    const buttonTextColor = isDarkColor(buttonBgColor) ? "#fff" : "rgba(0,0,0,.7)";

    // New logic to determine the most vibrant color for specific widgets
    const primaryHsl = hexToHsl(options.primary);
    const textHslVibrancy = hexToHsl(options.text);
    const vibrantBgColor = primaryHsl.s >= textHslVibrancy.s ? options.primary : options.text;
    const vibrantTextColor = vibrantBgColor === options.primary ? primaryInverse : textOpposite;

    // Logic for the badge background and text colors
    const badgeBgColor = (options.primary.toLowerCase() === '#ffffff' || options.primary.toLowerCase() === '#fff')
      ? '#f0f0f0' // A standard light grey
      : options.primary;
    const badgeTextColor = isDarkColor(badgeBgColor) ? '#fff' : 'rgba(0,0,0,0.7)';

    // Logic for the icon background color
    const iconBgColor = (options.primary.toLowerCase() === '#ffffff' || options.primary.toLowerCase() === '#fff')
      ? '#f0f0f0' // A standard light grey
      : options.primary;


    // Selector for the static content card to avoid repetition
    const staticContentCardSelector = '.static-content-wrapper.widget-on-card.no-shadow-border:not(.counter):not(.full-width-bg.page-footer)';
    

    const primary = options.primary;
    const text = options.text;
    const background = options.background;
    const floatingNavBg = (options.floatingNavBg || '#FFFFFF');
    // ✨ Create a translucent version of floatingNavBg using the header's opacity
    const floatingNavBgTranslucent = hexToRgba(floatingNavBg, headerOpacity);
    const floatingNavText = (options.floatingNavText || '#000000');
    const bgImage = `url("${options.bg || ""}")`;
    const logoPadding = `${options.padH || 0}px ${options.padW || 0}px`;
    const bgImagePosition = `25% ${options.bgVert || 50}%`;
    

    // Only generate the :root block if we are using variables (i.e., for the main branding)
    const rootBlock = useVariables ? `
    /* ================= root tokens ================= */
    :root{
      --color-client-primary : ${options.primary} !important;
      --color-client-text    : ${options.text}    !important;
      --sb-text-nav-appintranet : ${options.text} !important;
      --color-client-background : ${options.background} !important;
      --color-floating-nav-bg   : ${floatingNavBg} !important; /* Keep original for token */
      --color-floating-nav-text : ${options.floatingNavText || '#000000'} !important;
      --sb-background-menubar-intranet-hover : ${hexToRgba(options.primary, 0.2)} !important;
      --bg-image            : url("${options.bg || ""}");
      --logo-url            : url("${options.logo || ""}");
      --padding-logo-size   : ${options.padH || 0}px ${options.padW || 0}px;
      --bg-image-position   : 25% ${options.bgVert || 50}%;
      --header-transparency : ${headerOpacity};
    }
    ` : '';

    return rootBlock + `
      /* ================= header ================= */
      .desktop.wow-header-activated .header-left-container{
        position   : relative;
        display    : flex;
        align-items: center;
        padding    : ${logoPadding} !important;
      }

      /* logo sizing */
      ${
      options.changeLogoSize
        ? `
        .header-left-container {
          height: ${options.logoHeight}px !important;
          margin-top: ${options.logoMarginTop}px !important;
        }
      `
        : ''
      }
      /* hide the title text and its divider */
      .desktop.wow-header-activated .header-title,
      .desktop.wow-header-activated .header-title::before,
      .desktop.wow-header-activated .header-title::after{
        display: none !important;
      }

      /* translucent coloured bar behind the header */
      .desktop.wow-header-activated .app-header{
        --desktop-app-header-bg-color: ${headerBgTranslucent} !important;
        background-color              : ${headerBgTranslucent} !important;
      }

      /* Override for newer envs to ensure primary color is used */
      html.with-floating-menu.desktop.desktop .app-header::before {
        background: ${headerBgTranslucent} !important;
        content: "" !important;
      }

      /* Newer env header background */
      .bg-header-appintranet {
        background-color: ${options.primary} !important;
      }

      .text-header-appintranet {
        color: ${primaryInverse} !important;
      }

      /* ================= mobile ================= */
      static-content-block[background-color="#d3e6ec"] {
        background-color: ${background} !important;
      }

      static-content-block[background-color="#d3e6ec"] p {
        color: ${widgetTextColor} !important;
      }


      /* ================= menu / icons ================= */
      .desktop.wow-header-activated .header-title,
      .desktop.wow-header-activated .header-title .css-1wac6i9-TitleWrapper{
        color:${text}!important;
      }
      .desktop.wow-header-activated .wow-app-header .css-8jz3c5-UserSettingsContainer > .user-menu-btn::after { 
        color:${text}!important;
      }
      .wow-header-activated .css-4557aa-StyledMegaMenuItem>a::before,
      .desktop.wow-header-activated #mega-menu li>a.item:before{
        background-color:${hexToRgba(primary, 0.3)}!important;
      }
      .wow-header-activated #menu  .we-icon,
      .desktop.wow-header-activated .wow-app-header .css-dgi6rr-Link::after,
      .wow-header-activated #menu .css-1ccn5tk-IconStyled,
      .desktop.wow-header-activated .wow-app-header .css-ol0i66-StyledLaunchpadIcon .we-icon::after { 
        color: ${options.text}!important;
      }

      /* ================= floating nav ================= */
      div#mega-menu {
        outline: none !important;
      }
      /* Text color for TOP-LEVEL items only in older envs */
      [data-testid="mega-menu-list"] > li > a .item-text,
      [data-testid="mega-menu-list"] > li > a .we-icon {
          color: ${floatingNavText} !important;
      }
      /* Override for the menu accent color to be opaque */
      .\\!bg-menubar-intranet-accent {
          background-color: ${floatingNavBg} !important;
      }
      /* Older env nav container background */
      .desktop.wow-header-activated .css-sps0ey-MegaMenuContainer {
        background-color: ${floatingNavBgTranslucent} !important; /* 👈 Updated to use transparency */
      }
      /* Newer env nav container background */
      .bg-menubar-intranet {
        background-color: ${floatingNavBg} !important; /* 👈 Updated to use transparency */
      }

      /* Text color for TOP-LEVEL items only in older envs */
      .wow-header-activated .css-1kyaah4-StyledMegaMenuItem > a,
      .wow-header-activated .css-1kyaah4-StyledMegaMenuItem > div > a,
      .wow-header-activated .css-6pdc2t-StyledMegaMenuItem > a,
      .wow-header-activated .css-6pdc2t-StyledMegaMenuItem > div > a {
        color: ${floatingNavText} !important;
      }

      /* Force text color for TOP-LEVEL items in newer envs */
      a[class~="!text-menubar-intranet"],
      a[class~="!text-menubar-intranet"] svg {
          color: var(--color-floating-nav-text) !important;
      }
      /* Override stubborn hover bg on menu pills (class with escaped colon) */
      [class*="hover\\:!bg-menubar-intranet-hover"]:hover {
        background-color: ${hexToRgba(options.primary, 0.2)} !important;
      }
      nav.bg-menubar-intranet a.hover\\:!bg-menubar-intranet-hover\\:hover,
      nav.bg-menubar-intranet a[class*="hover\\:!bg-menubar-intranet-hover"]:hover {
        background-color: ${hexToRgba(options.primary, 0.2)} !important;
      }


      /* ================= Surveys, Polls & Buttons ================= */
      .survey-custom survey-plugin-employee-block label svg {
        fill: ${surveyColor} !important;
      }
      .survey-custom form > div > div:nth-of-type(3) button {
        background-color: ${surveyColor} !important;
        border-color: ${surveyColor} !important;
        color: ${surveyColorInverse} !important;
      }
      .bg-primary-vivid {
        background-color: ${surveyColor} !important;
      }
      .ds-pill.ds-pill--blue {
        background-color: color-mix(in srgb, ${surveyColor} 30%, white 70%) !important;
        color: ${surveyColor} !important;
      }

      /* "Read More" links with special branding */
      .read-more.branch-colored {
          color: ${surveyColor} !important;
      }
      /* Preserve native survey question title color to avoid forced white on dark backgrounds */
      .survey-custom.plugin-wrapper .widget-card h2[id^="question-title"],
      .survey-custom.plugin-wrapper .widget-card h2.question-title,
      .survey-custom .widget-card h2[id^="question-title"],
      .survey-custom .widget-card .question-title {
        color: #1f1f1f !important;
      }


      /* ================= Quick Links & Specific Buttons ================= */
      /* "Design 2" Tiled Quick Links */
      .quick-links-widget.design-2.type-tiles .quick-links-widget__item:not([style*="background-color"]) {
          background-color: ${primary} !important;
      }
      .quick-links-widget.design-2.type-tiles .quick-links-widget__item:not([style*="background-color"]) a,
      .quick-links-widget.design-2.type-tiles .quick-links-widget__item:not([style*="background-color"]) .we-icon {
          color: ${primaryInverse} !important;
      }

      /* Tiled Layout-3 Quick Links */
      .quick-links-widget.type-tiles .quick-links-widget__list--layout-3 .quick-links-widget__item:not([style*="background-color"]) {
          background-color: ${primary} !important;
      }
      .quick-links-widget.type-tiles .quick-links-widget__list--layout-3 .quick-links-widget__item:not([style*="background-color"]) a,
      .quick-links-widget.type-tiles .quick-links-widget__list--layout-3 .quick-links-widget__item:not([style*="background-color"]) .we-icon {
          color: ${primaryInverse} !important;
      }

      button.sb-button {
          background-color: ${buttonBgColor} !important;
          color: ${buttonTextColor} !important;
          border-color: ${buttonBgColor} !important;
      }
      /* ================= Mobile Chat Page ================= */
      .mobile section[data-testid="mobile-modal-container"] button,
      .mobile section[data-testid="mobile-modal-container"] button:focus,
      .mobile section[data-testid="mobile-modal-container"] a.button,
      .mobile section[data-testid="mobile-modal-container"] a.button:focus,
      .mobile section[data-testid="mobile-modal-container"] .quick-links-widget.type-tiles li {
        background-color: ${primary} !important;
        color: ${text} !important;
      }

      /* ================= card widgets ================= */
      
      .top4news,
      .socialwallwithbg {
        background-color: ${background} !important;
      }
      
      /* Titles for widgets inside the social wall section */
      .socialwallwithbg h2 {
        color: ${widgetTextColor} !important;
      }

      .bottomfooter {
        background-color: ${primary} !important;
      }

      .bottomfooter h3,
      .bottomfooter p,
      .bottomfooter span,
      .bottomfooter strong {
        color: ${primaryInverse} !important;
      }

      /* first static-content card (no .counter) — */
      .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border:not(.counter) .news-articles-plain .news-feed-post {
        background-color: ${background} !important;
      }

      /* headline, teaser, and "read more" */
      ${staticContentCardSelector} .news-articles-plain .news-feed-post-headline,
      ${staticContentCardSelector} .news-articles-plain .news-feed-post-teaser span,
      ${staticContentCardSelector} .news-articles-plain .read-more {
        color: ${widgetTextColor} !important;
      }

      ${staticContentCardSelector} .content-widget-wrapper:has(a[href*="6813d9141acf7c2a0cf77cb3"]) > h2.content-widget-title span {
        color: ${widgetTextColor} !important;
      }

      /* publish-date & channel link */
      ${staticContentCardSelector} .news-articles-plain .news-feed-post-meta,
      ${staticContentCardSelector} .news-articles-plain .news-feed-post-meta a,
      ${staticContentCardSelector} .news-articles-plain .news-feed-post-meta .separator {
        color: ${metaTextColor} !important;
      }

      .full-width-bg:not(.page-footer) > .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border {
        background-color: ${background} !important;
      }
      
      .full-width-bg:not(.page-footer) > .static-content-wrapper.widget-on-card.no-shadow-border .ui-commons__section__column > h2 {
        color: ${widgetTextColor} !important;
      }
      
      .full-width-bg.page-footer > .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border {
        background-color: ${primary} !important;
        color: ${primaryInverse} !important;
      }

      /* only the real text spans/headings inside the footer card */
      .full-width-bg.page-footer .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border h3 span,
      .full-width-bg.page-footer .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border p span,
      .full-width-bg.page-footer .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border strong span {
        color: ${primaryInverse} !important;
      }


      /* ================= You Page Widgets ================= */
      .you-page .content-widget-wrapper:has(.user-pic),
      .you-page .portfolio-widget .ui-commons__portfolio-widget__panel-wrapper,
      .you-page .portfolio-widget .portfolio-panelstyle__LinkWrapper-sc-1mkrdc7-3 {
        background-color: ${vibrantBgColor} !important;
      }

      .you-page .content-widget-wrapper:has(.user-pic) h3 a,
      .you-page .portfolio-widget .portfolio-panelstyle__Title-sc-1mkrdc7-0,
      .you-page .portfolio-widget .portfolio-panelstyle__Description-sc-1mkrdc7-1 {
        color: ${vibrantTextColor} !important;
      }

      .you-page .portfolio-widget .portfolio-panelstyle__Chevron-sc-1mkrdc7-6 path {
        fill: ${vibrantTextColor} !important;
      }
      
      /* ================= Component-Specific Overrides ================= */
      .css-v9uw7m-IconStyled-Check {
        color: ${options.text} !important;
      }

      .css-htoegt-BadgeNumber {
        background-color: ${badgeBgColor} !important;
        color: ${badgeTextColor} !important;
      }

      .css-pw2ajm-ClearAllButton,
      #toolbar .toolbar-item.selected {
        color: ${vibrantBgColor} !important;
      }
      
      /* ================= Custom Icon Styling ================= */
      .css-zpzd8d-IconStyled-IconBase-baseAvatarStyles-IconWrap {
        background-color: ${iconBgColor} !important;
        color: ${options.text} !important;
      }


      /* ================= audio player (API-hosted only) ================= */
      div.audio-player:has(audio[src*="/api/media/"]) .audio-player__play-button.audio-player__play-button {
        background-color: ${primary} !important;
      }

      div.audio-player:has(audio[src*="/api/media/"]) .audio-player__meta {
        background-color: ${primary} !important;
        border-radius: 9px;
      }

      div.audio-player:has(audio[src*="/api/media/"]) {
        background-color: ${primary} !important;
      }

      div.audio-player:has(audio[src*="/api/media/"]) .audio-player__play-button.audio-player__play-button > svg {
        fill: ${text} !important;
      }

      div.audio-player:has(audio[src*="/api/media/"]) .audio-player__meta .audio-player__title,
      div.audio-player:has(audio[src*="/api/media/"]) .audio-player__meta .audio-player__duration,
      div.audio-player:has(audio[src*="/api/media/"]) .audio-player__meta .audio-player__file-size {
        color: ${primaryInverse} !important;
      }

      /* ================= homepage hero / .home-social ================= */
        html[data-plugin-id="page"].desktop:not(.without-page-background):has(.home-social)::before{
        background-image     : ${bgImage} !important;
        background-repeat    : no-repeat !important;
        background-size      : cover       !important;
        background-position  : ${bgImagePosition} !important;
        background-color     : #f4f9fb      !important;
      }

      /* ================= jobs widget buttons ================= */
      .content-widget-wrapper.static-content-wrapper.widget-on-card.jobs a.clickable.external-link {
        background-color: ${buttonBgColor} !important;
        color: ${buttonTextColor} !important;
        border-color: ${buttonBgColor} !important;
      }

      job-postings a {
        background: ${buttonBgColor} !important;
        color: ${buttonTextColor} !important;
      }


      /* ================= counter widget ================= */
      /* the card itself */
      .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border.counter{
        /* primary background */
        background-color: ${primary} !important;
      }

      /* every text bit that lives in the widget card */
      .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border.counter h1 span,
      .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border.counter h2 span,
      .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border.counter h3 span,
      .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border.counter p  span,
      .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border.counter strong span {
        /* inverse of primary */
        color: ${primaryInverse} !important;
      }

      .counter .cw-countdown-number-d,
      .counter .cw-countdown-number-h,
      .counter .cw-countdown-number-m,
      .counter .cw-countdown-number-s,
      .counter .cw-countdown-text-d,
      .counter .cw-countdown-text-h,
      .counter .cw-countdown-text-m,
      .counter .cw-countdown-text-s {
        width: 33% !important;
        background: ${hexToRgba(text, 0.4)} !important;
        color: ${text} !important;
      }
      
      /* Make the button have an inverted color scheme to stand out */
      /* the subscribe / register button */
      .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border.counter .group-subscription-block-button{
            background-color: ${text} !important;
            border-color     : ${text} !important;
            /* label + icon → inverse of text colour */
            color            : ${textOpposite} !important;
      }

        /* SVG icon inside the button needs its own fill */
        .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border.counter .group-subscription-block-button svg path{
          fill: ${textOpposite} !important;
        }

        /* “button-text” span inside the button */
        .content-widget-wrapper.static-content-wrapper.widget-on-card.no-shadow-border.counter .group-subscription-block-button .button-text{
          color: ${textOpposite} !important;
        }

      /* standalone button‐wrapper ================= */
      .content-widget-wrapper.button-wrapper .button-block-link {
        background-color: ${buttonBgColor} !important;
        color: ${buttonTextColor} !important;
        border-color: ${buttonBgColor} !important;
      }

      /* ================= specific header ================= */
      .desktop.wow-header-activated .css-1brf39v-HeaderBody {
        background-color: ${primary} !important;
        color: ${text} !important;
      }

      .desktop.wow-header-activated .css-8a35lc-Title {
        color: ${text} !important;
        display: none !important; /* Hide the title text */
      }
      
      .mobile .header-container {
        background-color: ${primary} !important;
        color: ${text} !important;
      }

      .mobile .header-container .header-button {
        color: ${text} !important;
      }

      .mobile header.header-container {
        background-color: ${primary} !important;
      }

      .mobile .header-title,
      .mobile header.header-container button span.we-icon {
        color: ${text} !important;
      }
      
      .css-t24td4-IconButtonStyled-IconStyled-IconButtonStyled-Icon-withComponent-IconStyled-HeaderButton-PrimaryHeaderButton {
        color: ${text} !important;
      }

      ${options.previewOnly ? `
      /* ================= Link Tiles widget (preview-only override) ===========
         GATED on previewOnly — only emitted by handlePreview /
         handleMobilePreview, never by handleCreateDemo / handleApplyDemoConfig.

         The Staffbase Link Tiles widget (data-widget-type="QuickLinks", rendered
         as .quick-links-widget) stores colors as INLINE styles on each <li>.
         Inline styles beat stylesheet selectors, so we need !important + a
         specific selector to override at the CSS layer FOR PREVIEW ONLY.

         Once branding is APPLIED, the rebrandHomePageLinkTiles op writes the
         new colors directly into the page's data-widget-conf-tile-bg-color /
         text-color attributes. After that, this CSS would mask the truth —
         even if the data write failed, the !important rule would keep
         painting the new color. So we omit it from the persistent CSS. */
      .quick-links-widget__item {
        background-color: ${options.tileBg || primary} !important;
        color: ${options.tileText || text} !important;
      }
      .quick-links-widget__item a,
      .quick-links-widget__item .clickable {
        color: ${options.tileText || text} !important;
      }
      ` : ''}
    `;
  };

  /**
   * Helper specifically for generating logo CSS.
   * This is called for both the main brand and each multi-brand.
   */
  const buildLogoCss = (options: BrandOptions, useVariables = true) => {
    const logoUrl = useVariables ? 'var(--logo-url)' : `url("${options.logo || ""}")`;
    if (options.logo) {
      return `
        /* ================= logo/header (Desktop) ================= */
        .desktop.wow-header-activated .header-left-container img.header-logo{ opacity: 0 !important; }
        .desktop.wow-header-activated .header-left-container::after{
          content: "" !important;
          position: absolute;
          inset: 0;
          background-image: ${logoUrl};
          background-repeat: no-repeat;
          background-size: contain;
          background-position: left center;
          pointer-events: none;
        }

        /* ================= logo/header (Mobile) ================= */
        /* Targets the specific mobile logo image tag and replaces its content */
        .mobile .header-container.with-logo .header-logo.css-v852x2-LogoImage {
          content: ${logoUrl} !important;
        }
      `;
    }
    // If no logo, ensure the default is visible on all platforms.
    return `
        /* Restore default logos if no custom one is provided */
        .desktop.wow-header-activated .header-left-container img.header-logo{ opacity: 1 !important; }
        .mobile .header-container.with-logo .header-logo.css-v852x2-LogoImage { content: normal !important; }
    `;
  };

  /* ════════════════════════════════════════════
     ASSEMBLE THE FINAL CSS STRING
     ════════════════════════════════════════════ */

  const prospectComment = o.prospectName
    ? `/* prospect:${o.prospectName.trim()} */\n`
    : "";

  // 1. Generate the MAIN branding CSS (colors, etc.)
  let finalCss = buildCssBlock(o, true);

  // 2. Add the MAIN logo CSS
  finalCss += buildLogoCss(o, true);

  // 3. Generate and append MULTI-BRANDING CSS
  if (multiBrandings && multiBrandings.length > 0) {
    let multiBrandCss = `\n\n/* ♡ REPLIFY MULTIBRANDING START ♡ */\n`;

    multiBrandings.forEach(brandConfig => {
      if (!brandConfig.groupId) return;

      // Map React state keys (e.g., primaryColor) to the keys this function expects (e.g., primary)
      const mappedBrandConfig = {
        primary: brandConfig.primaryColor,
        text: brandConfig.textColor,
        background: brandConfig.backgroundColor,
        floatingNavBg: brandConfig.floatingNavBgColor,
        floatingNavText: brandConfig.floatingNavTextColor,
        bg: brandConfig.bgUrl,
        logo: brandConfig.logoUrl,
        padW: brandConfig.logoPadWidth,
        padH: brandConfig.logoPadHeight,
        bgVert: brandConfig.bgVertical,
        changeLogoSize: brandConfig.changeLogoSize,
        logoHeight: brandConfig.logoHeight,
        logoMarginTop: brandConfig.logoMarginTop,
        headerTransparency: brandConfig.headerTransparency,
      };

      // Remove any undefined keys so they don't overwrite valid defaults from the main brand
      (Object.keys(mappedBrandConfig) as (keyof typeof mappedBrandConfig)[]).forEach(key => {
        if (mappedBrandConfig[key] === undefined) {
          delete mappedBrandConfig[key];
        }
      });

      const brandOptions = { ...o, ...mappedBrandConfig } as BrandOptions;

      // Create a data comment with the raw color values for easier parsing
      const colorData = {
        primaryColor: brandOptions.primary,
        textColor: brandOptions.text,
        backgroundColor: brandOptions.background,
        floatingNavBgColor: brandOptions.floatingNavBg,
        floatingNavTextColor: brandOptions.floatingNavText,
      };
      const dataComment = `/* ♡ data: ${JSON.stringify(colorData)} ♡ */`;

      // Generate color/background styles for this group
      let singleBrandBlock = buildCssBlock(brandOptions, false);

      // Generate logo styles for this group
      singleBrandBlock += buildLogoCss(brandOptions, false);

      // Scope CSS variables by replacing ':root' with the group class
      const prefix = `.group-${brandConfig.groupId}`;
      const prefixedCssBlock = singleBrandBlock.replace(
        /([^\r\n,{}]+)(,(?=[^}]*{)|\s*{)/g,
        (match, selector, suffix) => {
          const trimmedSelector = selector.trim();
          // Avoid prefixing @-rules or comments
          if (trimmedSelector.startsWith('@') || trimmedSelector.startsWith('/*') || trimmedSelector === ':root') {
            return match;
          }

          if (trimmedSelector.startsWith('html') || trimmedSelector.startsWith('.mobile') || trimmedSelector.startsWith('.desktop') || trimmedSelector.startsWith('.wow-header-activated')) {
            if (trimmedSelector.startsWith('html')) return `html${prefix}${trimmedSelector.substring(4)}${suffix}`;
            return `${prefix}${trimmedSelector}${suffix}`;
          }          
          return `${prefix} ${trimmedSelector}${suffix}`;
        }
      );

      multiBrandCss += `\n/* Branding for Group ID: ${brandConfig.groupId} */\n`;
      multiBrandCss += `${dataComment}\n`;
      multiBrandCss += prefixedCssBlock;
    });

    multiBrandCss += `\n/* ♡ REPLIFY MULTIBRANDING END ♡ */\n`;
    finalCss += multiBrandCss;
  }

  // 4. Append any raw custom CSS from admin mode
  if (customCss && customCss.trim()) {
    finalCss += `\n\n/* ♡ REPLIFY ADMIN OVERRIDES START ♡ */\n${customCss.trim()}\n/* ♡ REPLIFY ADMIN OVERRIDES END ♡ */\n`;
  }

  // 5. Return the complete string with the prospect comment
  return prospectComment + finalCss;
}

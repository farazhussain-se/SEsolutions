/* dist/content/mobilePreviewPage.js */

(() => {
    const MOBILE_PREVIEW_PARAM = 'replify_mobile_preview';

    try {
        if (new URL(window.location.href).searchParams.get(MOBILE_PREVIEW_PARAM) !== '1') return;
    } catch (error) {
        console.warn('[Replify MobilePreview] Failed to inspect URL in page context:', error);
        return;
    }

    if (window.__replifyMobilePreviewPagePatched) return;
    window.__replifyMobilePreviewPagePatched = true;

    const root = document.documentElement;
    const iphoneUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

    // Strip server-baked desktop hints from <html> before Staffbase's app.js reads them.
    // Server sniffs the request UA and bakes in `web chrome` (or `mac`, etc.); we want `iphone safari`.
    const stripDesktopHints = () => {
        const remove = ['desktop', 'wide', 'mouse', 'mac', 'web', 'chrome', 'firefox', 'edge'];
        const add = ['mobile', 'compact', 'touch', 'ios', 'iphone', 'safari'];
        remove.forEach((c) => root.classList.remove(c));
        add.forEach((c) => root.classList.add(c));
    };
    stripDesktopHints();

    const overrideGetter = (target, key, getter) => {
        if (!target) return false;
        try {
            Object.defineProperty(target, key, { configurable: true, get: getter });
            return true;
        } catch (error) {
            return false;
        }
    };

    const buildMediaQueryList = (query, matches) => ({
        matches,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true; },
    });

    const nativeMatchMedia = window.matchMedia ? window.matchMedia.bind(window) : null;
    if (nativeMatchMedia) {
        window.matchMedia = (query) => {
            const normalizedQuery = String(query || '').toLowerCase();

            if (
                normalizedQuery.includes('pointer: coarse') ||
                normalizedQuery.includes('any-pointer: coarse') ||
                normalizedQuery.includes('hover: none') ||
                normalizedQuery.includes('any-hover: none') ||
                normalizedQuery.includes('orientation: portrait')
            ) {
                return buildMediaQueryList(query, true);
            }

            if (
                normalizedQuery.includes('pointer: fine') ||
                normalizedQuery.includes('hover: hover') ||
                normalizedQuery.includes('any-pointer: fine') ||
                normalizedQuery.includes('any-hover: hover')
            ) {
                return buildMediaQueryList(query, false);
            }

            return nativeMatchMedia(query);
        };
    }

    overrideGetter(Navigator.prototype, 'userAgent', () => iphoneUserAgent);
    overrideGetter(Navigator.prototype, 'appVersion', () => iphoneUserAgent);
    overrideGetter(Navigator.prototype, 'platform', () => 'iPhone');
    overrideGetter(Navigator.prototype, 'vendor', () => 'Apple Computer, Inc.');
    overrideGetter(Navigator.prototype, 'maxTouchPoints', () => 5);
    overrideGetter(Navigator.prototype, 'standalone', () => false);

    if ('userAgentData' in Navigator.prototype) {
        overrideGetter(Navigator.prototype, 'userAgentData', () => ({
            brands: [{ brand: 'Safari', version: '17' }],
            mobile: true,
            platform: 'iOS',
            getHighEntropyValues: async () => ({
                architecture: 'arm',
                bitness: '64',
                mobile: true,
                model: 'iPhone',
                platform: 'iOS',
                platformVersion: '17.0.0',
                uaFullVersion: '17.0.0',
                wow64: false,
            }),
            toJSON() {
                return {
                    brands: this.brands,
                    mobile: this.mobile,
                    platform: this.platform,
                };
            },
        }));
    }

    overrideGetter(Window.prototype, 'ontouchstart', () => null);
    overrideGetter(window, 'orientation', () => 0);
    overrideGetter(screen, 'width', () => 390);
    overrideGetter(screen, 'availWidth', () => 390);
    overrideGetter(screen, 'height', () => 844);
    overrideGetter(screen, 'availHeight', () => 844);
    overrideGetter(screen, 'orientation', () => ({ type: 'portrait-primary', angle: 0 }));

    root.setAttribute('data-replify-mobile-sim', 'active');
    root.setAttribute('data-replify-mobile-sim-user-agent', iphoneUserAgent);
    root.setAttribute('data-replify-mobile-sim-touch', '5');
    root.setAttribute('data-replify-mobile-sim-pointer', 'coarse');
    root.setAttribute('data-replify-mobile-sim-source', 'page-script');

    const notifyPage = () => {
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('orientationchange'));
        document.dispatchEvent(new CustomEvent('replify-mobile-sim-ready'));
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', notifyPage, { once: true });
    } else {
        setTimeout(notifyPage, 0);
    }
})();

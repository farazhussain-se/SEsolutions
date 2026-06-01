/* dist/content/mobilePreview.js */

(() => {
    const MOBILE_PREVIEW_PARAM = 'replify_mobile_preview';
    const ENABLED = (() => {
        try {
            return new URL(window.location.href).searchParams.get(MOBILE_PREVIEW_PARAM) === '1';
        } catch (error) {
            console.warn('[Replify MobilePreview] Failed to inspect URL:', error);
            return false;
        }
    })();

    if (!ENABLED || window.__replifyMobilePreviewInitialized) return;
    window.__replifyMobilePreviewInitialized = true;

    const root = document.documentElement;
    const ROOT_REMOVE_CLASSES = ['desktop', 'wide', 'mouse', 'mac'];
    const ROOT_ADD_CLASSES = ['mobile', 'compact', 'touch', 'ios'];
    const BODY_REMOVE_CLASSES = ['using-mouse'];
    const BODY_ADD_CLASSES = ['using-touch'];

    const setPreviewAttributes = (mode = 'booting') => {
        root.setAttribute('data-replify-mobile-sim', mode);
        root.setAttribute('data-replify-mobile-sim-touch', '5');
        root.setAttribute('data-replify-mobile-sim-pointer', 'coarse');
        root.setAttribute('data-replify-mobile-sim-source', 'content-script');
        root.setAttribute('data-replify-mobile-sim-root-classes', root.className);
    };

    const ensureViewportMeta = () => {
        let viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            (document.head || document.documentElement).appendChild(viewport);
        }
        viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    };

    const ensureStyle = () => {
        if (document.getElementById('replify-mobile-sim-style')) return;

        const style = document.createElement('style');
        style.id = 'replify-mobile-sim-style';
        style.textContent = `
            html[data-replify-mobile-sim] {
                --replify-phone-width: min(390px, calc(100vw - 44px));
                --replify-phone-height: min(844px, calc(100vh - 86px));
                --replify-phone-top-gap: 24px;
                --replify-phone-bottom-gap: 14px;
                --replify-phone-home-gap: 20px;
            }

            html[data-replify-mobile-sim],
            html[data-replify-mobile-sim] body {
                min-height: 100%;
                overflow-x: hidden !important;
                background:
                    radial-gradient(circle at top, rgba(0, 164, 253, 0.18), transparent 44%),
                    linear-gradient(180deg, #edf4f8 0%, #dfe8ee 100%) !important;
            }

            html[data-replify-mobile-sim] body {
                box-sizing: border-box;
                width: var(--replify-phone-width) !important;
                max-width: var(--replify-phone-width) !important;
                height: var(--replify-phone-height) !important;
                min-height: var(--replify-phone-height) !important;
                max-height: var(--replify-phone-height) !important;
                margin: var(--replify-phone-top-gap) auto var(--replify-phone-bottom-gap) !important;
                border: 10px solid #0f172a !important;
                border-radius: 34px !important;
                box-shadow:
                    0 22px 54px rgba(15, 23, 42, 0.25),
                    0 10px 22px rgba(15, 23, 42, 0.12) !important;
                background: #ffffff !important;
                position: relative !important;
                overflow-x: hidden !important;
                overflow-y: auto !important;
            }

            html[data-replify-mobile-sim] body::before {
                content: '';
                position: fixed;
                top: var(--replify-phone-top-gap);
                left: 50%;
                width: 118px;
                height: 24px;
                transform: translateX(-50%);
                border-radius: 0 0 16px 16px;
                background: #0f172a;
                z-index: 2147483645;
                pointer-events: none;
            }

            html[data-replify-mobile-sim] body::after {
                content: '';
                position: fixed;
                bottom: var(--replify-phone-home-gap);
                left: 50%;
                width: 132px;
                height: 5px;
                transform: translateX(-50%);
                border-radius: 999px;
                background: rgba(15, 23, 42, 0.35);
                z-index: 2147483645;
                pointer-events: none;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    };

    const enforceMobileClasses = () => {
        ROOT_REMOVE_CLASSES.forEach((className) => root.classList.remove(className));
        ROOT_ADD_CLASSES.forEach((className) => root.classList.add(className));

        if (document.body) {
            BODY_REMOVE_CLASSES.forEach((className) => document.body.classList.remove(className));
            BODY_ADD_CLASSES.forEach((className) => document.body.classList.add(className));
        }

        root.setAttribute('data-replify-mobile-sim-root-classes', root.className);
    };


    let enforcementScheduled = false;
    const scheduleEnforcement = () => {
        if (enforcementScheduled) return;
        enforcementScheduled = true;
        requestAnimationFrame(() => {
            enforcementScheduled = false;
            ensureViewportMeta();
            ensureStyle();
            enforceMobileClasses();
            setPreviewAttributes(root.getAttribute('data-replify-mobile-sim') || 'booting');
        });
    };

    setPreviewAttributes('booting');
    ensureViewportMeta();
    ensureStyle();
    enforceMobileClasses();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleEnforcement, { once: true });
    } else {
        scheduleEnforcement();
    }

    const observer = new MutationObserver(() => {
        scheduleEnforcement();
    });

    observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class'],
    });
})();

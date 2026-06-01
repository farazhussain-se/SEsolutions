/* dist/content/analytics.js */
console.log("[Replify] Analytics Content Script Loader Executed. Path:", window.location.pathname);

// Initialize config object 
window.replifyAnalyticsConfig = { numberOfEmployees: 5000 };

/**
 * Broadcast config into the page context (not just the content-script world).
 * - Emits a CustomEvent on document so page scripts can react.
 * - Writes to a data attribute for synchronous reads (no inline script needed).
 * - Keeps the postMessage flow for backwards compatibility.
 */
function broadcastConfigToPage(config) {
    // Post to page (works across the isolated world boundary)
    window.postMessage({ type: 'REPLIFY_ANALYTICS_CONFIG', config: config }, window.location.origin);

    // Mirror into a data attribute for synchronous access without violating CSP.
    try {
        const serialized = JSON.stringify(config).replace(/</g, '\\u003c');
        document.documentElement.setAttribute('data-replify-analytics-config', serialized);
    } catch (e) {
        console.warn("[Replify CS] Unable to serialize config for dataset:", e);
    }

    // Dispatch a CustomEvent in the page context
    document.dispatchEvent(new CustomEvent('replify-analytics-config-ready', { detail: config }));
}

/**
 * Retrieves the analytics configuration from storage and sends it to the page via postMessage.
 * This is called both on initial load and on SPA navigations.
 */
function postConfigToPage() {
    if (!chrome.storage?.local) {
        console.warn("[Replify] Chrome storage not available. Using fallback config.");
        broadcastConfigToPage({ numberOfEmployees: 5000 });
        return;
    }

    chrome.storage.local.get(["redirectAnalyticsState"], (result) => {
        if (chrome.runtime.lastError) {
            return console.error("[Replify CS] Error getting config:", chrome.runtime.lastError);
        }
        
        const state = result.redirectAnalyticsState || {};
        const employeeCount = state.numberOfEmployees || 5000;
        const config = { numberOfEmployees: employeeCount };
        window.replifyAnalyticsConfig.numberOfEmployees = employeeCount;
        broadcastConfigToPage(config);
        console.log("[Replify CS] Posted config to page. Employee count:", employeeCount);
    });
}

function isHostAllowed(state, host) {
    console.log("[Replify CS] Checking host allowance for", host);
    const allowAll = !!state.allowAllStaffbase;
    const allowedDomains = Array.isArray(state.allowedDomains) ? state.allowedDomains : [];
    console.log("[Replify CS] Allow all staffbase:", allowAll, "Allowed domains:", allowedDomains);
    if (host === 'app.staffbase.com') return true;
    if (allowAll && (host.endsWith('staffbase.com') || host.endsWith('staffbase.rocks') || host.endsWith('staffbase.dev'))) return true;
    return allowedDomains.includes(host);
}

// --- SINGLE CONFIGURATION OBJECT ---
// All patch information is defined in one place.
// To add a new patch, just add a new entry here.
const PATCH_CONFIG = {
    campaigns: {
        urlCheck: (pathname) => pathname.startsWith("/studio/analytics/campaigns"),
        scriptPath: 'content/analytics/campaigns.js'
    },
    posts: {
        urlCheck: (pathname) => pathname.startsWith("/content/news/article/"),
        scriptPath: 'content/analytics/posts.js'
    },
    email: {
        urlCheck: (pathname) => pathname.includes("/studio/analytics/email") || pathname.startsWith("/studio/email/"),
        scriptPath: 'content/analytics/email.js'
    },
    news: {
        urlCheck: (pathname) => pathname.startsWith("/admin/analytics/news"),
        scriptPath: 'content/analytics/news.js'
    },
    hashtags: {
        urlCheck: (pathname) => pathname.includes("/studio/analytics/hashtags"),
        scriptPath: 'content/analytics/hashtags.js'
    },
    dashboard: {
        urlCheck: (pathname) => pathname.replace(/\/$/, '') === "/studio",
        scriptPath: 'content/analytics/dashboard.js'
    },
    user: {
        urlCheck: (pathname) => pathname.includes("/admin/analytics/users"),
        scriptPath: 'content/analytics/user.js'
    },
    search: {
        urlCheck: (pathname) => pathname.includes("/studio/analytics/search"),
        scriptPath: 'content/analytics/search.js'
    },
    pages: {
        urlCheck: (pathname) => pathname.includes("/studio/analytics/pages"),
        scriptPath: 'content/analytics/pages.js'
    },
    chat: {
        urlCheck: (pathname) => pathname.includes("/admin/analytics/chat"),
        scriptPath: 'content/analytics/chat.js'
    },
    editorial: {
        urlCheck: (pathname) => pathname.startsWith("/studio/planning/editorial-calendar"),
        scriptPath: 'content/analytics/editorial.js'
    },
    governance: {
        urlCheck: (pathname) => pathname.includes("/studio/content/page/governance"),
        scriptPath: 'content/analytics/governance.js'
    },
};

// --- GLOBAL STATE & OBSERVERS ---
const patchState = {}; // Single object to track active state, e.g., patchState.news = true
let campaignsMutationObserver = null;

// --- GENERIC PATCH APPLIER ---
// This one function replaces all the individual `apply...Patch` functions.
function applyPatch(type) {
    const config = PATCH_CONFIG[type];
    if (!config) return;

    if (patchState[type]) return; // Already active

    console.log(`[Replify ${type}PatchCS]: Applying Patch via SCRIPT SRC INJECTION...`);
    const scriptId = `replify-${type}-fetch-override-script`;

    // Clean up old script if it exists
    const oldScriptElement = document.getElementById(scriptId);
    if (oldScriptElement) oldScriptElement.remove();

    const scriptElement = document.createElement('script');
    scriptElement.id = scriptId;
    scriptElement.src = chrome.runtime.getURL(config.scriptPath);
    scriptElement.onload = () => console.log(`[Replify ${type}PatchCS]: Injected ${config.scriptPath} loaded.`);
    scriptElement.onerror = () => console.error(`[Replify ${type}PatchCS]: ERROR loading injected ${config.scriptPath}.`);
    (document.head || document.documentElement).appendChild(scriptElement);
    patchState[type] = true;
}

// --- SPECIAL CAMPAIGNS LOGIC ---
function handleCampaignsPatch(storageEnabled) {
    const isOnCampaignsPage = PATCH_CONFIG.campaigns.urlCheck(window.location.pathname);

    if (campaignsMutationObserver) {
        campaignsMutationObserver.disconnect();
    }
    
    if (!isOnCampaignsPage || !storageEnabled) {
        return;
    }

    // Apply the standard script injection
    applyPatch('campaigns');
    
    // Apply the special MutationObserver logic for campaigns
    function removeYearFromAxisDates_CS() {
        document.querySelectorAll('g.visx-axis-bottom text > tspan, g.visx-axis-left text > tspan').forEach(tspan => {
            const match = tspan.textContent.trim().match(/^(\d{1,2}\/\d{1,2})\/\d{2,4}$/);
            if (match && match[1]) tspan.textContent = match[1];
        });
    }

    campaignsMutationObserver = new MutationObserver(() => {
        if (document.querySelector('g.visx-axis-bottom') || document.querySelector('g.visx-axis-left')) {
            removeYearFromAxisDates_CS();
        }
    });

    if (window.location.pathname.includes('/studio/analytics/campaigns/') && !window.location.pathname.endsWith('/campaigns')) {
        campaignsMutationObserver.observe(document.body, { childList: true, subtree: true });
    }
}


// --- MAIN EXECUTION LOGIC ---
function executeEnabledPatches({ preload = false } = {}) {
    if (!chrome.storage || !chrome.storage.local) {
        console.error("[Replify] Chrome storage API not available.");
        return;
    }

    // On navigation, reset the active state of all non-campaigns patches
    Object.keys(patchState).forEach(key => {
        if (key !== 'campaigns') patchState[key] = false;
    });

    chrome.storage.local.get(["redirectAnalyticsState"], (result) => {
        const state = result.redirectAnalyticsState || {};
        const employeeCount = state.numberOfEmployees || 5000;
        const currentPathname = window.location.pathname;
        const host = window.location.hostname;

        if (!isHostAllowed(state, host)) {
            console.log("[Replify] Host not allowed for analytics", host);
            return;
        }

        window.replifyAnalyticsConfig.numberOfEmployees = employeeCount;

        document.dispatchEvent(new CustomEvent('replify-analytics-config-ready', { detail: window.replifyAnalyticsConfig }));
        broadcastConfigToPage(window.replifyAnalyticsConfig);

        // NOW inject scripts - they'll find the config already on window
        for (const type in PATCH_CONFIG) {
            const config = PATCH_CONFIG[type];
            const storageSaysEnable = state[type] === true;
            const onCorrectPage = preload || config.urlCheck(currentPathname);

            if (type === 'campaigns') {
                handleCampaignsPatch(storageSaysEnable);
            } else {
                if (storageSaysEnable && onCorrectPage) {
                    applyPatch(type);
                }
            }
        }

        // Also post via message for any scripts that are already loaded (SPA nav case)
        postConfigToPage();
    });
}


// --- INITIALIZATION & LISTENERS ---
executeEnabledPatches({ preload: true });

if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.redirectAnalyticsState) {
            console.log("[Replify] Storage changed, re-evaluating patches.");
            executeEnabledPatches();
        }
    });
}

// Use modern Navigation API if available, otherwise fall back
if (window.navigation && typeof window.navigation.addEventListener === 'function') {
    window.navigation.addEventListener('navigatesuccess', executeEnabledPatches);
    window.navigation.addEventListener('navigateerror', (e) => {
        console.error("[Replify] SPA 'navigateerror' event:", e.message);
    });
} else {
    // Fallback for older browsers
    let oldHref = document.location.href;
    const observer = new MutationObserver(() => {
        if (oldHref !== document.location.href) {
            oldHref = document.location.href;
            executeEnabledPatches();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', executeEnabledPatches);
}

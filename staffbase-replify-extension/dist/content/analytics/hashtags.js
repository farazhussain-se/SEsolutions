// Patches window.fetch on the Hashtags analytics page to boost click and visit counts
// proportional to the number of posts and pages tagged with each hashtag.
(function () {
    'use strict';

    const INJECTED_LOG_PREFIX = '[Replify InjectedHashtagsPatch]:';
    if (window.__REPLIFY_HASHTAGS_FETCH_APPLIED__) {
        return;
    }

    const pageContextOriginalFetch = window.fetch;
    if (!pageContextOriginalFetch) {
        console.error(INJECTED_LOG_PREFIX, 'CRITICAL: window.fetch is null/undefined in page context!');
        return;
    }

    const rand = (min, max) => {
        min = Math.ceil(min); max = Math.floor(max);
        if (min > max) [min, max] = [max, min];
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    const randFloat = (min, max, decimals = 2) => {
        const str = (Math.random() * (max - min) + min).toFixed(decimals);
        return parseFloat(str);
    };

    const TARGET_HASHTAG_API_URL = '/api/branch/analytics/hashtags/contentsVisitsClicks';

    const injectedHashtagsCustomFetch = async function(...args) {
        const resource = args[0];
        const requestFullUrl = typeof resource === 'string' ? resource : resource.url;
        let urlPath = '';

        try {
            const parsedUrl = new URL(requestFullUrl, window.location.origin);
            urlPath = parsedUrl.pathname;
        } catch (e) {
            if (requestFullUrl.startsWith('/')) {
                 urlPath = requestFullUrl.split('?')[0];
            } else {
                return pageContextOriginalFetch.apply(this, args);
            }
        }

        if (urlPath === TARGET_HASHTAG_API_URL) {
            try {
                const response = await pageContextOriginalFetch.apply(this, args);
                let originalJsonData = []; 

                if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
                    originalJsonData = await response.clone().json();
                } else if (!response.ok) {
                    console.warn(INJECTED_LOG_PREFIX, `Original request for ${TARGET_HASHTAG_API_URL} failed with status ${response.status}. Returning empty array.`);
                     return new Response(JSON.stringify([]), {
                        status: 200, statusText: "OK", headers: {'Content-Type': 'application/json'}
                    });
                }
                if (!Array.isArray(originalJsonData)) {
                    console.warn(INJECTED_LOG_PREFIX, `Original data for ${TARGET_HASHTAG_API_URL} is not an array. Returning empty array.`);
                    originalJsonData = [];
                }

                let modifiedData = [];

                if (originalJsonData.length > 0) {
                    modifiedData = originalJsonData.map(item => {
                        const newItem = { ...item }; 

                        const baseClicksToAdd = rand(item.posts > 0 || item.pages > 0 ? 3 : 1, item.posts > 0 || item.pages > 0 ? 15 : 5);
                        const clicksFromPosts = item.posts > 0 ? Math.floor(item.posts * randFloat(0.5, 2.5)) : 0;
                        const clicksFromPages = item.pages > 0 ? Math.floor(item.pages * randFloat(0.5, 2.5)) : 0;
                        newItem.clicks = (newItem.clicks || 0) + baseClicksToAdd + clicksFromPosts + clicksFromPages;
                        
                        const baseVisitsToAdd = rand(item.posts > 0 || item.pages > 0 ? 5 : 2, item.posts > 0 || item.pages > 0 ? 25 : 10);
                        const visitsFromPosts = item.posts > 0 ? Math.floor(item.posts * randFloat(1, 5)) : 0;
                        const visitsFromPages = item.pages > 0 ? Math.floor(item.pages * randFloat(1, 5)) : 0;
                        newItem.visits = (newItem.visits || 0) + baseVisitsToAdd + visitsFromPosts + visitsFromPages;

                        if (newItem.visits < newItem.clicks) {
                            newItem.visits = newItem.clicks + rand(0, Math.floor(newItem.clicks * 0.2) + 1);
                        }
                        
                        newItem.clicks = Math.max(0, newItem.clicks);
                        newItem.visits = Math.max(0, newItem.visits);
                        
                        return newItem;
                    });
                }
                
                return new Response(JSON.stringify(modifiedData), {
                    status: 200, statusText: "OK", headers: {'Content-Type': 'application/json'}
                });

            } catch (err) {
                console.error(INJECTED_LOG_PREFIX + ` Error during fetch interception for ${requestFullUrl}:`, err);
                return new Response(JSON.stringify([]), {status: 200, headers: {'Content-Type': 'application/json'}});
            }
        }
        return pageContextOriginalFetch.apply(this, args);
    };

    window.fetch = injectedHashtagsCustomFetch;
    window.__REPLIFY_HASHTAGS_FETCH_APPLIED__ = true;

    window.__REPLIFY_REVERT_HASHTAGS_FETCH__ = function() {
        if (window.fetch === injectedHashtagsCustomFetch) {
            window.fetch = pageContextOriginalFetch;
            delete window.__REPLIFY_HASHTAGS_FETCH_APPLIED__;
            delete window.__REPLIFY_REVERT_HASHTAGS_FETCH__;
            console.log(INJECTED_LOG_PREFIX + ' Hashtags fetch restored by revert function.');
            return true;
        }
        return false;
    };
})();
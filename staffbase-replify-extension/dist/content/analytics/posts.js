// Patches window.fetch for individual post detail analytics (stats, visit sources, reactions,
// video views). Reads the post ID from the page URL and exits early if none is found.
(function () {
    'use strict';

    const INJECTED_LOG_PREFIX = '[Replify InjectedPostsPatch]:';
    if (window.__REPLIFY_POSTS_FETCH_APPLIED__) {
        return;
    }

    const pageContextOriginalFetch = window.fetch;
    if (!pageContextOriginalFetch) {
        console.error(INJECTED_LOG_PREFIX, 'CRITICAL: window.fetch is null/undefined in page context!');
        return;
    }

    let CURRENT_POST_ID = null;
    const postStatsStore = {
        postId: null,
        registeredVisitors: null,
        registeredVisits: null,
        comments: null,
        likes: null, // Stores the count for "LIKE" type reactions specifically
        shares: null,
        totalReactions: null, // Sum of all reaction types
        videoViewersDistinct: null,
    };

    function extractPostIdFromPageUrl() {
        const pathParts = window.location.pathname.split('/');
        const articleIndex = pathParts.indexOf('article');
        if (articleIndex !== -1 && articleIndex + 1 < pathParts.length) {
            const potentialId = pathParts[articleIndex + 1];
            if (/^[a-f0-9]{24}$/i.test(potentialId)) {
                return potentialId;
            }
        }
        console.warn(INJECTED_LOG_PREFIX + ' Could not reliably extract Post ID from URL: ' + window.location.href);
        return null;
    }

    CURRENT_POST_ID = extractPostIdFromPageUrl();

    if (!CURRENT_POST_ID) {
        console.log(INJECTED_LOG_PREFIX + ' No Post ID found in URL, script will not intercept post-specific APIs.');
        return; // Don't override fetch if no post ID
    }
    console.log(INJECTED_LOG_PREFIX + ' Active Post ID: ' + CURRENT_POST_ID);
    postStatsStore.postId = CURRENT_POST_ID;

    const rand = (min, max) => {
        min = Math.ceil(min);
        max = Math.floor(max);
        if (min > max) [min, max] = [max, min];
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    const visitSourceTemplates = [
        { platform: "web", utmSource: "in-app", utmMedium: "feed", baseWeightCategory: "in-app-high" },
        { platform: "web", utmSource: "in-app", utmMedium: "feedwidget", baseWeightCategory: "in-app-high" },
        { platform: "web", utmSource: "in-app", utmMedium: "stagewidget", baseWeightCategory: "in-app-medium" },
        { platform: "web", utmSource: "in-app", utmMedium: "search", baseWeightCategory: "in-app-low" },
        { platform: "web", utmSource: "in-app", utmMedium: "direct-link", baseWeightCategory: "in-app-medium" },
        { platform: "web", utmSource: "in-app", utmMedium: "link", baseWeightCategory: "in-app-low" },
        { platform: "web", utmSource: "in-app", utmMedium: "comment-notification", baseWeightCategory: "in-app-low" },
        { platform: "ios", utmSource: "in-app", utmMedium: "feed", baseWeightCategory: "mobile-high" },
        { platform: "ios", utmSource: "in-app", utmMedium: "feedwidget", baseWeightCategory: "mobile-high" },
        { platform: "android", utmSource: "in-app", utmMedium: "feed", baseWeightCategory: "mobile-high" },
        { platform: "android", utmSource: "in-app", utmMedium: "feedwidget", baseWeightCategory: "mobile-high" },
        { platform: "ios", utmSource: "in-app", utmMedium: "search", baseWeightCategory: "mobile-low" },
        { platform: "android", utmSource: "in-app", utmMedium: "search", baseWeightCategory: "mobile-low" },
        { platform: "ios", utmSource: "", utmMedium: "", baseWeightCategory: "mobile-direct" },
        { platform: "android", utmSource: "", utmMedium: "", baseWeightCategory: "mobile-direct" },
        { platform: "web", utmSource: "ms-sharepoint", utmMedium: "feed", baseWeightCategory: "sharepoint" },
        { platform: "web", utmSource: "ms-sharepoint", utmMedium: "search", baseWeightCategory: "sharepoint-low" },
        { platform: "web", utmSource: "", utmMedium: "", baseWeightCategory: "web-direct" },
    ];

    const getTargetApiPatterns = () => ({
        COMMENTS_COUNT: `/api/comments-count?parentId=${CURRENT_POST_ID}&parentType=post`,
        POSTS_STATS_BASE: `/api/branch/analytics/posts/stats?filter=post.id+eq+%22${CURRENT_POST_ID}%22`, // Note: URL encoded quotes
        VISITS_GROUPED: `/api/branch/analytics/post/${CURRENT_POST_ID}/visits?groupBy=`,
        VIDEO_VIEWS: `/api/branch/analytics/post/${CURRENT_POST_ID}/primaryVideoViews`,
        REACTIONS_COUNT: `/api/reactions-count?parentId=${CURRENT_POST_ID}&parentType=post`
    });

    const injectedPostsCustomFetch = async function(...args) {
        if (!CURRENT_POST_ID) { // Double check, though initial script exit should prevent this.
            return pageContextOriginalFetch.apply(this, args);
        }

        const resource = args[0];
        const requestFullUrl = typeof resource === 'string' ? resource : resource.url;
        let urlPathAndSearch = '';

        try {
            const parsedUrl = new URL(requestFullUrl, window.location.origin);
            urlPathAndSearch = parsedUrl.pathname + parsedUrl.search;
        } catch (e) {
            if (requestFullUrl.startsWith('/')) { // Relative URL
                 urlPathAndSearch = requestFullUrl;
            } else { // Not a fetch URL we can parse or work with easily
                return pageContextOriginalFetch.apply(this, args);
            }
        }
        // console.log(INJECTED_LOG_PREFIX, 'PostsFetch processing URL:', urlPathAndSearch); // For debugging all URLs

        let matchedEndpointKey = null;
        const POST_API_URLS = getTargetApiPatterns();

        for (const key in POST_API_URLS) {
            const pattern = POST_API_URLS[key];
            // Exact match for full query URLs, startsWith for base URLs that have more query params
            if (key === 'POSTS_STATS_BASE' && urlPathAndSearch.startsWith(pattern)) {
                matchedEndpointKey = 'POSTS_STATS';
                break;
            } else if (key === 'VISITS_GROUPED' && urlPathAndSearch.startsWith(pattern)) {
                matchedEndpointKey = 'VISITS_GROUPED'; // This will catch various groupBy values
                break;
            } else if (pattern === urlPathAndSearch) { // Exact match for simpler URLs
                matchedEndpointKey = key;
                break;
            }
        }

        if (matchedEndpointKey) {
            console.log(INJECTED_LOG_PREFIX + ` Intercepting ${matchedEndpointKey}: ${requestFullUrl.substring(0,150)}`);
            try {
                const response = await pageContextOriginalFetch.apply(this, args);
                if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
                    return response;
                }
                const clonedResponse = response.clone();
                let originalJsonData = await clonedResponse.json();
                let modifiedData = JSON.parse(JSON.stringify(originalJsonData)); // Deep clone

                switch (matchedEndpointKey) {
                    case 'POSTS_STATS':
                        modifiedData.registeredVisitors = rand(25, 40); // Adjusted to be medium-low
                        postStatsStore.registeredVisitors = modifiedData.registeredVisitors > 0 ? modifiedData.registeredVisitors : 1;

                        modifiedData.registeredVisits = postStatsStore.registeredVisitors * rand(1, 3) + rand(Math.floor(postStatsStore.registeredVisitors * 0.2), postStatsStore.registeredVisitors * 2);
                        modifiedData.registeredVisits = Math.max(modifiedData.registeredVisits, postStatsStore.registeredVisitors);

                        modifiedData.comments = rand(0, Math.floor(postStatsStore.registeredVisitors * 0.10)); // Slightly lower comment ratio
                        modifiedData.likes = rand( // "LIKE" type reactions
                            Math.floor(postStatsStore.registeredVisitors * 0.05),
                            Math.floor(postStatsStore.registeredVisitors * 0.40) // Lowered upper bound
                        );
                        modifiedData.shares = rand(0, Math.floor(postStatsStore.registeredVisitors * 0.03));
                        modifiedData.newPosts = 1; // Always 1 for a single post stats API

                        postStatsStore.registeredVisits = modifiedData.registeredVisits;
                        postStatsStore.comments = modifiedData.comments;
                        postStatsStore.likes = modifiedData.likes; // Store the count for LIKE type
                        postStatsStore.shares = modifiedData.shares;
                        break;

                    case 'COMMENTS_COUNT':
                        if (postStatsStore.comments !== null) {
                            modifiedData.total = postStatsStore.comments;
                        } else {
                            modifiedData.total = rand(0, 5); // Fallback
                            postStatsStore.comments = modifiedData.total;
                        }
                        break;

                    case 'REACTIONS_COUNT':
                        let baseLikeCount = (postStatsStore.likes !== null)
                            ? postStatsStore.likes
                            : rand(Math.floor((postStatsStore.registeredVisitors || 20) * 0.05), Math.floor((postStatsStore.registeredVisitors || 80) * 0.3));
                        if (postStatsStore.likes === null) postStatsStore.likes = baseLikeCount; // Store if it was just generated

                        const generatedReactions = [
                            { type: "LIKE", count: baseLikeCount },
                            { type: "THANKS", count: rand(0, Math.max(1, Math.floor(baseLikeCount * 0.4))) },
                            { type: "INSIGHTFUL", count: rand(0, Math.max(1, Math.floor(baseLikeCount * 0.25))) },
                            { type: "CELEBRATE", count: rand(0, Math.max(1, Math.floor(baseLikeCount * 0.35))) }
                        ];
                        if (baseLikeCount < 2) {
                            generatedReactions.forEach(rt => { if (rt.type !== "LIKE") rt.count = rand(0,1); });
                        }
                        if (baseLikeCount === 0) generatedReactions.forEach(rt => rt.count = 0);

                        modifiedData.data = generatedReactions.filter(rt => rt.count > 0);
                        if (modifiedData.data.length === 0 && baseLikeCount > 0) { // Ensure LIKE is present if its count > 0
                            modifiedData.data = [{type: "LIKE", count: baseLikeCount }];
                        } else if (modifiedData.data.length === 0 && baseLikeCount === 0) {
                            modifiedData.data = [];
                        }
                        postStatsStore.totalReactions = modifiedData.data.reduce((sum, r) => sum + r.count, 0);
                        break;

                    case 'VISITS_GROUPED':
                        let totalVisitsTarget = postStatsStore.registeredVisits;
                        if (totalVisitsTarget === null || totalVisitsTarget < 5) { // Ensure a minimum for distribution
                            totalVisitsTarget = rand(20, 80);
                            postStatsStore.registeredVisits = totalVisitsTarget;
                        }

                        let currentSources = [];
                        let numSourcesToGenerate = rand(3, 8); // Generate a decent variety of sources
                        const shuffledTemplates = [...visitSourceTemplates].sort(() => 0.5 - Math.random());

                        for(let i=0; i < numSourcesToGenerate && i < shuffledTemplates.length; i++) {
                            currentSources.push({...shuffledTemplates[i], visits: 0});
                        }
                        // Ensure key categories if not present
                        if (!currentSources.some(s=>s.baseWeightCategory === "in-app-high")) currentSources.push({...visitSourceTemplates.find(t=>t.baseWeightCategory === "in-app-high"), visits:0});
                        if (!currentSources.some(s=>s.baseWeightCategory === "mobile-high")) currentSources.push({...visitSourceTemplates.find(t=>t.baseWeightCategory === "mobile-high"), visits:0});

                        currentSources = currentSources.filter((source, index, self) =>
                            source && index === self.findIndex((s) => (
                                s.platform === source.platform && s.utmSource === source.utmSource && s.utmMedium === source.utmMedium
                            ))
                        );

                        if (currentSources.length === 0 && totalVisitsTarget > 0) {
                            currentSources.push({ platform: "web", utmSource: "in-app", utmMedium: "feed", visits: 0, baseWeightCategory:"in-app-high"});
                        }

                        if (currentSources.length > 0) {
                            let sumOfGeneratedWeights = 0;
                            currentSources.forEach(source => {
                                let weight = 10;
                                switch(source.baseWeightCategory) {
                                    case 'in-app-high': weight = rand(30,60); break;
                                    case 'in-app-medium': weight = rand(20,40); break;
                                    case 'in-app-low': weight = rand(5,20); break;
                                    case 'mobile-high': weight = rand(25,55); break;
                                    case 'mobile-direct': weight = rand(10,30); break;
                                    case 'mobile-low': weight = rand(5,15); break;
                                    case 'sharepoint': weight = rand(15,40); break;
                                    case 'sharepoint-low': weight = rand(5,15); break;
                                    case 'web-direct': weight = rand(10,30); break;
                                    default: weight = rand(3,10);
                                }
                                source.tempWeight = weight;
                                sumOfGeneratedWeights += source.tempWeight;
                            });

                            if (sumOfGeneratedWeights === 0 && totalVisitsTarget > 0) {
                                // Equal distribution if weights are zero (shouldn't happen with above logic)
                                const visitsPerSource = Math.floor(totalVisitsTarget / currentSources.length);
                                currentSources.forEach(source => source.visits = visitsPerSource);
                                let remainder = totalVisitsTarget % currentSources.length;
                                if (remainder > 0) currentSources[0].visits += remainder;
                            } else if (sumOfGeneratedWeights > 0) {
                                // Distribute based on weights
                                let distributedVisits = 0;
                                currentSources.forEach((source, index) => {
                                    if (index === currentSources.length - 1) { // Last source gets remainder
                                        source.visits = totalVisitsTarget - distributedVisits;
                                    } else {
                                        source.visits = Math.round((source.tempWeight / sumOfGeneratedWeights) * totalVisitsTarget);
                                    }
                                    source.visits = Math.max(0, source.visits); // Ensure non-negative
                                    distributedVisits += source.visits;
                                });
                                // If rounding caused over/under shooting, adjust the largest source
                                let finalSum = currentSources.reduce((acc, s) => acc + s.visits, 0);
                                if (finalSum !== totalVisitsTarget && currentSources.length > 0) {
                                    currentSources.sort((a, b) => b.visits - a.visits); // Sort by visits
                                    currentSources[0].visits += (totalVisitsTarget - finalSum);
                                    currentSources[0].visits = Math.max(0, currentSources[0].visits);
                                }
                            }
                            currentSources.forEach(source => delete source.tempWeight && delete source.baseWeightCategory);
                            modifiedData = currentSources.filter(s => s.visits > 0);
                            if (modifiedData.length === 0 && totalVisitsTarget > 0 && currentSources.length > 0) {
                                currentSources[0].visits = totalVisitsTarget; // Ensure at least one if total visits > 0
                                modifiedData = [currentSources[0]];
                            } else if (modifiedData.length === 0 && totalVisitsTarget === 0) {
                                modifiedData = [];
                            }
                        } else {
                             modifiedData = [];
                        }
                        break;

                    case 'VIDEO_VIEWS':
                        modifiedData = {
                            "in the post": { viewers: 0, views: 0 },
                            "news feed item": { viewers: 0, views: 0 },
                            "slide": { viewers: 0, views: 0 },
                            "total": { viewers: 0, views: 0 }
                        };
                        let distinctTotalViewers = 0;
                        if (postStatsStore.registeredVisitors !== null && postStatsStore.registeredVisitors > 0) {
                            distinctTotalViewers = rand(
                                Math.floor(postStatsStore.registeredVisitors * 0.05), // At least 5%
                                Math.floor(postStatsStore.registeredVisitors * 0.55)  // Up to 55%
                            );
                        } else { distinctTotalViewers = rand(0, 3); } // Fallback
                        distinctTotalViewers = Math.max(0, distinctTotalViewers);
                        postStatsStore.videoViewersDistinct = distinctTotalViewers;
                        modifiedData.total.viewers = distinctTotalViewers;

                        if (distinctTotalViewers > 0) {
                            modifiedData["in the post"].viewers = rand(Math.floor(distinctTotalViewers * 0.4), distinctTotalViewers);
                            modifiedData["in the post"].views = modifiedData["in the post"].viewers + rand(0, Math.floor(modifiedData["in the post"].viewers * 1.5));

                            modifiedData["news feed item"].viewers = rand(Math.floor(distinctTotalViewers * 0.2), Math.floor(distinctTotalViewers * 0.7));
                            modifiedData["news feed item"].views = modifiedData["news feed item"].viewers + rand(0, Math.floor(modifiedData["news feed item"].viewers * 1.5));
                            
                            if (Math.random() < 0.4) { // 40% chance of slide views
                                modifiedData["slide"].viewers = rand(Math.floor(distinctTotalViewers * 0.05), Math.floor(distinctTotalViewers * 0.3));
                                modifiedData["slide"].views = modifiedData["slide"].viewers + rand(0, modifiedData["slide"].viewers);
                            }
                            // Ensure individual viewers don't exceed total distinct viewers by too much if summed (though they are distinct per category, not unique across categories)
                            modifiedData["in the post"].viewers = Math.min(modifiedData["in the post"].viewers, distinctTotalViewers);
                            modifiedData["news feed item"].viewers = Math.min(modifiedData["news feed item"].viewers, distinctTotalViewers);
                            modifiedData["slide"].viewers = Math.min(modifiedData["slide"].viewers, distinctTotalViewers);
                        }
                        modifiedData.total.views = modifiedData["in the post"].views + modifiedData["news feed item"].views + modifiedData["slide"].views;
                        break;
                }

                // console.log(INJECTED_LOG_PREFIX + ` Modified ${matchedEndpointKey} data:`, JSON.parse(JSON.stringify(modifiedData)));
                return new Response(JSON.stringify(modifiedData), {
                    status: response.status, statusText: response.statusText, headers: response.headers
                });

            } catch (err) {
                console.error(INJECTED_LOG_PREFIX + ` Error during fetch interception for ${requestFullUrl}:`, err);
                return pageContextOriginalFetch.apply(this, args);
            }
        }
        return pageContextOriginalFetch.apply(this, args);
    };

    window.fetch = injectedPostsCustomFetch;
    window.__REPLIFY_POSTS_FETCH_APPLIED__ = true;
    console.log(INJECTED_LOG_PREFIX + ` Posts fetch override applied for Post ID: ${CURRENT_POST_ID}.`);

    window.__REPLIFY_REVERT_POSTS_FETCH__ = function() {
        if (window.fetch === injectedPostsCustomFetch) {
            window.fetch = pageContextOriginalFetch;
            delete window.__REPLIFY_POSTS_FETCH_APPLIED__;
            delete window.__REPLIFY_REVERT_POSTS_FETCH__;
            console.log(INJECTED_LOG_PREFIX + ' Posts fetch restored to page original by revert function.');
            return true;
        }
        return false;
    };
})();
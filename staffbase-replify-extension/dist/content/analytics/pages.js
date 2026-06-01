// Patches window.fetch on the Pages analytics page to generate scaled visitor and view data.
// Applies population reductions based on active filters (space, platform, user group).
// Pairs consecutive requests as comparison periods, returning a lower baseline for the second call.
(function () {

    const INJECTED_LOG_PREFIX = '[Replify InjectedPagesPatch]:';

    // Prevents the script from being injected and run multiple times
    if (window.__REPLIFY_PAGES_FETCH_APPLIED__) {
        return;
    }

    const pageContextOriginalFetch = window.fetch;
    if (!pageContextOriginalFetch) {
        console.error(INJECTED_LOG_PREFIX, 'CRITICAL: window.fetch is not available!');
        return;
    }

    // This object holds metrics from the first API call in a comparison pair.
    let comparisonMetricsData = null;
    const COMPARISON_CACHE_DURATION_MS = 10 * 1000; // 10-second window to catch a comparison call

    const SESSION_STORAGE_KEY = 'replifyPagesAnalyticsBaseline';
    const BASELINE_CACHE_DURATION_MS = 60 * 60 * 1000; // 1-hour cache for baseline metrics

    const rand = (min, max) => {
        min = Math.ceil(min); max = Math.floor(max);
        if (min > max) [min, max] = [max, min];
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };
    const randFloat = (min, max, decimals = 2) => parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
    const getEmployeeCount = () => {
        const fromGlobals = (window.__REPLIFY_ANALYTICS_CONFIG || window.replifyAnalyticsConfig || {}).numberOfEmployees;
        if (typeof fromGlobals === 'number' && fromGlobals > 0) return fromGlobals;
        try {
            const raw = document.documentElement.getAttribute('data-replify-analytics-config');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.numberOfEmployees === 'number' && parsed.numberOfEmployees > 0) {
                    return parsed.numberOfEmployees;
                }
            }
        } catch (_) {}
        return 5000;
    };

    const TARGET_PAGES_API_URLS = {
        STATS: '/api/branch/analytics/pages/stats',
        TIMESERIES: '/api/branch/analytics/pages/timeseries',
        RANKING: '/api/branch/analytics/pages/ranking',
    };

    function getUrlParams(urlString) {
        const params = {};
        try {
            const url = new URL(urlString, window.location.origin);
            url.searchParams.forEach((value, key) => { params[key] = value; });
        } catch (e) { /* Silently ignore errors */ }
        return params;
    }

    function parseFilters(urlString) {
        const params = getUrlParams(urlString);
        let reductionFactor = 1.0;

        // Space filter trims the population significantly
        const spaceIds = []
            .concat(params.spaceId || [])
            .concat(params.spaceid || [])
            .filter(Boolean);
        if (spaceIds.length > 0) {
            reductionFactor *= 0.5; // roughly half when scoped to a space
        }

        // Platform filter (ios/android/web/etc) narrows further
        if (params.platform) {
            reductionFactor *= 0.6;
        }

        // User groups: 1 group ~ 10% of total, scale up with more groups up to 100%
        const groupIdsRaw = []
            .concat(params.groupId || [])
            .concat(params.groupid || [])
            .filter(Boolean);
        const groupCount = groupIdsRaw.length;
        if (groupCount > 0) {
            const groupFactor = Math.min(1, groupCount * 0.1);
            reductionFactor *= groupFactor;
        }

        // Also check for filters passed in a combined filter param
        if (params.filter) {
            const filterString = decodeURIComponent(params.filter).toLowerCase();
            if (filterString.includes('spaceid eq')) reductionFactor *= 0.5;
            if (filterString.includes('platform eq')) reductionFactor *= 0.6;
            if (filterString.includes('groupid eq')) {
                // If group filter exists but we didn't capture count, fall back to 0.1
                if (groupCount === 0) reductionFactor *= 0.1;
            }
        }

        // Keep within bounds
        reductionFactor = Math.max(0.05, Math.min(1, reductionFactor));
        return { reductionFactor };
    }

    function calculateDateMetrics(sinceStr, untilStr) {
        const since = new Date(decodeURIComponent(sinceStr));
        const until = new Date(decodeURIComponent(untilStr));

        if (isNaN(since.getTime()) || isNaN(until.getTime()) || until < since) {
            return { days: 1, sinceDate: new Date(Date.now() - 86400000), untilDate: new Date() };
        }
        
        const durationMillis = Math.max(1, until - since);
        const days = Math.ceil(durationMillis / (1000 * 60 * 60 * 24));
        
        return { days, sinceDate: since, untilDate: until };
    }

    function getBaselineYearlyMetrics() {
        const employeeCount = getEmployeeCount();
        const scale = Math.max(1, employeeCount / 300); // original baseline roughly matched ~300 employees
        try {
            const cached = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (cached) {
                const data = JSON.parse(cached);
                if (data.timestamp && (Date.now() - data.timestamp < BASELINE_CACHE_DURATION_MS) && data.employeeCount === employeeCount) {
                    return data.metrics;
                }
            }
        } catch (e) { console.error(INJECTED_LOG_PREFIX, "Error reading from session storage:", e); }

        const metrics = {
            totalVisitors: Math.round(rand(8000, 15000) * scale),
            totalViews: 0,
            sessions: 0,
            clicks: 0,
        };
        metrics.totalViews = Math.round(metrics.totalVisitors * randFloat(8.5, 15.0));
        metrics.sessions = Math.round(metrics.totalViews * randFloat(0.7, 0.9));
        metrics.clicks = Math.round(metrics.totalViews * randFloat(0.1, 0.25));

        try {
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ metrics, timestamp: Date.now(), employeeCount }));
        } catch (e) { console.error(INJECTED_LOG_PREFIX, "Error writing to session storage:", e); }
        return metrics;
    }
    
    function generateLowerComparisonMetrics(currentPeriodMetrics) {
        const result = {};
        const reductionFactor = randFloat(0.60, 0.85);

        for (const key in currentPeriodMetrics) {
            if (typeof currentPeriodMetrics[key] === 'number') {
                result[key] = Math.floor(currentPeriodMetrics[key] * reductionFactor);
            }
        }
        
        if (result.totalViews < result.sessions) result.sessions = Math.floor(result.totalViews * randFloat(0.8, 0.95));
        if (result.sessions < result.totalVisitors) result.totalVisitors = Math.floor(result.sessions * randFloat(0.9, 1.0));
        
        return result;
    }

    function generateMetricsForPeriod(dateMetrics, filterReduction) {
        const yearlyBaseline = getBaselineYearlyMetrics();
        const scalingFactor = dateMetrics.days / 365;
        const result = {};

        for (const key in yearlyBaseline) {
            // Apply the filter reduction factor during metric generation
            result[key] = Math.round(yearlyBaseline[key] * scalingFactor * filterReduction * randFloat(0.85, 1.15));
        }

        result.totalVisitors = Math.max(result.totalVisitors, 1);
        result.totalViews = Math.max(result.totalViews, result.totalVisitors);
        result.sessions = Math.max(result.sessions, result.totalVisitors);
        
        return result;
    }


    const injectedPagesCustomFetch = async function(...args) {
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

        const matchedEndpointKey = Object.keys(TARGET_PAGES_API_URLS).find(key => urlPath === TARGET_PAGES_API_URLS[key]);

        if (matchedEndpointKey) {
            const urlParams = getUrlParams(requestFullUrl);
            const dateMetrics = calculateDateMetrics(urlParams.since, urlParams.until);
            // Get the reduction factor from any applied filters
            const { reductionFactor } = parseFilters(requestFullUrl);
            let periodMetrics;

            if (comparisonMetricsData && (Date.now() - comparisonMetricsData.timestamp < COMPARISON_CACHE_DURATION_MS)) {
                periodMetrics = generateLowerComparisonMetrics(comparisonMetricsData.metrics);
                comparisonMetricsData = null; 
            } else {
                // Pass the reduction factor to the metric generator
                periodMetrics = generateMetricsForPeriod(dateMetrics, reductionFactor);
                comparisonMetricsData = { metrics: periodMetrics, timestamp: Date.now() };
            }

            try {
                const response = await pageContextOriginalFetch.apply(this, args);
                let originalJsonData = {};
                if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
                    originalJsonData = await response.clone().json();
                }

                let modifiedData;

                switch (matchedEndpointKey) {
                    case 'STATS':
                        const totalPages = (originalJsonData.pageWithViews || 0) + (originalJsonData.pageWithNoViews || 0) || 78;
                        const pageWithViews = Math.min(totalPages, Math.max(rand(5, 10), Math.floor(periodMetrics.totalVisitors / 2)));
                        modifiedData = {
                            totalViews: periodMetrics.totalViews,
                            totalVisitors: periodMetrics.totalVisitors,
                            pageWithViews: pageWithViews,
                            pageWithNoViews: Math.max(0, totalPages - pageWithViews)
                        };
                        break;

                    case 'TIMESERIES':
                        modifiedData = { data: [] };
                        let runningViews = periodMetrics.totalViews;
                        let runningVisitors = periodMetrics.totalVisitors;
                        for (let i = 0; i < dateMetrics.days; i++) {
                            const dayDate = new Date(dateMetrics.sinceDate);
                            dayDate.setDate(dayDate.getDate() + i);
                            if (dayDate > dateMetrics.untilDate) break;

                            const isLastDay = i === dateMetrics.days - 1;
                            // Independent random shares so views and visitors form different-shaped curves
                            const viewShare = isLastDay ? 1 : randFloat(0.1, 1.9) / dateMetrics.days;
                            const views = Math.min(runningViews, Math.round(periodMetrics.totalViews * viewShare));
                            const visitorShare = isLastDay ? 1 : randFloat(0.1, 1.9) / dateMetrics.days;
                            let visitors = Math.min(runningVisitors, Math.round(periodMetrics.totalVisitors * visitorShare));
                            visitors = Math.min(views, visitors); // visitors can't exceed views on the same day

                            modifiedData.data.push({
                                date: dayDate.toISOString().split('T')[0] + "T00:00:00-04:00",
                                views: views,
                                visitors: visitors
                            });
                            runningViews -= views;
                            runningVisitors -= visitors;
                        }
                        break;

                    case 'RANKING':
                        modifiedData = { data: [] };
                        const allPages = originalJsonData.data || [];
                        let remainingViews = periodMetrics.totalViews;
                        let remainingViewers = periodMetrics.totalVisitors;
                        let remainingSessions = periodMetrics.sessions;
                        let remainingClicks = periodMetrics.clicks;

                        const pagesWithTraffic = allPages.slice(0, Math.min(allPages.length, rand(6, 12)));
                        const otherPages = allPages.slice(pagesWithTraffic.length);

                        // Weight distribution so earlier pages get more traffic, ensuring a ranked order
                        const weights = pagesWithTraffic.map((_, idx) => (pagesWithTraffic.length - idx) * randFloat(0.8, 1.2));
                        const weightSum = weights.reduce((a, b) => a + b, 0) || 1;

                        pagesWithTraffic.forEach((page, index) => {
                            const share = weights[index] / weightSum;

                            const views = Math.round(remainingViews * share);
                            const viewers = Math.round(remainingViewers * share);
                            const sessions = Math.round(remainingSessions * share);
                            const clicks = Math.round(remainingClicks * share);

                            modifiedData.data.push({
                                ...page,
                                views: views,
                                viewers: Math.min(views, viewers),
                                sessions: Math.min(views, sessions),
                                clicks: Math.min(views, clicks),
                                secondsSpent: views > 0 ? rand(5, 90) : 0,
                                bounceRate: viewers > 0 ? randFloat(10, 70) : 0,
                                shortSessions: Math.floor(sessions * randFloat(0.4, 0.8))
                            });
                        });

                        otherPages.forEach(page => {
                           modifiedData.data.push({ ...page, views: 0, viewers: 0, sessions: 0, secondsSpent: 0, shortSessions: 0, clicks: 0, bounceRate: 0 });
                        });

                        // Sort by views descending to respect ranking order (e.g., views_DESC)
                        modifiedData.data.sort((a, b) => (b.views || 0) - (a.views || 0));

                        break;
                }
                
                return new Response(JSON.stringify(modifiedData), {
                    status: 200, statusText: "OK", headers: {'Content-Type': 'application/json'}
                });

            } catch (err) {
                console.error(INJECTED_LOG_PREFIX + ` Error during data generation for ${requestFullUrl}:`, err);
                const emptyResponses = {
                    STATS: { totalViews: 0, totalVisitors: 0, pageWithViews: 0, pageWithNoViews: 0 },
                    TIMESERIES: { data: [] },
                    RANKING: { data: [] }
                };
                return new Response(JSON.stringify(emptyResponses[matchedEndpointKey] || {}), { status: 200, headers: { 'Content-Type': 'application/json' }});
            }
        }
        
        return pageContextOriginalFetch.apply(this, args);
    };

    window.fetch = injectedPagesCustomFetch;
    window.__REPLIFY_PAGES_FETCH_APPLIED__ = true;

    window.__REPLIFY_REVERT_PAGES_FETCH__ = function() {
        if (window.fetch === injectedPagesCustomFetch) {
            window.fetch = pageContextOriginalFetch;
            delete window.__REPLIFY_PAGES_FETCH_APPLIED__;
            delete window.__REPLIFY_REVERT_PAGES_FETCH__;
            return true;
        }
        return false;
    };
})();

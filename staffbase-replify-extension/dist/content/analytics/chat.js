// Patches window.fetch on the Chat analytics page to generate plausible timeseries data
// scaled to the configured period (hourly, daily, weekly, monthly).
(function () {
    const INJECTED_LOG_PREFIX = '[Replify InjectedChatPatch]:';

    if (window.__REPLIFY_CHAT_FETCH_APPLIED__) {
        return;
    }

    const pageContextOriginalFetch = window.fetch;
    if (!pageContextOriginalFetch) {
        console.error(INJECTED_LOG_PREFIX, 'CRITICAL: window.fetch is not available!');
        return;
    }

    const SESSION_STORAGE_KEY = 'replifyChatAnalyticsBaseline';
    const BASELINE_CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour cache
    const TARGET_CHAT_API_URL = '/api/branch/analytics/chats/timeseries';

    const rand = (min, max) => {
        min = Math.ceil(min);
        max = Math.floor(max);
        if (min > max) [min, max] = [max, min];
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    const randFloat = (min, max, decimals = 2) => {
        const str = (Math.random() * (max - min) + min).toFixed(decimals);
        return parseFloat(str);
    };

    function getUrlParams(urlString) {
        const params = {};
        try {
            const url = new URL(urlString, window.location.origin);
            url.searchParams.forEach((value, key) => { params[key] = value; });
        } catch (e) {
            console.error(INJECTED_LOG_PREFIX, "Could not parse URL params.", e);
        }
        return params;
    }

    function calculateDateMetrics(sinceStr, untilStr) {
        const since = new Date(decodeURIComponent(sinceStr));
        const until = new Date(decodeURIComponent(untilStr));

        if (isNaN(since.getTime()) || isNaN(until.getTime()) || until < since) {
            return { hours: 0, days: 0, weeks: 0, months: 0, sinceDate: new Date(), untilDate: new Date() };
        }

        const millisPerHour = 1000 * 60 * 60;
        const millisPerDay = millisPerHour * 24;
        const durationMillis = Math.max(millisPerHour, until.getTime() - since.getTime());

        const hours = Math.max(1, Math.ceil(durationMillis / millisPerHour));
        const days = Math.max(1, Math.ceil(durationMillis / millisPerDay));
        const weeks = Math.max(1, Math.ceil(days / 7));
        const months = Math.max(1, Math.ceil(days / 30.44));

        return { hours, days, weeks, months, sinceDate: since, untilDate: until };
    }

    function getBaselineYearlyMetrics() {
        try {
            const cached = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (cached) {
                const data = JSON.parse(cached);
                if (data.timestamp && (Date.now() - data.timestamp < BASELINE_CACHE_DURATION_MS)) {
                    return data.metrics;
                }
            }
        } catch (e) { console.error(INJECTED_LOG_PREFIX, "Error reading from session storage:", e); }

        // Establish a strong baseline for a full year's worth of data
        const metrics = {
            activeChatUsers: rand(8000, 12000),         // Unique users over a year
            activeDirectConversations: rand(4000, 7000),  // Total direct conversations
            activeGroupConversations: rand(1000, 2000),  // Total group conversations
        };

        try {
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ metrics, timestamp: Date.now() }));
        } catch (e) { console.error(INJECTED_LOG_PREFIX, "Error writing to session storage:", e); }
        
        return metrics;
    }

    function generateMetricsForPeriod(dateMetrics) {
        const yearlyBaseline = getBaselineYearlyMetrics();
        const isShortPeriod = dateMetrics.days <= 2; // Use hours for periods of 2 days or less
        const basePeriodUnit = isShortPeriod ? (365 * 24) : 365;
        const currentPeriodUnit = isShortPeriod ? dateMetrics.hours : dateMetrics.days;
        
        const scalingFactor = currentPeriodUnit / basePeriodUnit;
        const result = {};

        for (const key in yearlyBaseline) {
            result[key] = Math.round(yearlyBaseline[key] * scalingFactor * randFloat(0.85, 1.15));
        }

        return result;
    }

    const injectedChatCustomFetch = async function(...args) {
        const resource = args[0];
        const requestFullUrl = typeof resource === 'string' ? resource : resource.url;
        let urlPath = '';

        try {
            const parsedUrl = new URL(requestFullUrl, window.location.origin);
            urlPath = parsedUrl.pathname;
        } catch (e) {
            // Handle relative URLs
            if (requestFullUrl.startsWith('/')) {
                urlPath = requestFullUrl.split('?')[0];
            } else {
                // Not a recognizable API call, pass it to the original fetch
                return pageContextOriginalFetch.apply(this, args);
            }
        }

        // Check if this is the URL we want to patch
        if (urlPath === TARGET_CHAT_API_URL) {
            try {
                const urlParams = getUrlParams(requestFullUrl);
                const dateMetrics = calculateDateMetrics(urlParams.since, urlParams.until);
                const periodMetrics = generateMetricsForPeriod(dateMetrics);

                const metricsAreAllZero = Object.values(periodMetrics).every(v => v === 0);
                if (metricsAreAllZero) {
                    const emptyResponse = { timeseries: [], total: { activeChatUsers: 0, activeDirectConversations: 0, activeGroupConversations: 0 }};
                    return new Response(JSON.stringify(emptyResponse), {
                        status: 200, statusText: "OK", headers: { 'Content-Type': 'application/json' }
                    });
                }

                const modifiedData = {
                    timeseries: [],
                    total: { activeChatUsers: periodMetrics.activeChatUsers, activeDirectConversations: 0, activeGroupConversations: 0 }
                };

                const groupBy = urlParams.groupBy || 'day';
                let numIntervals = 0;

                if (groupBy === 'hour') numIntervals = dateMetrics.hours;
                else if (groupBy === 'day') numIntervals = dateMetrics.days;
                else if (groupBy === 'week') numIntervals = dateMetrics.weeks;
                else if (groupBy === 'month') numIntervals = dateMetrics.months;
                else numIntervals = dateMetrics.days;

                numIntervals = Math.max(1, Math.min(numIntervals, 100));
                let currentDate = new Date(dateMetrics.sinceDate);

                for (let i = 0; i < numIntervals; i++) {
                    const dateGroup = {
                        hour: groupBy === 'hour' ? currentDate.getUTCHours() : undefined,
                        day: (groupBy === 'hour' || groupBy === 'day' || groupBy === 'week') ? currentDate.getUTCDate() : 1,
                        month: currentDate.getUTCMonth() + 1,
                        year: currentDate.getUTCFullYear()
                    };
                    Object.keys(dateGroup).forEach(key => dateGroup[key] === undefined && delete dateGroup[key]);

                    let groupData = {};
                    groupData.activeDirectConversations = Math.round(periodMetrics.activeDirectConversations / numIntervals * randFloat(0.7, 1.3));
                    groupData.activeGroupConversations = Math.round(periodMetrics.activeGroupConversations / numIntervals * randFloat(0.7, 1.3));

                    // Per-interval user counts sum higher than the total unique users — that's expected
                    const userShare = periodMetrics.activeChatUsers > 0
                        ? Math.round(periodMetrics.activeChatUsers / numIntervals * randFloat(1.1, 1.6))
                        : 0;
                    groupData.activeChatUsers = Math.max(0, Math.min(userShare, periodMetrics.activeChatUsers));

                    if ((groupData.activeDirectConversations > 0 || groupData.activeGroupConversations > 0) && groupData.activeChatUsers === 0) {
                        groupData.activeChatUsers = rand(1, 3);
                    }

                    modifiedData.timeseries.push({ group: dateGroup, ...groupData });

                    if (groupBy === 'hour') currentDate.setUTCHours(currentDate.getUTCHours() + 1);
                    else if (groupBy === 'day') currentDate.setUTCDate(currentDate.getUTCDate() + 1);
                    else if (groupBy === 'week') currentDate.setUTCDate(currentDate.getUTCDate() + 7);
                    else if (groupBy === 'month') currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);

                    if (currentDate > dateMetrics.untilDate && i < numIntervals - 1) break;
                }

                modifiedData.total.activeDirectConversations = modifiedData.timeseries.reduce((acc, curr) => acc + curr.activeDirectConversations, 0);
                modifiedData.total.activeGroupConversations = modifiedData.timeseries.reduce((acc, curr) => acc + curr.activeGroupConversations, 0);

                return new Response(JSON.stringify(modifiedData), {
                    status: 200,
                    statusText: "OK",
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (err) {
                console.error(INJECTED_LOG_PREFIX + `Error during data generation for ${requestFullUrl}:`, err);
                // Return an empty but valid response on error
                const emptyResponse = { timeseries: [], total: { activeChatUsers: 0, activeDirectConversations: 0, activeGroupConversations: 0 }};
                return new Response(JSON.stringify(emptyResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
        }

        // If the URL doesn't match, proceed with the original fetch call
        return pageContextOriginalFetch.apply(this, args);
    };

    window.fetch = injectedChatCustomFetch;
    window.__REPLIFY_CHAT_FETCH_APPLIED__ = true;
    console.log(INJECTED_LOG_PREFIX, 'Chat analytics fetch override applied.');

    window.__REPLIFY_REVERT_CHAT_FETCH__ = function() {
        if (window.fetch === injectedChatCustomFetch) {
            window.fetch = pageContextOriginalFetch;
            delete window.__REPLIFY_CHAT_FETCH_APPLIED__;
            delete window.__REPLIFY_REVERT_CHAT_FETCH__;
            console.log(INJECTED_LOG_PREFIX + 'Chat fetch restored.');
            return true;
        }
        return false;
    };
})();
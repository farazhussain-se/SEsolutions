// Patches window.fetch on the User analytics page to generate user activity timeseries data
// with weekend/night dips. Group-filtered views return smaller user counts than the full view.
(function () {
    'use strict';

    const INJECTED_LOG_PREFIX = '[Replify InjectedUserPatch]:';

    if (window.__REPLIFY_USER_FETCH_APPLIED__) {
        console.warn(INJECTED_LOG_PREFIX, 'User fetch override already applied. Aborting.');
        return;
    }

    const pageContextOriginalFetch = window.fetch;
    if (!pageContextOriginalFetch) {
        console.error(INJECTED_LOG_PREFIX, 'CRITICAL: window.fetch is null/undefined in page context!');
        return;
    }

    const rand = (min, max) => {
        min = Math.ceil(min);
        max = Math.floor(max);
        if (min > max) [min, max] = [max, min];
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };

    const randFloat = (min, max, decimals = 4) => {
        const str = (Math.random() * (max - min) + min).toFixed(decimals);
        return parseFloat(str);
    };

    const TARGET_USER_API_URL = '/api/branch/analytics/v2/users/timeseries';

    function getUrlParams(urlString) {
        const params = {};
        try {
            const url = new URL(urlString, window.location.origin);
            url.searchParams.forEach((value, key) => {
                params[key] = value;
            });
        } catch (e) {
            console.warn(INJECTED_LOG_PREFIX, "Could not parse URL for params:", urlString);
        }
        return params;
    }

    function generateUserTimeSeriesData(urlParams) {
        const { since, until, groupBy = 'day', filter = '' } = urlParams;
        const sinceDate = new Date(decodeURIComponent(since));
        const untilDate = new Date(decodeURIComponent(until));

        if (isNaN(sinceDate.getTime()) || isNaN(untilDate.getTime())) {
            console.error(INJECTED_LOG_PREFIX, "Invalid date range provided.");
            return { timeseries: [], total: {} };
        }

        const timeDiff = Math.abs(untilDate - sinceDate);
        const dayDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        const isGroupFiltered = filter.includes('groupId');

        let BASE_TOTAL_USERS;
        const USER_GROWTH_RATE_PER_DAY = randFloat(0.0001, 0.0005);

        if (isGroupFiltered) {
            // Use smaller numbers for specific group filters
            BASE_TOTAL_USERS = dayDiff > 28 ? rand(400, 900) : rand(150, 350);
        } else {
            // Use larger numbers for the main, unfiltered view
            BASE_TOTAL_USERS = dayDiff > 28 ? rand(6000, 12000) : rand(1500, 4000);
        }

        const intervals = [];
        let currentDate = new Date(sinceDate);
        while (currentDate <= untilDate) {
            intervals.push(new Date(currentDate));
            if (groupBy.toLowerCase() === 'hour') {
                currentDate.setUTCHours(currentDate.getUTCHours() + 1);
            } else { // Default to day
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            }
        }

        const overallActiveRate = randFloat(0.60, 0.80);   // 60-80% of total users are active
        const overallEngagedRate = randFloat(0.50, 0.70);  // 50-70% of active users are engaged

        const totalActiveToDistribute = Math.floor(BASE_TOTAL_USERS * overallActiveRate);
        const totalEngagedToDistribute = Math.floor(totalActiveToDistribute * overallEngagedRate);

        const weights = intervals.map(date => {
            let weight = 1.0;
            const dayOfWeek = date.getUTCDay();
            const hour = date.getUTCHours();
            if (dayOfWeek === 0 || dayOfWeek === 6) { weight *= 0.4; } // Weekend dip
            if (hour < 7 || hour > 21) { weight *= 0.3; } // Night dip
            return Math.random() * weight;
        });

        const totalWeight = weights.reduce((sum, w) => sum + w, 0);

        let runningTotalUsers = BASE_TOTAL_USERS;
        let cumulativeActive = 0;
        let cumulativeEngaged = 0;

        const timeseries = intervals.map((date, i) => {
            runningTotalUsers *= (1 + USER_GROWTH_RATE_PER_DAY / (groupBy.toLowerCase() === 'hour' ? 24 : 1));
            const currentTotalUsers = Math.floor(runningTotalUsers);
            const currentRegisteredUsers = Math.floor(currentTotalUsers * randFloat(0.95, 0.99));

            const share = totalWeight > 0 ? weights[i] / totalWeight : 1 / intervals.length;
            let activeUsers = Math.floor(totalActiveToDistribute * share * randFloat(0.7, 1.3));
            let engagedUsers = Math.floor(totalEngagedToDistribute * share * randFloat(0.7, 1.3));
            engagedUsers = Math.min(activeUsers, engagedUsers); // Engaged cannot exceed active

            cumulativeActive += activeUsers;
            cumulativeEngaged += engagedUsers;

            const group = {
                day: date.getUTCDate(),
                month: date.getUTCMonth() + 1,
                year: date.getUTCFullYear(),
            };
            if (groupBy.toLowerCase() === 'hour') {
                group.hour = date.getUTCHours();
            }

            return {
                activeUsers,
                engagedUsers,
                totalUsers: currentTotalUsers,
                registeredUsers: currentRegisteredUsers,
                group,
            };
        });

        const finalTotals = {
            activeUsers: cumulativeActive,
            engagedUsers: cumulativeEngaged,
            totalUsers: Math.floor(runningTotalUsers),
            registeredUsers: Math.floor(runningTotalUsers * 0.98),
        };

        return { timeseries, total: finalTotals };
    }


    const injectedUserCustomFetch = async function(...args) {
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

        if (urlPath === TARGET_USER_API_URL) {
            console.log(INJECTED_LOG_PREFIX + `Intercepting User Timeseries: ${requestFullUrl.substring(0, 150)}`);
            try {
                const modifiedData = generateUserTimeSeriesData(getUrlParams(requestFullUrl));
                return new Response(JSON.stringify(modifiedData), {
                    status: 200,
                    statusText: "OK",
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (err) {
                console.error(INJECTED_LOG_PREFIX + `Error during data generation for ${requestFullUrl}:`, err);
                return new Response(JSON.stringify({ timeseries: [], total: {} }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        return pageContextOriginalFetch.apply(this, args);
    };

    window.fetch = injectedUserCustomFetch;
    window.__REPLIFY_USER_FETCH_APPLIED__ = true;
    console.log(INJECTED_LOG_PREFIX + 'User fetch override applied.');

    window.__REPLIFY_REVERT_USER_FETCH__ = function() {
        if (window.fetch === injectedUserCustomFetch) {
            window.fetch = pageContextOriginalFetch;
            delete window.__REPLIFY_USER_FETCH_APPLIED__;
            delete window.__REPLIFY_REVERT_USER_FETCH__;
            console.log(INJECTED_LOG_PREFIX + 'User fetch restored by revert function.');
            return true;
        }
        return false;
    };

})();
// Patches window.fetch on the Email analytics pages — both the main overview/timeseries/stats
// endpoints and the per-email performance endpoints (opens, clicks, bounces, links, etc.).
(function () {
    'use strict';

    const INJECTED_LOG_PREFIX = '[Replify InjectedEmailPatch]:';

    if (window.__REPLIFY_EMAIL_FETCH_APPLIED__) {
        return;
    }

    const pageContextOriginalFetch = window.fetch;
    if (!pageContextOriginalFetch) {
        console.error(INJECTED_LOG_PREFIX, 'window.fetch is null/undefined in page context!');
        return;
    }

    const rand = (min, max) => {
        min = Math.ceil(min);
        max = Math.floor(max);
        if (min > max) [min, max] = [max, min];
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };
    const randFloat = (min, max, decimals = 2) => parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
    const pick = (arr) => arr[rand(0, arr.length - 1)];
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
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
    const getEmailVolumeModel = () => {
        const employeeCount = getEmployeeCount();
        const campaignScale = clamp(Math.log10(Math.max(10, employeeCount)) / 2.3, 1.1, 5.8);
        const minRecipientsPerCampaign = Math.max(25, Math.round(employeeCount * 0.03));
        const maxRecipientsPerCampaign = Math.max(minRecipientsPerCampaign + 100, Math.round(employeeCount * 0.85));
        const avgRecipientsPerCampaign = rand(minRecipientsPerCampaign, maxRecipientsPerCampaign);
        return {
            employeeCount,
            campaignScale,
            avgRecipientsPerCampaign
        };
    };

    // --- Main page (existing) endpoints ---
    const TARGET_EMAIL_API_URLS = {
        AGGREGATED_STATS: '/api/email-analytics/aggregated-stats',
        TIMESERIES: '/api/email-analytics/timeseries',
        OVERVIEW: '/api/email-analytics/overview'
    };
    
    // --- Individual email page (new) endpoints ---
    // Supports both legacy `/api/email-performance/<emailId>/<metric>` and current
    // `/api/email-performance/emails/<emailId>/<metric>` URL shapes.
    const emailPerformanceRegex = /^\/api\/email-performance\/(?:emails\/)?([a-zA-Z0-9]+)\/([\w-]+)\/?$/;
    const emailPerformanceCache = {}; // Cache for consistent data per emailID

    function getOrGenerateBaseStats(emailID) {
        if (!emailPerformanceCache[emailID]) {
            const volumeModel = getEmailVolumeModel();
            const minRecipients = Math.max(40, Math.round(volumeModel.avgRecipientsPerCampaign * 0.65));
            const maxRecipients = Math.max(minRecipients + 1, Math.min(volumeModel.employeeCount, Math.round(volumeModel.avgRecipientsPerCampaign * 1.6)));
            const totalRecipients = rand(minRecipients, maxRecipients);
            const uniqueOpens = Math.round(totalRecipients * randFloat(0.55, 0.85)); // 55-85% open rate
            const uniqueClicks = Math.round(uniqueOpens * randFloat(0.18, 0.45));   // 18-45% click-through rate (of openers)
            const totalOpens = Math.round(uniqueOpens * randFloat(1.1, 1.7));
            const totalClicks = Math.round(uniqueClicks * randFloat(1.2, 2.2));
            const bounceRate = randFloat(0.001, 0.02, 4); // 0.1% - 2.0% bounce rate
            const totalBounces = Math.max(0, Math.min(totalRecipients, Math.round(totalRecipients * bounceRate)));
            const lastBounceRecorded = totalBounces > 0
                ? new Date(Date.now() - rand(12 * 3600000, 72 * 3600000)).toISOString() // within last 1-3 days
                : "";
            
            emailPerformanceCache[emailID] = {
                totalRecipients,
                targetAudience: totalRecipients + rand(0, Math.max(25, Math.round(totalRecipients * 0.03))), // Target audience can be slightly larger
                uniqueOpens,
                totalOpens,
                uniqueClicks,
                totalClicks,
                totalBounces,
                bounceRate,
                lastBounceRecorded,
                // Generate a recent timestamp (1-2 days ago) for last click
                lastClickRecorded: new Date(Date.now() - rand(24 * 3600000, 48 * 3600000)).toISOString()
            };
        }
        return emailPerformanceCache[emailID];
    }

    function getUrlParams(urlString) {
        const params = {};
        try {
            const url = new URL(urlString, window.location.origin);
            url.searchParams.forEach((value, key) => {
                params[key] = value;
            });
        } catch (e) { /* console.warn(INJECTED_LOG_PREFIX, "Could not parse URL for params:", urlString, e); */ }
        return params;
    }
    
function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}


    // Redistributes clicks across existing links while keeping the link objects intact.
    function redistributeLinksWithClicks(links, totalClicksTarget) {
        if (!Array.isArray(links) || links.length === 0) return [];
        const sanitizedTotal = Math.max(totalClicksTarget || 0, links.length);
        
        // Use existing click/percentage values as weights when available, otherwise random.
        const weights = links.map(link => {
            const clicks = Number(link.totalClicks) || 0;
            const pct = Number(link.percentage) || 0;
            const baseline = clicks > 0 ? clicks : (pct > 0 ? pct * sanitizedTotal : 0);
            return baseline > 0 ? baseline : (Math.random() + 0.2);
        });
        const weightSum = weights.reduce((sum, w) => sum + w, 0) || links.length;

        // Initial distribution (floor to avoid going over the target)
        const distributed = links.map((link, idx) => {
            const share = weights[idx] / weightSum;
            return { ...link, totalClicks: Math.floor(sanitizedTotal * share) };
        });

        // Fix rounding remainder on the first link to ensure totals add up
        const assigned = distributed.reduce((sum, l) => sum + (Number(l.totalClicks) || 0), 0);
        const remainder = sanitizedTotal - assigned;
        if (distributed.length > 0) {
            distributed[0].totalClicks = Math.max(0, (distributed[0].totalClicks || 0) + remainder);
        }

        // Recalculate percentage based on redistributed clicks
        return distributed.map(link => {
            const clicks = Math.max(0, Number(link.totalClicks) || 0);
            const pct = sanitizedTotal > 0 ? parseFloat((clicks / sanitizedTotal).toFixed(4)) : 0;
            return { ...link, totalClicks: clicks, percentage: pct };
        });
    }


function generateTimeSeriesData(urlParams, statsToDistribute, isCumulative = false) {
    const { since, until, groupBy = 'DAY' } = urlParams;
    let sinceDate = new Date(decodeURIComponent(since));
    const untilDate = new Date(decodeURIComponent(until));

    if (isNaN(sinceDate.getTime()) || isNaN(untilDate.getTime())) {
        return { timeseries: [] }; // Cannot generate without valid dates
    }

    const upperGroupBy = groupBy.toUpperCase();

    // 1. Generate the original "active" intervals based on the API request
    const activeIntervals = [];
    let tempCurrentDate = new Date(sinceDate);
    while (tempCurrentDate <= untilDate) {
        activeIntervals.push(new Date(tempCurrentDate));
        switch (upperGroupBy) {
            case 'HOUR': tempCurrentDate.setUTCHours(tempCurrentDate.getUTCHours() + 1); break;
            case 'WEEK': tempCurrentDate.setUTCDate(tempCurrentDate.getUTCDate() + 7); break;
            case 'DAY':
            default: tempCurrentDate.setUTCDate(tempCurrentDate.getUTCDate() + 1); break;
        }
    }

    // 2. Determine minimum points and create the final intervals array, padding if necessary
    let minPoints = 0;
    if (upperGroupBy === 'HOUR') minPoints = 24;
    else if (upperGroupBy === 'WEEK') minPoints = 4;
    else if (upperGroupBy === 'DAY') minPoints = 7;

    let finalIntervals = [...activeIntervals];
    const pointsToAdd = minPoints - activeIntervals.length;

    if (pointsToAdd > 0) {
        const paddedIntervals = [];
        let padDate = new Date(sinceDate);
        for (let i = 0; i < pointsToAdd; i++) {
            switch (upperGroupBy) {
                case 'HOUR': padDate.setUTCHours(padDate.getUTCHours() - 1); break;
                case 'WEEK': padDate.setUTCDate(padDate.getUTCDate() - 7); break;
                case 'DAY':
                default: padDate.setUTCDate(padDate.getUTCDate() - 1); break;
            }
            paddedIntervals.unshift(new Date(padDate));
        }
        finalIntervals = [...paddedIntervals, ...finalIntervals];
    }


    // 3. Distribute stats across the ENTIRE set of final intervals
    const numTotalIntervals = finalIntervals.length;
    let finalDistributedValues = [];

    if (numTotalIntervals > 0) {
        const weights = finalIntervals.map((_, i) => {
            const decayFactor = Math.pow(0.7, i) + 0.1;
            return Math.random() * decayFactor;
        });
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);

        finalDistributedValues = finalIntervals.map((_, i) => {
            if (totalWeight === 0) return { opens: 0, clicks: 0 };
            const share = weights[i] / totalWeight;
            const opens = Math.floor(statsToDistribute.opens * share);
            const clicks = Math.floor(statsToDistribute.clicks * share);
            return { opens, clicks: Math.min(opens, clicks) };
        });

        const sumOpens = finalDistributedValues.reduce((sum, v) => sum + v.opens, 0);
        const sumClicks = finalDistributedValues.reduce((sum, v) => sum + v.clicks, 0);

        const openRemainder = statsToDistribute.opens - sumOpens;
        const clickRemainder = statsToDistribute.clicks - sumClicks;

        if (finalDistributedValues.length > 0) {
            finalDistributedValues[0].opens += openRemainder;
            finalDistributedValues[0].clicks += clickRemainder;
            // Final safety checks
            finalDistributedValues[0].opens = Math.max(0, finalDistributedValues[0].opens);
            finalDistributedValues[0].clicks = Math.max(0, finalDistributedValues[0].clicks);
            finalDistributedValues[0].clicks = Math.min(finalDistributedValues[0].opens, finalDistributedValues[0].clicks);
        }
    }

    // 4. If cumulative, transform the final distributed values into a cumulative sum
    if (isCumulative && finalDistributedValues.length > 1) {
        for (let i = 1; i < finalDistributedValues.length; i++) {
            finalDistributedValues[i].opens += finalDistributedValues[i - 1].opens;
            finalDistributedValues[i].clicks += finalDistributedValues[i - 1].clicks;
        }
        if (finalDistributedValues.length > 0) {
            finalDistributedValues[finalDistributedValues.length - 1].opens = statsToDistribute.opens;
            finalDistributedValues[finalDistributedValues.length - 1].clicks = statsToDistribute.clicks;
        }
    }

    // 5. Build the final timeseries response object
    const timeseries = finalIntervals.map((intervalDate, i) => ({
        opens: finalDistributedValues[i]?.opens || 0,
        clicks: finalDistributedValues[i]?.clicks || 0,
        interval: {
            hour: intervalDate.getUTCHours(),
            day: intervalDate.getUTCDate(),
            week: getWeekNumber(intervalDate),
            month: intervalDate.getUTCMonth() + 1,
            year: intervalDate.getUTCFullYear()
        }
    }));

    return { timeseries };
}


    function calculateDateMetrics(sinceStr, untilStr) {
        const since = new Date(decodeURIComponent(sinceStr));
        const until = new Date(decodeURIComponent(untilStr));
        if (isNaN(since.getTime()) || isNaN(until.getTime()) || since > until) {
            const defaultUntil = new Date();
            const defaultSince = new Date(defaultUntil.getTime() - 30 * 24 * 60 * 60 * 1000);
            return { days: 30, weeks: 4, months: 1, error: true, sinceDate: defaultSince, untilDate: defaultUntil };
        }
        const dayMillis = 1000 * 60 * 60 * 24;
        const days = Math.max(1, Math.ceil((until - since) / dayMillis));
        const weeks = Math.max(1, Math.ceil(days / 7));
        const months = Math.max(1, Math.ceil(days / 30.44));
        return { days, weeks, months, sinceDate: since, untilDate: until, error: false };
    }

    function generateRandomDate(startDate, endDate) {
        return new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()));
    }

    function generateLinkList(baseStats, existingLinks = [], limit = 5) {
        const fallbackLinks = [
            { name: 'Company Update', target: 'https://example.staffbase.com/updates' },
            { name: 'Benefits Portal', target: 'https://benefits.staffbase.com' },
            { name: 'Team Spotlight', target: 'https://blog.staffbase.com/team' },
            { name: 'Watch the Replay', target: 'https://video.staffbase.com/replay' },
            { name: 'Register for Training', target: 'https://learn.staffbase.com' },
            { name: 'Survey', target: 'https://forms.staffbase.com/survey' },
            { name: 'Product Docs', target: 'https://docs.staffbase.com' }
        ];

        const sourceLinks = (existingLinks && existingLinks.length > 0 ? existingLinks : fallbackLinks).slice(0, Math.max(1, limit));
        const totalClicksForLinks = Math.max(baseStats.totalClicks, rand(6, 24));
        const totalUniqueOpens = Math.max(baseStats.uniqueOpens, totalClicksForLinks + rand(3, 9));

        const weights = sourceLinks.map(() => Math.random() + 0.2); // bias to avoid zeros
        const weightSum = weights.reduce((sum, w) => sum + w, 0);
        let remainingClicks = totalClicksForLinks;

        return sourceLinks.map((link, index) => {
            const share = weightSum > 0 ? weights[index] / weightSum : 1 / sourceLinks.length;
            let clicksForLink = Math.round(totalClicksForLinks * share);

            if (index === sourceLinks.length - 1) {
                clicksForLink = remainingClicks;
            } else {
                clicksForLink = Math.min(remainingClicks, clicksForLink);
                remainingClicks -= clicksForLink;
            }

            const uniqueClicksForLink = Math.max(1, clicksForLink);
            const uniqueOpensForLink = Math.max(uniqueClicksForLink, Math.round(uniqueClicksForLink * randFloat(1.05, 1.8)));
            const percentBaseOpens = Math.max(1, Math.round(totalUniqueOpens * randFloat(0.55, 0.85)));
            const percentage = parseFloat(Math.min(1, Math.max(uniqueClicksForLink / percentBaseOpens, 0.01)).toFixed(4));

            return {
                ...(link.name ? { name: link.name } : { name: pick(fallbackLinks).name }),
                ...(link.target ? { target: link.target } : { target: pick(fallbackLinks).target }),
                uniqueOpens: uniqueOpensForLink,
                uniqueClicks: uniqueClicksForLink,
                percentage,
                locale: link.locale || 'en_US'
            };
        });
    }

    const injectedEmailCustomFetch = async function(...args) {
        const resource = args[0];
        const requestFullUrl = typeof resource === 'string' ? resource : resource.url;
        let urlPath = '';
        let urlParams = {};

        try {
            const parsedUrl = new URL(requestFullUrl, window.location.origin);
            urlPath = parsedUrl.pathname;
            urlParams = getUrlParams(requestFullUrl);
        } catch (e) {
            if (requestFullUrl.startsWith('/')) {
                urlPath = requestFullUrl.split('?')[0];
                urlParams = getUrlParams(requestFullUrl);
            } else {
                return pageContextOriginalFetch.apply(this, args);
            }
        }

        let matchedEndpointKey = null;
        if (urlPath === TARGET_EMAIL_API_URLS.AGGREGATED_STATS) matchedEndpointKey = 'AGGREGATED_STATS';
        else if (urlPath === TARGET_EMAIL_API_URLS.TIMESERIES) matchedEndpointKey = 'TIMESERIES';
        else if (urlPath === TARGET_EMAIL_API_URLS.OVERVIEW) matchedEndpointKey = 'OVERVIEW';

        const performanceMatch = urlPath.match(emailPerformanceRegex);

        // --- Start Interception Logic ---
        if (matchedEndpointKey) {
            // --- EXISTING LOGIC FOR MAIN ANALYTICS PAGE ---
            // console.log(INJECTED_LOG_PREFIX + ` Intercepting ${matchedEndpointKey}: ${requestFullUrl.substring(0,150)}`);
            const { days, weeks, months, sinceDate, untilDate, error: dateError } = calculateDateMetrics(urlParams.since, urlParams.until);
            const volumeModel = getEmailVolumeModel();
            const uniqueSentPerDay = parseFloat((randFloat(0.35, 1.10, 3) * volumeModel.campaignScale).toFixed(3));
            const dailyRate = {
                uniqueSentEmails: Math.max(0.25, Math.min(8.5, uniqueSentPerDay)),
                avgRecipientsPerCampaign: volumeModel.avgRecipientsPerCampaign,
                openRate: randFloat(0.20, 0.50),      // Adjusted from 0.55
                clickToOpenRate: randFloat(0.05, 0.20), // Adjusted from 0.25
                opensPerUniqueOpen: randFloat(1.1, 1.8), // Adjusted from 2.0
                clicksPerUniqueClick: randFloat(1.1, 2.2) // Adjusted from 2.5
            };
            try {
                const response = await pageContextOriginalFetch.apply(this, args); // Get original response first
                let originalJsonData = {};
                let responseOk = response.ok;
                let responseStatus = response.status;
                let responseHeaders = response.headers;

                if (responseOk && response.headers.get("content-type")?.includes("application/json")) {
                    originalJsonData = await response.clone().json();
                } else if (!responseOk) {
                    // If original response was an error, we might still want to generate mock data if it's a known endpoint
                    console.warn(INJECTED_LOG_PREFIX, `Original request for ${matchedEndpointKey} failed with status ${responseStatus}. Will generate mock data.`);
                }


                let modifiedData = {}; 

                switch (matchedEndpointKey) {
                    case 'AGGREGATED_STATS':
                        let genUniqueSentEmails = Math.max(1, Math.round(dailyRate.uniqueSentEmails * days * randFloat(0.7, 1.3)));
                        let genRecipients = Math.max(genUniqueSentEmails, Math.round(genUniqueSentEmails * dailyRate.avgRecipientsPerCampaign * randFloat(0.7, 1.3)));
                        let genSentEmails = Math.max(genRecipients, Math.round(genRecipients * randFloat(1.0, 1.1))); 
                        let genUniqueOpens = Math.round(genRecipients * dailyRate.openRate * randFloat(0.8, 1.2));
                        genUniqueOpens = Math.min(genRecipients, Math.max(0, genUniqueOpens));
                        let genUniqueClicks = Math.round(genUniqueOpens * dailyRate.clickToOpenRate * randFloat(0.8, 1.2));
                        genUniqueClicks = Math.min(genUniqueOpens, Math.max(0, genUniqueClicks));
                        let genTotalOpens = Math.round(genUniqueOpens * dailyRate.opensPerUniqueOpen * randFloat(0.9, 1.1));
                        genTotalOpens = Math.max(genUniqueOpens, genTotalOpens);
                        let genTotalClicks = Math.round(genUniqueClicks * dailyRate.clicksPerUniqueClick * randFloat(0.9, 1.1));
                        genTotalClicks = Math.max(genUniqueClicks, genTotalClicks);
                        
                        if (days <= 7) { // Ensure some minimal data for very short periods
                            genUniqueSentEmails = Math.max(genUniqueSentEmails, rand(2,6));
                            const shortWindowRecipientsPerCampaign = Math.max(40, Math.round(volumeModel.avgRecipientsPerCampaign * randFloat(0.65, 1.0)));
                            genRecipients = Math.max(genRecipients, genUniqueSentEmails * shortWindowRecipientsPerCampaign);
                            genSentEmails = Math.max(genSentEmails, genRecipients);
                            genUniqueOpens = Math.max(genUniqueOpens, Math.floor(genRecipients * randFloat(0.15, 0.35)));
                            genUniqueOpens = Math.min(genUniqueOpens, genRecipients);
                            genUniqueClicks = Math.max(genUniqueClicks, Math.floor(genUniqueOpens * randFloat(0.08, 0.22)));
                            genUniqueClicks = Math.min(genUniqueClicks, genUniqueOpens);
                            genTotalOpens = Math.max(genTotalOpens, genUniqueOpens);
                            genTotalClicks = Math.max(genTotalClicks, genUniqueClicks);
                        }
                        modifiedData = {
                            uniqueSentEmails: genUniqueSentEmails, sentEmails: genSentEmails, recipients: genRecipients,
                            uniqueOpens: genUniqueOpens, uniqueClicks: genUniqueClicks, totalOpens: genTotalOpens, totalClicks: genTotalClicks
                        };
                        break;

                    case 'TIMESERIES':
                        modifiedData.timeseries = [];
                        const aggStatsForTimeSeries = {uniqueSentEmails:0, sentEmails:0, recipients:0, uniqueOpens:0, uniqueClicks:0, totalOpens:0, totalClicks:0};
                        aggStatsForTimeSeries.uniqueSentEmails = Math.max(1, Math.round(dailyRate.uniqueSentEmails * days * randFloat(0.7, 1.3)));
                        aggStatsForTimeSeries.recipients = Math.max(aggStatsForTimeSeries.uniqueSentEmails, Math.round(aggStatsForTimeSeries.uniqueSentEmails * dailyRate.avgRecipientsPerCampaign * randFloat(0.7, 1.3)));
                        aggStatsForTimeSeries.sentEmails = Math.max(aggStatsForTimeSeries.recipients, Math.round(aggStatsForTimeSeries.recipients * randFloat(1.0, 1.1)));
                        aggStatsForTimeSeries.uniqueOpens = Math.min(aggStatsForTimeSeries.recipients, Math.max(0,Math.round(aggStatsForTimeSeries.recipients * dailyRate.openRate * randFloat(0.8, 1.2))));
                        aggStatsForTimeSeries.uniqueClicks = Math.min(aggStatsForTimeSeries.uniqueOpens, Math.max(0,Math.round(aggStatsForTimeSeries.uniqueOpens * dailyRate.clickToOpenRate * randFloat(0.8, 1.2))));
                        aggStatsForTimeSeries.totalOpens = Math.max(aggStatsForTimeSeries.uniqueOpens, Math.round(aggStatsForTimeSeries.uniqueOpens * dailyRate.opensPerUniqueOpen * randFloat(0.9, 1.1)));
                        aggStatsForTimeSeries.totalClicks = Math.max(aggStatsForTimeSeries.uniqueClicks, Math.round(aggStatsForTimeSeries.uniqueClicks * dailyRate.clicksPerUniqueClick * randFloat(0.9, 1.1)));

                        let numIntervals = 0; const groupBy = urlParams.groupBy || 'day';
                        if (groupBy === 'month') numIntervals = months;
                        else if (groupBy === 'week') numIntervals = weeks;
                        else numIntervals = days;
                        numIntervals = Math.max(1, numIntervals);
                        let currentDate = new Date(sinceDate);

                        let remainingSent = aggStatsForTimeSeries.sentEmails;
                        let remainingOpens = aggStatsForTimeSeries.totalOpens;
                        let remainingClicks = aggStatsForTimeSeries.totalClicks;

                        for (let i = 0; i < numIntervals; i++) {
                            let intervalDateStr = currentDate.toISOString().split('T')[0] + "T00:00:00Z";
                            let sentForInterval = (i === numIntervals - 1) ? remainingSent : Math.max(0,Math.round(aggStatsForTimeSeries.sentEmails / numIntervals * randFloat(0.5, 1.5)));
                            remainingSent = Math.max(0, remainingSent - sentForInterval);
                            let opensForInterval = (i === numIntervals - 1) ? remainingOpens : Math.max(0,Math.round(aggStatsForTimeSeries.totalOpens / numIntervals * randFloat(0.5, 1.5)));
                            remainingOpens = Math.max(0, remainingOpens - opensForInterval);
                            let clicksForInterval = (i === numIntervals - 1) ? remainingClicks : Math.max(0,Math.round(aggStatsForTimeSeries.totalClicks / numIntervals * randFloat(0.5, 1.5)));
                            remainingClicks = Math.max(0, remainingClicks - clicksForInterval);
                             // Ensure clicks are not more than opens for the interval for basic plausibility
                            clicksForInterval = Math.min(clicksForInterval, opensForInterval);

                            modifiedData.timeseries.push({
                                date: intervalDateStr,
                                totalClicks: clicksForInterval, totalOpens: opensForInterval, totalSentEmails: sentForInterval
                            });
                            if (groupBy === 'month') currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
                            else if (groupBy === 'week') currentDate.setUTCDate(currentDate.getUTCDate() + 7);
                            else currentDate.setUTCDate(currentDate.getUTCDate() + 1);
                            if (currentDate > untilDate && i < numIntervals -1) break;
                        }
                        break;

                    case 'OVERVIEW':
                        modifiedData.series = [];
                        const existingEmails = (originalJsonData && Array.isArray(originalJsonData.series)) ? originalJsonData.series : [];
                        if (existingEmails.length > 0) {
                            existingEmails.forEach(email => {
                                const generatedRecipients = Math.max(
                                    10,
                                    rand(
                                        Math.max(10, Math.floor(dailyRate.avgRecipientsPerCampaign * 0.35)),
                                        Math.max(20, Math.floor(dailyRate.avgRecipientsPerCampaign * 1.25))
                                    )
                                );
                                let newRecipients = Math.max(email.recipients || 0, generatedRecipients);
                                let newSent = Math.max(email.sentEmails || 0, Math.round(newRecipients * randFloat(1.0, 1.08)));
                                if (email.sentEmails > 0 && newSent < email.sentEmails) newSent = email.sentEmails; // Don't reduce sends if original was higher
                                if (email.recipients > 0 && newRecipients < email.recipients) newRecipients = email.recipients;


                                let newUniqueOpens = Math.round(newRecipients * dailyRate.openRate * randFloat(0.7, 1.2));
                                newUniqueOpens = Math.min(newRecipients, Math.max(email.uniqueOpens || 0, newUniqueOpens));
                                newUniqueOpens = Math.max(0, newUniqueOpens);


                                let newUniqueClicks = Math.round(newUniqueOpens * dailyRate.clickToOpenRate * randFloat(0.7, 1.2));
                                newUniqueClicks = Math.min(newUniqueOpens, Math.max(email.uniqueClicks || 0, newUniqueClicks));
                                newUniqueClicks = Math.max(0, newUniqueClicks);

                                let newTotalOpens = Math.round(newUniqueOpens * dailyRate.opensPerUniqueOpen * randFloat(0.9, 1.1));
                                newTotalOpens = Math.max(newUniqueOpens, Math.max(email.totalOpens || 0, newTotalOpens));

                                let newTotalClicks = Math.round(newUniqueClicks * dailyRate.clicksPerUniqueClick * randFloat(0.9, 1.1));
                                newTotalClicks = Math.max(newUniqueClicks, Math.max(email.totalClicks || 0, newTotalClicks));

                                modifiedData.series.push({
                                    ...email, // Keep original id, title, subject, published date
                                    sentEmails: newSent,
                                    recipients: newRecipients,
                                    uniqueOpens: newUniqueOpens,
                                    uniqueClicks: newUniqueClicks, // Augmented
                                    totalOpens: newTotalOpens,
                                    totalClicks: newTotalClicks   // Augmented
                                });
                            });
                        } else {
                            let numEmailsInOverview = Math.max(1, Math.round(dailyRate.uniqueSentEmails * days * randFloat(0.5, 1.0)));
                            numEmailsInOverview = Math.min(numEmailsInOverview, Math.max(12, Math.min(120, Math.round(12 + (dailyRate.uniqueSentEmails * Math.min(days, 90))))));
                            const emailTitles = ["Company Update", "Weekly Digest", "Project News", "IT Alert", "HR Update", "Monthly Roundup", "CEO Message", "Product Launch", "Event Invite", "Training Info"];
                            
                            for (let i = 0; i < numEmailsInOverview; i++) {
                                const recipientsForThisEmail = Math.max(1, rand(Math.floor(dailyRate.avgRecipientsPerCampaign * 0.3), Math.floor(dailyRate.avgRecipientsPerCampaign * 1.2)));
                                const sentForThisEmail = Math.max(recipientsForThisEmail, Math.round(recipientsForThisEmail * randFloat(1.0, 1.05)));
                                const uniqueOpensForThisEmail = Math.min(recipientsForThisEmail, Math.round(recipientsForThisEmail * dailyRate.openRate * randFloat(0.7, 1.3)));
                                const uniqueClicksForThisEmail = Math.min(uniqueOpensForThisEmail, Math.round(uniqueOpensForThisEmail * dailyRate.clickToOpenRate * randFloat(0.7, 1.3)));
                                const totalOpensForThisEmail = Math.max(uniqueOpensForThisEmail, Math.round(uniqueOpensForThisEmail * dailyRate.opensPerUniqueOpen * randFloat(0.9,1.1)));
                                const totalClicksForThisEmail = Math.max(uniqueClicksForThisEmail, Math.round(uniqueClicksForThisEmail * dailyRate.clicksPerUniqueClick * randFloat(0.9,1.1)));

                                modifiedData.series.push({
                                    emailId: `fakeemailid_${i}_${Date.now()}_${rand(1000,9999)}`,
                                    emailTitle: emailTitles[rand(0, emailTitles.length - 1)] + (numEmailsInOverview > emailTitles.length ? ` #${i+1}` : ` (v${rand(1,3)})`),
                                    emailSubject: "Important Information Inside - Action Required",
                                    emailPublished: generateRandomDate(sinceDate, untilDate).toISOString(),
                                    sentEmails: sentForThisEmail,
                                    recipients: recipientsForThisEmail,
                                    uniqueOpens: uniqueOpensForThisEmail,
                                    uniqueClicks: uniqueClicksForThisEmail,
                                    totalOpens: totalOpensForThisEmail,
                                    totalClicks: totalClicksForThisEmail
                                });
                            }
                        }
                        // Apply sorting if orderBy parameter is present
                        if (urlParams.orderBy && modifiedData.series && modifiedData.series.length > 0) {
                            const [field, direction] = urlParams.orderBy.split('_');
                            const sortField = field === 'opened' ? 'uniqueOpens' : (field === 'clicked' ? 'uniqueClicks' : field);
                            if (modifiedData.series[0].hasOwnProperty(sortField)) {
                                modifiedData.series.sort((a, b) => {
                                    if (direction && direction.toUpperCase() === 'DESC') return b[sortField] - a[sortField];
                                    return a[sortField] - b[sortField];
                                });
                            }
                        }
                        break;
                }
                
                // console.log(INJECTED_LOG_PREFIX + ` Modified ${matchedEndpointKey} data:`, JSON.parse(JSON.stringify(modifiedData)));
                return new Response(JSON.stringify(modifiedData), {
                    status: 200, statusText: "OK", headers: {'Content-Type': 'application/json'}
                });

            } catch (err) {
                 console.error(INJECTED_LOG_PREFIX + ` Error during data generation for ${requestFullUrl}:`, err);
                 // Fallback to avoid breaking the page
                if (matchedEndpointKey === 'TIMESERIES') return new Response(JSON.stringify({timeseries:[]}), {status: 200, headers: {'Content-Type': 'application/json'}});
                if (matchedEndpointKey === 'OVERVIEW') return new Response(JSON.stringify({series:[]}), {status: 200, headers: {'Content-Type': 'application/json'}});
                if (matchedEndpointKey === 'AGGREGATED_STATS') return new Response(JSON.stringify({uniqueSentEmails:0, sentEmails:0, recipients:0, uniqueOpens:0, uniqueClicks:0, totalOpens:0, totalClicks:0}), {status: 200, headers: {'Content-Type': 'application/json'}});
                return pageContextOriginalFetch.apply(this, args);
            }
        } else if (performanceMatch) {
            const emailID = performanceMatch[1];
            const metric = performanceMatch[2];
            
            const baseStats = getOrGenerateBaseStats(emailID);
            let modifiedData = {};

            switch(metric) {
                case 'recipient-count':
                    modifiedData = { totalRecipients: baseStats.totalRecipients, targetAudience: baseStats.targetAudience };
                    break;

                case 'bounces': {
                    const bouncePercentage = baseStats.totalRecipients > 0 ? parseFloat((baseStats.totalBounces / baseStats.totalRecipients).toFixed(4)) : 0;
                    modifiedData = { totalBounces: baseStats.totalBounces, percentage: bouncePercentage, lastBounceRecorded: baseStats.lastBounceRecorded };
                    break;
                }
                
                case 'opens':
                    {
                        const openRate = baseStats.totalRecipients > 0 ? parseFloat((baseStats.uniqueOpens / baseStats.totalRecipients).toFixed(4)) : 0;
                        modifiedData = {
                            totalOpens: baseStats.totalOpens,
                            uniqueOpens: baseStats.uniqueOpens,
                            percentage: openRate,
                            lastClickRecorded: baseStats.lastClickRecorded
                        };
                    }
                    break;

                case 'clicks':
                    {
                        const clickRate = baseStats.uniqueOpens > 0 ? parseFloat((baseStats.uniqueClicks / baseStats.uniqueOpens).toFixed(4)) : 0;
                        modifiedData = {
                            totalClicks: baseStats.totalClicks,
                            uniqueClicks: baseStats.uniqueClicks,
                            percentage: clickRate,
                            lastClickRecorded: baseStats.lastClickRecorded
                        };
                    }
                    break;
                
                case 'read-times':
                    const totalRead = Math.round(baseStats.uniqueOpens * randFloat(0.65, 0.92));
                    modifiedData = {
                        totalGlanced: Math.max(0, baseStats.uniqueOpens - totalRead - rand(0, Math.floor(totalRead * 0.1))),
                        totalSkimmed: Math.max(0, baseStats.uniqueOpens - totalRead),
                        totalRead: totalRead,
                        percentageRead: baseStats.uniqueOpens > 0 ? parseFloat((totalRead / baseStats.uniqueOpens).toFixed(4)) : 0,
                    };
                    break;
                
                case 'engagement-trend':
                    modifiedData = {
                        targetAudience: baseStats.targetAudience,
                        sent: {
                            total: baseStats.totalRecipients,
                            previous: Math.round(baseStats.totalRecipients * randFloat(0.8, 1.2)),
                            dropOff: rand(0, 1),
                            percentage: 1, // Assuming all targeted were sent
                            previousBouncedTotal: 0,
                            previousBouncedPercentage: 0,
                            noEmailAddressTotal: 0,
                            noEmailAddressPercentage: 0
                        },
                        opens: { total: baseStats.uniqueOpens, previous: Math.round(baseStats.uniqueOpens * randFloat(0.8, 1.2)), dropOff: rand(0,1), percentage: baseStats.totalRecipients > 0 ? parseFloat((baseStats.uniqueOpens / baseStats.totalRecipients).toFixed(4)) : 0 },
                        clicks: { total: baseStats.uniqueClicks, previous: Math.round(baseStats.uniqueClicks * randFloat(0.8, 1.2)), dropOff: rand(0,1), percentage: baseStats.uniqueOpens > 0 ? parseFloat((baseStats.uniqueClicks / baseStats.uniqueOpens).toFixed(4)) : 0 }
                    };
                    break;

                    case 'links':
                        // For links, we need the original response to know WHAT links to modify
                        try {
                            const originalResponse = await pageContextOriginalFetch.apply(this, args);
                            const originalJson = await originalResponse.clone().json().catch(() => ({}));
                            const links = Array.isArray(originalJson.links) ? originalJson.links : [];

                            if (links.length > 0) {
                                const desiredTotalClicks = Math.max(links.length, Math.round(baseStats.totalClicks || baseStats.uniqueClicks || 0));
                                const redistributed = redistributeLinksWithClicks(links, desiredTotalClicks);
                                modifiedData = { links: redistributed };
                            } else {
                                const generatedLinks = generateLinkList(baseStats, [], 5).map(link => ({
                                    ...link,
                                    totalClicks: link.uniqueClicks
                                }));
                                const desiredTotalClicks = Math.max(generatedLinks.length, Math.round(baseStats.totalClicks || baseStats.uniqueClicks || 0));
                                modifiedData = { links: redistributeLinksWithClicks(generatedLinks, desiredTotalClicks) };
                            }
                            
                        } catch (err) {
                            console.error(INJECTED_LOG_PREFIX + `Error fetching original or modifying links for ${emailID}:`, err);
                            const fallbackLinks = generateLinkList(baseStats, [], 5).map(link => ({
                                ...link,
                                totalClicks: link.uniqueClicks
                            }));
                            const desiredTotalClicks = Math.max(fallbackLinks.length, Math.round(baseStats.totalClicks || baseStats.uniqueClicks || 0));
                            modifiedData = { links: redistributeLinksWithClicks(fallbackLinks, desiredTotalClicks) };
                        }
                        break;

                case 'top-clicked-links': {
                    const limit = Math.max(1, parseInt(urlParams.limit || 6, 10) || 6);
                    let linksObject = {};
                    let fallbackLinksArray = [];

                    try {
                        const originalResponse = await pageContextOriginalFetch.apply(this, args);
                        const originalJson = await originalResponse.clone().json().catch(() => ({}));

                        if (originalJson.links && typeof originalJson.links === 'object' && !Array.isArray(originalJson.links)) {
                            const entries = Object.entries(originalJson.links).sort((a, b) => Number(a[0]) - Number(b[0]));
                            fallbackLinksArray = entries.map(([, link]) => link);
                            const desiredTotalClicks = Math.max(limit, Math.round(baseStats.totalClicks || baseStats.uniqueClicks || 0));
                            const redistributed = redistributeLinksWithClicks(fallbackLinksArray, desiredTotalClicks).slice(0, limit);
                            entries.slice(0, limit).forEach(([key], idx) => {
                                if (redistributed[idx]) linksObject[key] = redistributed[idx];
                            });
                        } else if (Array.isArray(originalJson.links)) {
                            fallbackLinksArray = originalJson.links;
                        }
                    } catch (e) { /* ignore and fall back */ }

                    if (Object.keys(linksObject).length === 0) {
                        const sourceLinks = fallbackLinksArray.length > 0
                            ? fallbackLinksArray
                            : generateLinkList(baseStats, [], limit).map(link => ({ ...link, totalClicks: link.uniqueClicks }));
                        const desiredTotalClicks = Math.max(limit, Math.round(baseStats.totalClicks || baseStats.uniqueClicks || 0));
                        const redistributed = redistributeLinksWithClicks(sourceLinks, desiredTotalClicks).slice(0, limit);
                        redistributed.forEach((link, idx) => {
                            linksObject[(idx + 1).toString()] = link;
                        });
                    }

                    modifiedData = { links: linksObject };
                    break;
                }
                    
                case 'total-activity-over-time':
                    modifiedData = generateTimeSeriesData(urlParams, { opens: baseStats.totalOpens, clicks: baseStats.totalClicks }, false);
                    break;

                case 'unique-activity-over-time':
                    // Unique activity is cumulative, so we show the final total at each interval.
                    modifiedData = generateTimeSeriesData(urlParams, { opens: baseStats.uniqueOpens, clicks: baseStats.uniqueClicks }, true);
                    break;

                default:
                    // If the metric is not handled, pass through the original request
                    return pageContextOriginalFetch.apply(this, args);
            }

            // Return the modified data for the performance endpoint
            return new Response(JSON.stringify(modifiedData), {
                status: 200, statusText: "OK", headers: {'Content-Type': 'application/json'}
            });
        }

        return pageContextOriginalFetch.apply(this, args);
    };

    window.fetch = injectedEmailCustomFetch;
    window.__REPLIFY_EMAIL_FETCH_APPLIED__ = true;

    window.__REPLIFY_REVERT_EMAIL_FETCH__ = function() {
        if (window.fetch === injectedEmailCustomFetch) {
            window.fetch = pageContextOriginalFetch;
            delete window.__REPLIFY_EMAIL_FETCH_APPLIED__;
            delete window.__REPLIFY_REVERT_EMAIL_FETCH__;
            return true;
        }
        return false;
    };
})();

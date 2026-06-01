// Patches window.fetch on the Governance analytics page to inflate issue counts and
// view metrics on pages, making the governance dashboard look actively monitored.
(function() {
    'use strict';

    const INJECTED_LOG_PREFIX = '[Replify InjectedGovernancePatch]:';

    if (window.__REPLIFY_GOVERNANCE_FETCH_APPLIED__) {
        return;
    }

    const pageContextOriginalFetch = window.fetch;
    if (!pageContextOriginalFetch) {
        console.error(INJECTED_LOG_PREFIX, 'CRITICAL: window.fetch is null/undefined in page context!');
        return;
    }

    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
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

    const ISSUE_TYPES = ["stale_content", "no_views", "broken_links", "expired_reminder", "broken_user_widget"];
    const METRICS_CACHE_TTL_MS = 60 * 1000;
    const METRIC_KEYS = ["staleContent", "needsReview", "expiredReminder", "brokenLinks", "noViews", "brokenUserWidget"];

    let lastIssueMetrics = null;
    let lastIssueMetricsAt = 0;

    const withUniqueIssues = (existing, extraCount, allowedIssues = ISSUE_TYPES) => {
        const result = Array.isArray(existing) ? existing.slice() : [];
        while (result.length < extraCount) {
            const candidate = allowedIssues[rand(0, allowedIssues.length - 1)];
            if (!result.includes(candidate)) {
                result.push(candidate);
            }
        }
        return result;
    };

    const calculateViewCount = (currentCount) => {
        const employeeCount = getEmployeeCount();
        const scale = Math.max(1, employeeCount / 300);
        const baseline = rand(90, 320) * scale;
        const variability = Math.random() < 0.35 ? randFloat(0.05, 0.25) : randFloat(0.5, 1.1);
        const baseViews = Math.max(1, Math.round(baseline * variability * 0.3));
        if (typeof currentCount === 'number' && currentCount > 0) {
            const scaled = Math.round(currentCount * randFloat(0.15, 0.35));
            return Math.max(1, Math.min(scaled, baseViews));
        }
        return baseViews;
    };

    const toOldDate = (minDays, maxDays) => {
        const date = new Date();
        date.setDate(date.getDate() - rand(minDays, maxDays));
        return date.toISOString();
    };

    const createEmptyMetrics = () => ({
        staleContent: 0,
        needsReview: 0,
        expiredReminder: 0,
        brokenLinks: 0,
        noViews: 0,
        brokenUserWidget: 0
    });

    const normalizeMetricsPayload = (raw) => {
        const normalized = createEmptyMetrics();
        if (!raw || typeof raw !== 'object') return normalized;

        normalized.staleContent = Math.max(0, parseInt(raw.staleContent ?? raw.stale_content ?? 0, 10) || 0);
        normalized.needsReview = Math.max(0, parseInt(raw.needsReview ?? raw.needs_review ?? 0, 10) || 0);
        normalized.expiredReminder = Math.max(0, parseInt(raw.expiredReminder ?? raw.expired_reminder ?? 0, 10) || 0);
        normalized.brokenLinks = Math.max(0, parseInt(raw.brokenLinks ?? raw.broken_links ?? 0, 10) || 0);
        normalized.noViews = Math.max(0, parseInt(raw.noViews ?? raw.no_views ?? 0, 10) || 0);
        normalized.brokenUserWidget = Math.max(0, parseInt(raw.brokenUserWidget ?? raw.broken_user_widget ?? 0, 10) || 0);
        return normalized;
    };

    const buildMetricsFromPages = (items, base = null) => {
        const out = base ? normalizeMetricsPayload(base) : createEmptyMetrics();
        if (!Array.isArray(items)) return out;

        out.staleContent = 0;
        out.needsReview = 0;
        out.expiredReminder = 0;
        out.brokenLinks = 0;
        out.noViews = 0;
        out.brokenUserWidget = 0;

        items.forEach((item) => {
            const issueSet = new Set(Array.isArray(item?.openIssueTypes) ? item.openIssueTypes : []);
            if (issueSet.has('stale_content')) out.staleContent += 1;
            if (issueSet.has('expired_reminder')) out.expiredReminder += 1;
            if (issueSet.has('broken_links')) out.brokenLinks += 1;
            if (issueSet.has('no_views') || item?.viewCount === 0) out.noViews += 1;
            if (issueSet.has('broken_user_widget')) out.brokenUserWidget += 1;
            if (item?.isOutdated) out.needsReview += 1;
        });

        return out;
    };

    const buildFallbackMetrics = (queryValue = '') => {
        const employeeCount = getEmployeeCount();
        const scale = Math.max(1, Math.sqrt(employeeCount / 1000));
        const queryReduction = queryValue && queryValue.trim() ? 0.5 : 1;
        const apply = (n) => Math.max(0, Math.round(n * queryReduction));
        const cap = Math.max(16, Math.round(scale * 28));

        return {
            staleContent: Math.min(cap, apply(rand(1, Math.round(4 * scale)))),
            needsReview: Math.min(cap, apply(rand(1, Math.round(5 * scale)))),
            expiredReminder: Math.min(cap, apply(rand(2, Math.round(7 * scale)))),
            brokenLinks: Math.min(cap, apply(rand(1, Math.round(4 * scale)))),
            noViews: Math.min(cap, apply(rand(5, Math.round(12 * scale)))),
            brokenUserWidget: Math.min(cap, apply(rand(1, Math.round(3 * scale))))
        };
    };

    const storeIssueMetrics = (metrics) => {
        lastIssueMetrics = normalizeMetricsPayload(metrics);
        lastIssueMetricsAt = Date.now();
    };

    const hasFreshIssueMetrics = () =>
        !!lastIssueMetrics && (Date.now() - lastIssueMetricsAt <= METRICS_CACHE_TTL_MS);

    const injectedGovernanceCustomFetch = async function(...args) {
        const [resource, config] = args;
        const requestFullUrl = typeof resource === 'string' ? resource : resource.url;
        let urlPath = '';

        try {
            urlPath = new URL(requestFullUrl, window.location.origin).pathname;
        } catch (e) {
            urlPath = requestFullUrl.startsWith('/') ? requestFullUrl.split('?')[0] : '';
        }

        if (urlPath.includes('/api/pages/issues/metrics')) {
            console.log(INJECTED_LOG_PREFIX, `Intercepting Governance Metrics Request: ${requestFullUrl}`);

            try {
                const originalResponse = await pageContextOriginalFetch.apply(this, args);
                let baseMetrics = createEmptyMetrics();
                try {
                    baseMetrics = normalizeMetricsPayload(await originalResponse.clone().json());
                } catch (_) {}

                const urlObj = new URL(requestFullUrl, window.location.origin);
                const queryValue = urlObj.searchParams.get('query') || '';
                const metrics = hasFreshIssueMetrics()
                    ? normalizeMetricsPayload(lastIssueMetrics)
                    : buildFallbackMetrics(queryValue);

                METRIC_KEYS.forEach((key) => {
                    // Keep any non-issue keys from backend payload untouched.
                    baseMetrics[key] = metrics[key];
                });
                storeIssueMetrics(baseMetrics);

                return new Response(JSON.stringify(baseMetrics), {
                    status: originalResponse.status,
                    statusText: originalResponse.statusText,
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (e) {
                const fallback = buildFallbackMetrics('');
                storeIssueMetrics(fallback);
                return new Response(JSON.stringify(fallback), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        if (urlPath.includes('/api/pages') && requestFullUrl.includes('withIssues=true')) {
            console.log(INJECTED_LOG_PREFIX, `Intercepting Governance Pages Request: ${requestFullUrl}`);

            const originalResponse = await pageContextOriginalFetch.apply(this, args);
            const clonedResponse = originalResponse.clone();
            let payload;
            try {
                payload = await clonedResponse.json();
            } catch (e) {
                return originalResponse;
            }

            if (!payload || !Array.isArray(payload.data)) {
                return originalResponse;
            }

            payload.data = payload.data.map((item) => {
                const nextItem = Object.assign({}, item);

                const originalIssues = Array.isArray(item.openIssueTypes) ? item.openIssueTypes.slice() : [];
                const wantsZeroViews = (originalIssues.includes("no_views") && Math.random() < 0.5) || Math.random() < 0.22;

                if (Math.random() < 0.38) {
                    nextItem.isOutdated = true;
                    nextItem.updatedAt = toOldDate(370, 720);
                    nextItem.openIssueTypes = Array.isArray(nextItem.openIssueTypes) ? nextItem.openIssueTypes.slice() : [];
                    if (!nextItem.openIssueTypes.includes("stale_content")) nextItem.openIssueTypes.push("stale_content");
                }

                nextItem.viewCount = wantsZeroViews ? 0 : calculateViewCount(item.viewCount);

                const allowedIssues = nextItem.viewCount === 0
                    ? ISSUE_TYPES
                    : ISSUE_TYPES.filter((issue) => issue !== "no_views");

                let baseIssues = Array.isArray(nextItem.openIssueTypes) ? nextItem.openIssueTypes.slice() : [];
                baseIssues = baseIssues.filter((issue) => allowedIssues.includes(issue));

                const wantsMultipleIssues = Math.random() < 0.78;
                const targetIssueCount = wantsMultipleIssues ? rand(2, 4) : 1;
                nextItem.openIssueTypes = withUniqueIssues(baseIssues, Math.max(targetIssueCount, 1), allowedIssues);

                if (nextItem.openIssueTypes.length <= 3 && Math.random() < 0.45) {
                    nextItem.openIssueTypes = withUniqueIssues(nextItem.openIssueTypes, rand(3, 4), allowedIssues);
                }

                if (nextItem.viewCount === 0 && !nextItem.openIssueTypes.includes("no_views")) {
                    nextItem.openIssueTypes.push("no_views");
                }
                if (nextItem.viewCount > 0) {
                    nextItem.openIssueTypes = nextItem.openIssueTypes.filter((issue) => issue !== "no_views");
                }

                if (nextItem.updatedAt && nextItem.createdAt && new Date(nextItem.updatedAt) < new Date(nextItem.createdAt)) {
                    nextItem.createdAt = nextItem.updatedAt;
                }
                if (nextItem.publishedAt && nextItem.createdAt && new Date(nextItem.publishedAt) < new Date(nextItem.createdAt)) {
                    nextItem.publishedAt = nextItem.createdAt;
                }

                return nextItem;
            });

            storeIssueMetrics(buildMetricsFromPages(payload.data));

            return new Response(JSON.stringify(payload), {
                status: originalResponse.status,
                statusText: originalResponse.statusText,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return pageContextOriginalFetch.apply(this, args);
    };
    
    window.fetch = injectedGovernanceCustomFetch;
    window.__REPLIFY_GOVERNANCE_FETCH_APPLIED__ = true;
    console.log(INJECTED_LOG_PREFIX, 'Governance fetch override applied.');

    window.__REPLIFY_REVERT_GOVERNANCE_FETCH__ = function() {
        if (window.fetch === injectedGovernanceCustomFetch) {
            window.fetch = pageContextOriginalFetch;
            delete window.__REPLIFY_GOVERNANCE_FETCH_APPLIED__;
            delete window.__REPLIFY_REVERT_GOVERNANCE_FETCH__;
            console.log(INJECTED_LOG_PREFIX, 'Governance fetch restored.');
            return true;
        }
        return false;
    };
})();

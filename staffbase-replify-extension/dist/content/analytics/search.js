// Patches window.fetch on the Search analytics page to generate realistic search term rankings
// and stats, merging real terms from the API response with generated ones.
(function () {
    'use strict';

    const INJECTED_LOG_PREFIX = '[Replify InjectedSearchPatch]:';

    if (window.__REPLIFY_SEARCH_FETCH_APPLIED__) {
        return;
    }

    const pageContextOriginalFetch = window.fetch;
    if (!pageContextOriginalFetch) {
        console.error(INJECTED_LOG_PREFIX, 'CRITICAL: window.fetch is null/undefined in page context!');
        return;
    }

    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randFloat = (min, max) => Math.random() * (max - min) + min;
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
    const getUrlParams = (urlString) => {
        const params = {};
        try {
            new URL(urlString, window.location.origin).searchParams.forEach((value, key) => params[key] = value);
        } catch (e) { /* Ignore */ }
        return params;
    };

    const MASTER_SEARCH_TERMS = [
        // HR & Benefits
        "benefits", "pto", "holiday schedule", "401k", "health insurance", "performance review", "onboarding",
        "paystub", "payroll calendar", "direct deposit", "W2 form", "parental leave", "FMLA", "sick leave",
        "job openings", "internal mobility", "career path", "mentorship program", "dress code", "wellness program",
    
        // IT
        "it support", "password reset", "vpn", "new laptop request", "software",
        "workday", "jira", "confluence", "slack", "zoom", "phishing", "cybersecurity", "monitor request",
    
        // Corporate Comms
        "company news", "all-hands meeting", "ceo update", "org chart", "locations", "employee directory",
        "company events", "DEI", "employee resource group", "ERG", "volunteer opportunities", "mission statement",
    
        // Departmental/Business
        "sales report", "marketing campaign", "product roadmap", "engineering specs", "design system",
        "brand guidelines", "logo assets", "NDA", "contract template", "style guide",
    
        // Compliance/Safety
        "safety manual", "emergency contact", "training", "compliance",
        "expense report", "travel policy", "reimbursement", "office map", "book conference room"
    ];

    function generateTermVariations(term, allowTypo = true) {
        const variations = [{ value: term, isTypo: false }];
        const words = term.split(' ');
        if (words.length > 1) {
            variations.push({ value: words[0], isTypo: false }); // Add the first word
            variations.push({ value: words[words.length - 1], isTypo: false }); // Add the last word
        }
        // Simple typo simulation
        if (allowTypo && term.length > 4) {
            const i = rand(1, term.length - 2);
            variations.push({ value: term.substring(0, i) + term.substring(i + 1), isTypo: true });
        }
        return variations[rand(0, variations.length - 1)];
    }

    function generateSearchMetricsForPeriod(partition, hasMembershipFilter) {
        let baseSearches, baseTerms, baseUsers;
        const employeeCount = getEmployeeCount();

        // Scale user participation to configured employee size (calmer ranges).
        if (partition === 'quarter') {
            baseUsers = Math.max(1, Math.round(employeeCount * randFloat(0.08, 0.16)));
            baseSearches = Math.round(baseUsers * randFloat(1.4, 2.6));
            baseTerms = Math.round(baseUsers * randFloat(0.12, 0.22));
        } else { // month
            baseUsers = Math.max(1, Math.round(employeeCount * randFloat(0.04, 0.10)));
            baseSearches = Math.round(baseUsers * randFloat(1.2, 2.1));
            baseTerms = Math.round(baseUsers * randFloat(0.08, 0.16));
        }

        // Reduce numbers if a user group filter is applied
        if (hasMembershipFilter) {
            const reduction = rand(2, 5) / 10; // 20-50% of baseline when scoped to a membership
            baseSearches = Math.round(baseSearches * reduction);
            baseTerms = Math.round(baseTerms * reduction);
            baseUsers = Math.round(baseUsers * reduction);
        }

        // Ensure logical consistency and keep UI payloads manageable.
        const maxUsers = partition === 'quarter' ? 700 : 300;
        const maxTerms = partition === 'quarter' ? 100 : 45;
        const maxSearches = partition === 'quarter' ? 1400 : 420;
        baseUsers = Math.min(employeeCount, maxUsers, Math.max(1, baseUsers));
        baseSearches = Math.max(baseSearches, baseTerms);
        baseTerms = Math.max(baseTerms, baseUsers);
        baseTerms = Math.min(maxTerms, baseTerms);
        baseSearches = Math.min(maxSearches, Math.max(baseSearches, baseTerms));
        baseUsers = Math.min(baseUsers, baseTerms);

        return {
            currentSearches: baseSearches,
            currentTotalSearchTerms: baseTerms,
            currentTotalUniqUsers: baseUsers,
            // Previous period stats are a fraction of the current ones
            previousSearches: Math.round(baseSearches * (rand(20, 80) / 100)),
            previousTotalSearchTerms: Math.round(baseTerms * (rand(20, 80) / 100)),
            previousTotalUniqUsers: Math.round(baseUsers * (rand(20, 80) / 100)),
        };
    }

    function generateRankingsResponse(metrics, originalRanking = []) {
        let finalTerms = [];
        const desiredTermCount = Math.max(1, Math.min(metrics.currentTotalSearchTerms, 120));
        let remainingSearches = metrics.currentSearches;
        let typoSlotsRemaining = 1;
        const typoTermSet = new Set();

        // 1. Prioritize existing search terms from the original response
        const existingTerms = originalRanking.map(item => item.searchTerm);
        finalTerms.push(...existingTerms);

        // 2. Pad with new/varied terms if necessary
        let attempts = 0;
        const maxAttempts = desiredTermCount * 20;
        while (finalTerms.length < desiredTermCount && attempts < maxAttempts) {
            attempts += 1;
            const variation = generateTermVariations(
                MASTER_SEARCH_TERMS[rand(0, MASTER_SEARCH_TERMS.length - 1)],
                typoSlotsRemaining > 0
            );
            const newTerm = variation.value;
            if (!finalTerms.includes(newTerm)) {
                finalTerms.push(newTerm);
                if (variation.isTypo) {
                    typoSlotsRemaining -= 1;
                    typoTermSet.add(newTerm);
                }
            }
        }
        finalTerms = finalTerms.slice(0, desiredTermCount); // Trim to exact count

        // 3. Distribute search counts among the terms
        const ranking = finalTerms.map((term, index) => {
            // Give more searches to terms at the beginning of the list
            const weight = Math.pow(0.8, index);
            const searchShare = Math.round(remainingSearches * weight * 0.5) + 1;
            const currentCount = Math.min(remainingSearches, searchShare);
            remainingSearches -= currentCount;

            const uniqUsers = typoTermSet.has(term)
                ? 1
                : Math.max(1, Math.min(metrics.currentTotalUniqUsers, Math.round(currentCount / rand(1, 3))));

            return {
                searchTerm: term,
                currentCount: Math.max(1, currentCount),
                previousCount: 0, // For simplicity in generated data
                uniqUsers
            };
        });

        // Distribute any leftover searches to the top item
        if (remainingSearches > 0 && ranking.length > 0) {
            ranking[0].currentCount += remainingSearches;
        }

        // Sort by count descending and return
        return {
            ranking: ranking.sort((a, b) => b.currentCount - a.currentCount),
            total: ranking.length
        };
    }

    const TARGET_API_URLS = {
        STATS: '/api/branch/analytics/search/stats',
        RANKINGS: '/api/branch/analytics/search/rankings'
    };

    const injectedSearchCustomFetch = async function(...args) {
        const resource = args[0];
        const requestFullUrl = typeof resource === 'string' ? resource : resource.url;
        let urlPath = '';
        
        try {
            urlPath = new URL(requestFullUrl, window.location.origin).pathname;
        } catch (e) {
            urlPath = requestFullUrl.startsWith('/') ? requestFullUrl.split('?')[0] : '';
        }

        if (urlPath === TARGET_API_URLS.STATS || urlPath === TARGET_API_URLS.RANKINGS) {
            console.log(INJECTED_LOG_PREFIX, `Intercepting ${urlPath}`);
            const params = getUrlParams(requestFullUrl);
            const { partition = 'month', membershipId } = params;
            
            const periodMetrics = generateSearchMetricsForPeriod(partition, !!membershipId);

            if (urlPath === TARGET_API_URLS.STATS) {
                return new Response(JSON.stringify(periodMetrics), { status: 200, headers: {'Content-Type': 'application/json'} });
            }

            if (urlPath === TARGET_API_URLS.RANKINGS) {
                try {
                    const originalResponse = await pageContextOriginalFetch.apply(this, args);
                    let originalRanking = [];
                    if (originalResponse.ok) {
                        const originalData = await originalResponse.clone().json();
                        if (originalData && originalData.ranking) {
                            originalRanking = originalData.ranking;
                            console.log(INJECTED_LOG_PREFIX, `Found ${originalRanking.length} real search terms to prioritize.`);
                        }
                    }
                    const fakeData = generateRankingsResponse(periodMetrics, originalRanking);
                    return new Response(JSON.stringify(fakeData), { status: 200, headers: {'Content-Type': 'application/json'} });
                } catch (err) {
                    console.warn(INJECTED_LOG_PREFIX, 'Original fetch for rankings failed, generating full mock. Reason:', err.message);
                    const fakeData = generateRankingsResponse(periodMetrics, []);
                    return new Response(JSON.stringify(fakeData), { status: 200, headers: {'Content-Type': 'application/json'} });
                }
            }
        }
        
        return pageContextOriginalFetch.apply(this, args);
    };

    window.fetch = injectedSearchCustomFetch;
    window.__REPLIFY_SEARCH_FETCH_APPLIED__ = true;
    console.log(INJECTED_LOG_PREFIX, 'Search fetch override applied.');

    window.__REPLIFY_REVERT_SEARCH_FETCH__ = function() {
        if (window.fetch === injectedSearchCustomFetch) {
            window.fetch = pageContextOriginalFetch;
            delete window.__REPLIFY_SEARCH_FETCH_APPLIED__;
            delete window.__REPLIFY_REVERT_SEARCH_FETCH__;
            console.log(INJECTED_LOG_PREFIX, 'Search fetch restored.');
            return true;
        }
        return false;
    };
})();

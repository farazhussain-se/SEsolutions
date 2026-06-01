// Patches window.fetch on the News/Posts analytics page. Waits for a REPLIFY_ANALYTICS_CONFIG
// message or DOM attribute before activating — employee count drives all scaled numbers.
// Falls back to fetching historical posts ("time travel") when the selected date range has no data.
(function () {
    const INJECTED_LOG_PREFIX = '[Replify Smart-Proxy]:';
    console.log(INJECTED_LOG_PREFIX, 'Script Loaded (Smart Mode).');

    let latestConfig = null;
    function updateConfig(newConfig) { latestConfig = newConfig; }

    function executePatch() {
        if (window.__REPLIFY_NEWS_FETCH_APPLIED__) return;
        
        const employeeCount = latestConfig ? (parseInt(latestConfig.numberOfEmployees, 10) || 5000) : 5000;
        const originalFetch = window.fetch;

        // --- Helpers ---
        const randFloat = (min, max) => Math.random() * (max - min) + min;
        const safeInt = (n) => Math.max(0, parseInt(n, 10) || 0);
        const normalizeText = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
        const isDeletedTitle = (title) => {
            const normalized = normalizeText(title);
            return normalized === '<deleted item>' || normalized === 'deleted item' || normalized === '[deleted]' || normalized === '(deleted)';
        };
        const getRequestUrl = (resource) => {
            if (typeof resource === 'string') return resource;
            if (resource && typeof resource.url === 'string') return resource.url;   // Request
            if (resource && typeof resource.href === 'string') return resource.href; // URL
            return null;
        };

        const getDayFactor = (dateObj) => {
            const day = dateObj.getUTCDay(); // 0 is Sunday, 6 is Saturday
            if (day === 0 || day === 6) return 0.35; // Weekend dip (35% of normal traffic)
            if (day === 1) return 1.1; // Monday spike
            return 1.0; // Normal weekday
        };

        window.fetch = async function (...args) {
            const resource = args[0];
            const urlString = getRequestUrl(resource);

            if (!urlString || !urlString.includes('/api/branch/analytics/posts')) {
                return originalFetch.apply(this, args);
            }

            const urlObj = new URL(urlString, window.location.origin);
            const path = urlObj.pathname;
            const params = {};
            urlObj.searchParams.forEach((val, key) => params[key] = decodeURIComponent(val));

            const isTimeseries = path.includes('/timeseries');
            const isAggregated = path.includes('/stats/aggregated');
            const isInteractions = path.includes('/stats/interactions');
            const isRankings = path.includes('/rankings');

            if (!isTimeseries && !isAggregated && !isInteractions && !isRankings) {
                return originalFetch.apply(this, args);
            }

            console.groupCollapsed(`${INJECTED_LOG_PREFIX} Patching ${path}`);
            
            try {
                // 2. FETCH REAL DATA (Initial Attempt)
                let response = await originalFetch.apply(this, args);
                if (!response.ok) return response;
                let data = await response.clone().json();

                // When the selected date range has no posts, retry without date filters to surface
                // historical content ("time travel") so the rankings table isn't empty.
                if (isRankings && (!data.ranking || data.ranking.length === 0)) {
                    console.log("No recent posts found. Initiating Time Travel fetch...");
                    try {
                        const fallbackUrl = new URL(urlString, window.location.origin);
                        fallbackUrl.searchParams.delete('since');
                        fallbackUrl.searchParams.delete('until');
                        fallbackUrl.searchParams.delete('timeframe');
                        
                        const fallbackResp = await originalFetch(fallbackUrl.toString(), args[1]);
                        if (fallbackResp.ok) {
                            const fallbackData = await fallbackResp.json();
                            if (fallbackData.ranking && fallbackData.ranking.length > 0) {
                                console.log(`Time Travel successful. Found ${fallbackData.ranking.length} historical posts.`);
                                // Merge the historical data into our empty current response
                                data.ranking = fallbackData.ranking;
                                data.entities = fallbackData.entities; // Crucial: brings in titles/IDs
                                data.createdPosts = fallbackData.createdPosts;
                            }
                        }
                    } catch (e) {
                        console.warn("Time Travel fetch failed", e);
                    }
                }

                // --- A. TIMESERIES ---
                if (isTimeseries) {
                    // Rebuild the full timeseries rather than patching the API's sparse/zero-filled array
                    let since = new Date(params.since);
                    let until = new Date(params.until);
                    // Validations
                    if (isNaN(since.getTime())) since = new Date(Date.now() - 7 * 864e5);
                    if (isNaN(until.getTime())) until = new Date();

                    data.timeseries = [];
                    const loopDate = new Date(since);
                    if (params.groupBy !== 'hour') loopDate.setUTCHours(0,0,0,0);

                    const dailyBaseVisits = employeeCount * 0.45; // ~45% of employees visit daily on average

                    while (loopDate <= until) {
                        // Create Group Key
                        const group = {
                            day: loopDate.getUTCDate(),
                            month: loopDate.getUTCMonth() + 1,
                            year: loopDate.getUTCFullYear()
                        };
                        if (params.groupBy === 'hour') group.hour = loopDate.getUTCHours();

                        // Apply Math
                        const dayFactor = getDayFactor(loopDate);
                        const noise = randFloat(0.85, 1.15); // +/- 15% random noise
                        
                        const visits = safeInt(dailyBaseVisits * dayFactor * noise);
                        const visitors = safeInt(visits * 0.35); // Approx 35% of visits are unique visitors
                        const likes = safeInt(visits * 0.1);
                        const commentLikes = safeInt(likes * 0.12);
                        const postLikes = Math.max(0, likes - commentLikes);

                        data.timeseries.push({
                            group: group,
                            registeredVisitors: visitors,
                            registeredVisits: visits,
                            unregisteredVisitors: safeInt(visitors * 0.05),
                            unregisteredVisits: safeInt(visits * 0.05),
                            newPosts: safeInt(randFloat(0, 3) * dayFactor), // Fewer posts on weekends
                            comments: safeInt(visits * 0.02),
                            likes: likes,
                            postLikes: postLikes,
                            commentLikes: commentLikes,
                            shares: safeInt(visits * 0.005)
                        });

                        // Increment
                        if (params.groupBy === 'hour') loopDate.setUTCHours(loopDate.getUTCHours() + 1);
                        else if (params.groupBy === 'month') loopDate.setUTCMonth(loopDate.getUTCMonth() + 1);
                        else loopDate.setUTCDate(loopDate.getUTCDate() + 1);
                    }
                }

                // --- B. RANKINGS ---
                else if (isRankings && Array.isArray(data.ranking)) {
                    const postsEntity = data?.entities?.posts && typeof data.entities.posts === 'object'
                        ? data.entities.posts
                        : null;

                    if (postsEntity) {
                        for (const [postId, post] of Object.entries(postsEntity)) {
                            if (!post || isDeletedTitle(post.title)) {
                                delete postsEntity[postId];
                            }
                        }
                    }

                    const includesPostIds = data.ranking.some(item => item?.group && typeof item.group === 'object' && typeof item.group.postId === 'string');
                    if (includesPostIds) {
                        const beforeCount = data.ranking.length;
                        data.ranking = data.ranking.filter(item => {
                            const postId = item?.group?.postId;
                            if (!postId) return true;

                            const post = data?.entities?.posts?.[postId];
                            if (!post) return false; // Missing post references render as "<deleted item>" in UI.
                            return !isDeletedTitle(post.title);
                        });

                        const removedCount = beforeCount - data.ranking.length;
                        if (removedCount > 0) {
                            console.log(`Filtered ${removedCount} deleted/missing post ranking rows.`);
                        }
                    }

                    data.ranking.forEach(item => {
                        // Inflate their numbers significantly
                        const baseVisits = safeInt(employeeCount * randFloat(0.3, 0.7)); // 30-70% of employees
                        
                        item.registeredVisits = baseVisits;
                        item.registeredVisitors = safeInt(baseVisits * 0.6); // High unique ratio
                        
                        item.likes = safeInt(baseVisits * randFloat(0.08, 0.15));
                        item.comments = safeInt(item.likes * 0.2);
                        item.shares = safeInt(item.likes * 0.05);
                        
                        // Fix sub-likes
                        item.commentLikes = Math.floor(item.likes * 0.1);
                        item.postLikes = item.likes - item.commentLikes;
                    });
                    
                    // Sort by visits descending
                    data.ranking.sort((a, b) => b.registeredVisits - a.registeredVisits);
                }

                // --- C. AGGREGATED ---
                else if (isAggregated) {
                    data.registeredVisitors = safeInt(employeeCount * 0.92);
                    data.registeredVisits = safeInt(employeeCount * 5.5);
                    data.unregisteredVisitors = safeInt(employeeCount * 0.05);
                    data.unregisteredVisits = safeInt(employeeCount * 0.1);
                    data.newPosts = Math.max(data.newPosts || 0, 12); // floor at 12 so the feed looks active
                    data.publishedPostsUnique = data.newPosts;
                    
                    data.comments = safeInt(data.registeredVisitors * 0.2);
                    data.likes = safeInt(data.registeredVisitors * 0.6);
                    data.commentLikes = safeInt(data.likes * 0.15);
                    data.postLikes = Math.max(0, data.likes - data.commentLikes);
                    data.shares = safeInt(data.registeredVisitors * 0.08);
                    data.interactedPostsUnique = safeInt(data.publishedPostsUnique * randFloat(0.72, 0.9));
                    data.interactionRate = data.registeredVisitors > 0
                        ? Number((data.interactedPostsUnique / data.registeredVisitors).toFixed(4))
                        : 0;
                }

                // --- D. INTERACTIONS ---
                else if (isInteractions) {
                    if (data.publishedPosts < 10) {
                        data.publishedPosts = 25;
                        data.publishedPostsUnique = 25;
                    }
                    data.interactedPostsUnique = Math.floor(data.publishedPostsUnique * 0.85);
                }

                console.log("Patched Data:", data);
                console.groupEnd();
                return new Response(JSON.stringify(data), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });

            } catch (err) {
                console.error(INJECTED_LOG_PREFIX, "Error patching response", err);
                console.groupEnd();
                return originalFetch.apply(this, args);
            }
        };

        window.__REPLIFY_NEWS_FETCH_APPLIED__ = true;
        console.log(INJECTED_LOG_PREFIX, 'Fetch Override Applied (Smart-Proxy Mode).');
    }

    window.addEventListener('message', (e) => {
        if (e.data?.type === 'REPLIFY_ANALYTICS_CONFIG') {
            updateConfig(e.data.config);
            executePatch();
        }
    });

    document.addEventListener('replify-analytics-config-ready', (e) => {
        updateConfig(e.detail);
        executePatch();
    });

    (function() {
        const raw = document.documentElement.getAttribute('data-replify-analytics-config');
        if (raw) {
            try { updateConfig(JSON.parse(raw)); executePatch(); } catch(e){}
        }
    })();
})();

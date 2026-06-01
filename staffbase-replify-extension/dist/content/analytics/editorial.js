// Patches window.fetch on the Editorial Calendar page to populate it with real posts/emails
// rescheduled across a ±30/20 day window, and shifts campaign dates into the current week.
// Data is cached in sessionStorage for the page session to keep schedule stable on re-render.
(function () {
    'use strict';

    const INJECTED_LOG_PREFIX = '[Replify InjectedEditorialPatch]:';

    if (window.__REPLIFY_EDITORIAL_FETCH_APPLIED__) {
        console.warn(INJECTED_LOG_PREFIX, 'Editorial fetch override already applied. Aborting.');
        return;
    }

    const originalFetch = window.fetch;
    if (!originalFetch) {
        console.error(INJECTED_LOG_PREFIX, 'CRITICAL: window.fetch is null/undefined!');
        return;
    }

    const EDITORIAL_SEARCH_URL = '/api/editorial-calendar/entries/search';
    const POSTS_API_URL = '/api/posts?limit=50';
    const EMAILS_API_URL = '/api/email-service/emails/sent?limit=50';
    const CAMPAIGNS_API_URL = '/api/campaigns';
    const CAMPAIGN_PATH_REGEX = /^\/api\/campaigns(\/([a-zA-Z0-9]+))?/;
    const ANALYTICS_API_URL_PREFIX = '/api/branch/analytics/posts/stats';
    const DAY_RANGE_PAST = 30;
    const DAY_RANGE_FUTURE = 20;

    const POST_CACHE_KEY = '__REPLIFY_POSTS_CACHE__';
    const EMAIL_CACHE_KEY = '__REPLIFY_EMAIL_CACHE__';
    const CAMPAIGN_CACHE_KEY = '__REPLIFY_CAMPAIGN_CACHE__';
    const MASTER_SCHEDULE_KEY = '__REPLIFY_MASTER_SCHEDULE_CACHE__';
    const MODIFIED_CAMPAIGN_KEY = '__REPLIFY_MODIFIED_CAMPAIGN_CACHE__';

    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    async function fetchAndCache(key, url, options = {}) {
        const cachedData = sessionStorage.getItem(key);
        if (cachedData) {
            return JSON.parse(cachedData);
        }
        try {
            const response = await originalFetch(url, options);
            if (!response.ok) throw new Error(`Request failed: ${response.statusText}`);
            const data = await response.json();
            sessionStorage.setItem(key, JSON.stringify(data));
            return data;
        } catch (error) {
            console.error(INJECTED_LOG_PREFIX, `Error fetching data for ${key}:`, error);
            return { data: [] };
        }
    }

    function formatItemForCalendar(item) {
        const { type, source, date } = item;
        const isoDate = date.toISOString();
        const now = new Date();

        if (type === 'SB_POST') {
            return {
                branchId: source.branchID, sourceId: source.id, type: "SB_POST", startAt: isoDate, endAt: isoDate,
                properties: {
                    channelId: source.channelID, isManageable: true,
                    publishedAt: isoDate,
                    plannedAt: isoDate,
                    createdAt: source.createdAt || isoDate, updatedAt: source.updatedAt || isoDate
                },
                localization: { en_US: { title: source.contents?.en_US?.title || "Untitled Post" } }
            };
        }

        if (type === 'EMAIL') {
            const isFuture = date > now;
            return {
                branchId: source.branchId, sourceId: source.id, type: "EMAIL", startAt: isoDate, endAt: isoDate,
                properties: {
                    type: isFuture ? "scheduled" : "sent",
                    folderId: source.folderId, campaignId: source.campaignId || null, authorId: source.authorId,
                    replyTo: source.replyTo, thumbnailUrl: source.thumbnailUrl, sender: source.sender,
                    sentAt: isFuture ? null : isoDate,
                    scheduledFor: isFuture ? isoDate : null,
                    updatedBy: source.updatedBy, createdAt: source.createdAt, updatedAt: source.updatedAt
                },
                localization: { title: source.title || source.settings?.en_US?.subject || "Untitled Email" }
            };
        }
        return null;
    }

    function generateSmartSchedule(posts, emails) {
        const masterSchedule = [];
        const today = new Date();
const weekdays = [];
        for (let dayOffset = -DAY_RANGE_PAST; dayOffset <= DAY_RANGE_FUTURE; dayOffset++) {
            const date = new Date();
            date.setDate(today.getDate() + dayOffset);
            const dayOfWeek = date.getDay();
            if (dayOfWeek > 0 && dayOfWeek < 6) { weekdays.push(date); }
        }        
        const slots = [];
        const specificHours = [9, 12, 15];
        weekdays.forEach(day => {
            const dayStr = day.toISOString().split('T')[0];
            specificHours.forEach(hour => {
                const slotDate = new Date(dayStr);
                slotDate.setHours(hour, 0, 0, 0);
                slots.push({ date: slotDate, day: day.getDay(), period: hour, used: false });
            });
        });
        
        const postsToSchedule = [...posts];
        if (weekdays.length > 0) {
            const postsPerWeekday = posts.length / weekdays.length;
            slots.sort((a, b) => {
                const dayPrio = (d) => (d === 1 || d === 3 || d === 5) ? 0 : 1;
                const periodPrio = (p) => (p === 12 ? 0 : p === 9 ? 1 : 2);
                if (dayPrio(a.day) !== dayPrio(b.day)) return dayPrio(a.day) - dayPrio(b.day);
                return periodPrio(a.period) - periodPrio(b.period);
            });
            
            let dailyPostCount = {};
            while(postsToSchedule.length > 0) {
                let placedPost = false;
                for(const slot of slots) {
                    if(postsToSchedule.length === 0) break;
                    if (slot.used) continue;
                    const dayKey = slot.date.toISOString().split('T')[0];
                    dailyPostCount[dayKey] = dailyPostCount[dayKey] || 0;
                    if (postsPerWeekday >= 1 && dailyPostCount[dayKey] >= Math.ceil(postsPerWeekday)) continue;
                    masterSchedule.push({ ...postsToSchedule.pop(), date: slot.date });
                    slot.used = true;
                    dailyPostCount[dayKey]++;
                    placedPost = true;
                }
                if (!placedPost) break;
            }
        }

        const emailsToSchedule = [...emails];
        const remainingSlots = slots.filter(s => !s.used);
        for (let i = remainingSlots.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [remainingSlots[i], remainingSlots[j]] = [remainingSlots[j], remainingSlots[i]];
        }
        while (emailsToSchedule.length > 0 && remainingSlots.length > 0) {
            masterSchedule.push({ ...emailsToSchedule.pop(), date: remainingSlots.pop().date });
        }
        return masterSchedule;
    }
    
async function initializeAllData() {
        const cachedSchedule = sessionStorage.getItem(MASTER_SCHEDULE_KEY);
        if (!cachedSchedule) {
            const [postsData, emailsData] = await Promise.all([
                fetchAndCache(POST_CACHE_KEY, POSTS_API_URL),
                fetchAndCache(EMAIL_CACHE_KEY, EMAILS_API_URL, { headers: { 'accept': 'application/vnd.staffbase.emails.contents.v2+json' }})
            ]);
            const posts = (postsData.data || []).filter(item => !item.draftId).map(item => ({ type: 'SB_POST', source: item }));
            const emails = (emailsData.data || []).map(item => ({ type: 'EMAIL', source: item }));
            const masterSchedule = generateSmartSchedule(posts, emails);
            sessionStorage.setItem(MASTER_SCHEDULE_KEY, JSON.stringify(masterSchedule));
        }

        const cachedCampaigns = sessionStorage.getItem(MODIFIED_CAMPAIGN_KEY);
        if (!cachedCampaigns) {
            const campaignData = await fetchAndCache(CAMPAIGN_CACHE_KEY, CAMPAIGNS_API_URL);
            const today = new Date();
            const allCampaigns = campaignData.data || [];
            
            // Filter active campaigns and sort them for consistent modification
            const activeCampaigns = allCampaigns.filter(c => new Date(c.startAt) <= today && new Date(c.endAt) >= today);
            const nonActiveCampaigns = allCampaigns.filter(c => !activeCampaigns.includes(c));
            
            let modifiedCampaigns = [...nonActiveCampaigns];

            if (activeCampaigns.length > 0) {
                
                const currentDayOfWeek = today.getDay();
                const monday = new Date(today);
                // Adjust to the previous Monday, handling Sunday (0) correctly
                monday.setDate(today.getDate() - (currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1));
                monday.setHours(0, 0, 0, 0);

                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                sunday.setHours(23, 59, 59, 999);
                
                // Shuffle campaigns to randomize which ones are modified
                const shuffledActive = [...activeCampaigns].sort(() => 0.5 - Math.random());
                
                // Split campaigns into two groups: one for start-of-week and one for end-of-week
                const middleIndex = Math.ceil(shuffledActive.length / 2);
                const startOfWeekCampaigns = shuffledActive.slice(0, middleIndex);
                const endOfWeekCampaigns = shuffledActive.slice(middleIndex);

                // Modify campaigns to start this week and have a long duration
                const modifiedStartThisWeek = startOfWeekCampaigns.map(campaign => {
                    const randomDay = rand(0, 6); // 0-6 for Sunday-Saturday
                    const newStart = new Date(monday);
                    newStart.setDate(monday.getDate() + randomDay);
                    newStart.setHours(rand(9, 17), rand(0, 59), 0, 0);

                    const durationDays = rand(21, 90); // Long duration
                    const newEnd = new Date(newStart);
                    newEnd.setDate(newStart.getDate() + durationDays);
                    
                    return { ...campaign, startAt: newStart.toISOString(), endAt: newEnd.toISOString() };
                });

                // Modify campaigns to end this week and have a long duration
                const modifiedEndThisWeek = endOfWeekCampaigns.map(campaign => {
                    const randomDay = rand(0, 6); // 0-6 for Sunday-Saturday
                    const newEnd = new Date(monday);
                    newEnd.setDate(monday.getDate() + randomDay);
                    newEnd.setHours(rand(9, 17), rand(0, 59), 0, 0);
                    
                    const durationDays = rand(21, 90); // Long duration
                    const newStart = new Date(newEnd);
                    newStart.setDate(newEnd.getDate() - durationDays);
                    
                    return { ...campaign, startAt: newStart.toISOString(), endAt: newEnd.toISOString() };
                });

                modifiedCampaigns.push(...modifiedStartThisWeek, ...modifiedEndThisWeek);
            } else {
                modifiedCampaigns.push(...activeCampaigns);
            }
            
            sessionStorage.setItem(MODIFIED_CAMPAIGN_KEY, JSON.stringify({ data: modifiedCampaigns }));
        }
    }

    const dataInitializationPromise = initializeAllData();

    const injectedCustomFetch = async function(...args) {
        const originalRequest = new Request(...args);
        const url = new URL(originalRequest.url);
        const urlPath = url.pathname;

        const campaignMatch = urlPath.match(CAMPAIGN_PATH_REGEX);
        if (campaignMatch) {
            console.log(INJECTED_LOG_PREFIX, `🎯 Intercepting Campaign request: ${originalRequest.url}`);
            await dataInitializationPromise;
            const modifiedCampaignsData = JSON.parse(sessionStorage.getItem(MODIFIED_CAMPAIGN_KEY));
            const campaignId = campaignMatch[2];

            if (campaignId) { // Request for a single campaign
                const foundCampaign = modifiedCampaignsData.data.find(c => c.id === campaignId);
                if (foundCampaign) {
                    return new Response(JSON.stringify(foundCampaign), { status: 200, headers: { 'Content-Type': 'application/json' } });
                }
            } else { // Request for a list of campaigns
                 return new Response(JSON.stringify({
                    cursor: null, limit: 100, total: modifiedCampaignsData.data.length, data: modifiedCampaignsData.data
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
        }
        
        if (urlPath === EDITORIAL_SEARCH_URL && originalRequest.method.toUpperCase() === 'POST') {
            try {
                const bodyAsText = await originalRequest.clone().text();
                const body = JSON.parse(bodyAsText);
                const fetchOptions = { method: originalRequest.method, headers: originalRequest.headers, body: bodyAsText, mode: originalRequest.mode, credentials: originalRequest.credentials, cache: originalRequest.cache, redirect: originalRequest.redirect, referrer: originalRequest.referrer };

                if (body.timeRange && body.timeRange.includes('startAt eq null')) {
                    console.log(INJECTED_LOG_PREFIX, '➡️ Passing through request for unscheduled items.');
                    return originalFetch(originalRequest.url, fetchOptions);
                }

                const serverFetchPromise = originalFetch(originalRequest.url, fetchOptions);
                const timeRangeString = body.timeRange;
                const dateMatches = timeRangeString.match(/"(.*?)"/g);
                if (!dateMatches || dateMatches.length < 2) {
                    return serverFetchPromise;
                }

                const startDate = new Date(dateMatches[0].replace(/"/g, ''));
                const endDate = new Date(dateMatches[1].replace(/"/g, ''));

                await dataInitializationPromise;
                const masterSchedule = JSON.parse(sessionStorage.getItem(MASTER_SCHEDULE_KEY)).map(item => ({...item, date: new Date(item.date)}));
                const originalResponse = await serverFetchPromise;

                if (!originalResponse.ok) throw new Error(`Original server fetch failed: ${originalResponse.statusText}`);
                
                const serverData = await originalResponse.json();
                console.log(INJECTED_LOG_PREFIX, `👍 Found ${serverData.total} existing item(s) on the server.`);

                const finalData = [...serverData.data];
                const occupiedTimes = new Set(serverData.data.map(item => new Date(item.startAt).getTime()));
                const existingSourceIds = new Set(serverData.data.map(item => item.sourceId));
                const generatedItemsInView = masterSchedule.filter(item => item.date >= startDate && item.date <= endDate);

                for (const genItem of generatedItemsInView) {
                    const itemTime = genItem.date.getTime();
                    const hasIdConflict = existingSourceIds.has(genItem.source.id);
                    const hasTimeConflict = [...occupiedTimes].some(t => Math.abs(t - itemTime) < 300000);

                    if (!hasIdConflict && !hasTimeConflict) {
                        const formattedItem = formatItemForCalendar(genItem);
                        if (formattedItem) {
                            finalData.push(formattedItem);
                            occupiedTimes.add(itemTime); 
                        }
                    }
                }
                
                const finalResponse = { cursor: null, total: finalData.length, data: finalData };
                return new Response(JSON.stringify(finalResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });

            } catch (err) {
                console.error(INJECTED_LOG_PREFIX, '❌ Error processing calendar request:', err);
                return new Response(JSON.stringify({ cursor: null, total: 0, data: [] }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
        }

        return originalFetch(originalRequest);
    };

    window.fetch = injectedCustomFetch;
    window.__REPLIFY_EDITORIAL_FETCH_APPLIED__ = true;
    console.log(INJECTED_LOG_PREFIX, '🟢 Live Editorial Calendar & Analytics fetch override applied.');

    window.__REPLIFY_REVERT_EDITORIAL_FETCH__ = function() {
        if (window.fetch === injectedCustomFetch) {
            window.fetch = originalFetch;
            delete window.__REPLIFY_EDITORIAL_FETCH_APPLIED__;
            delete window.__REPLIFY_REVERT_EDITORIAL_FETCH__;
            sessionStorage.removeItem(POST_CACHE_KEY);
            sessionStorage.removeItem(EMAIL_CACHE_KEY);
            sessionStorage.removeItem(CAMPAIGN_CACHE_KEY);
            sessionStorage.removeItem(MASTER_SCHEDULE_KEY);
            sessionStorage.removeItem(MODIFIED_CAMPAIGN_KEY);
            console.log(INJECTED_LOG_PREFIX, '🔴 Fetch overrides restored and all caches cleared.');
            return true;
        }
        return false;
    };
})();
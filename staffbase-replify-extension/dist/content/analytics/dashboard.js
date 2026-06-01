// Patches window.fetch on the Home dashboard to inject fake posts, comments, user counts,
// and post reach data. Also corrects the Reach tab via DOM mutation if it shows an error or
// empty list — tries live posts first and falls back to generated ones.
(function () {
    "use strict";

    const INJECTED_LOG_PREFIX = "[Replify InjectedDashboardPatch]:";
  
    if (window.__REPLIFY_DASHBOARD_FETCH_APPLIED__) {
      return;
    }
  
    const pageContextOriginalFetch = window.fetch;
    if (!pageContextOriginalFetch) {
      console.error(
        INJECTED_LOG_PREFIX,
        "CRITICAL: window.fetch is null/undefined in page context!"
      );
      return;
    }
  
    const dashboardCache = {
      posts: null,
      comments: null,
      users: null,
      isFetchingPosts: false,
      hasFetchedPosts: false,
    };
  
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  
    function getUrlParams(urlString) {
      const params = {};
      try {
        const url = new URL(urlString, window.location.origin);
        url.searchParams.forEach((value, key) => (params[key] = value));
      } catch (e) {
        /* Ignore */
      }
      return params;
    }

    async function fetchPageRankingsFromOrigin(originalUrl) {
      try {
        const orig = new URL(originalUrl, window.location.origin);
        const fallbackUrl = `${orig.origin}/api/branch/analytics/contents/rankings?filter=contentType%20eq%20%22page%22`;
        console.log(
          INJECTED_LOG_PREFIX,
          "Fetching live page rankings fallback from current domain:",
          fallbackUrl
        );
        const resp = await pageContextOriginalFetch(fallbackUrl, {
          credentials: "same-origin",
        });
        if (!resp.ok) {
          console.warn(
            INJECTED_LOG_PREFIX,
            "Fallback page rankings fetch failed",
            resp.status
          );
          return null;
        }
        const data = await resp.json();
        console.log(
          INJECTED_LOG_PREFIX,
          "Fallback page rankings response:",
          { rankingCount: data?.ranking?.length || 0, entitiesKeys: Object.keys(data?.entities?.contents || {}) }
        );
        return data;
      } catch (e) {
        console.warn(INJECTED_LOG_PREFIX, "Fallback page rankings fetch error:", e.message);
        return null;
      }
    }
  
    function shuffleArray(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
    }

    function generateFakeUsers() {
      if (dashboardCache.users) return dashboardCache.users;
      dashboardCache.users = [
        {
          id: "user_1",
          firstName: "Alex",
          lastName: "Chen",
          position: "Lead Developer",
          department: "Technology",
          avatar: "https://i.pravatar.cc/150?u=user_1",
        },
        {
          id: "user_2",
          firstName: "Brenda",
          lastName: "Smith",
          position: "Marketing Manager",
          department: "Marketing",
          avatar: "https://i.pravatar.cc/150?u=user_2",
        },
        {
          id: "user_3",
          firstName: "Charles",
          lastName: "Davis",
          position: "HR Business Partner",
          department: "Human Resources",
          avatar: "https://i.pravatar.cc/150?u=user_3",
        },
        {
          id: "user_4",
          firstName: "Diana",
          lastName: "Miller",
          position: "Sales Director",
          department: "Sales",
          avatar: "https://i.pravatar.cc/150?u=user_4",
        },
      ];
      return dashboardCache.users;
    }
  
    function generateFakePosts(count = 5) {
      if (dashboardCache.posts) return dashboardCache.posts;
      const users = generateFakeUsers();
      const posts = [];
      const titles = [
        "Q3 All-Hands Meeting Review",
        "New Employee Expense Policy Deployed",
        "Charity Drive Exceeds Goals!",
        "Weekend System Maintenance: Reminder",
        "Welcome New Summer Interns!",
      ];
      for (let i = 0; i < count; i++) {
        const author = users[rand(0, users.length - 1)];
        const postDate = new Date(
          Date.now() - i * 48 * 3600 * 1000 - rand(0, 24 * 3600 * 1000)
        );
        const postId = `gen_post_${i}_${Date.now()}`;
        const channelId = `gen_channel_${i}`;
  
        posts.push({
          id: postId,
          branchID: "gen_branch_1",
          channelID: channelId,
          authorID: author.id,
          contents: {
            en_US: {
              title: titles[i] || `Generated Post Title ${i + 1}`,
              teaser: `This is a short teaser for our latest news article about "${
                titles[i]
              }".`,
              content: `<p>This is the full content for "<strong>${
                titles[i]
              }</strong>".</p><p>Here you would find more details, paragraphs, and maybe some lists or other rich text elements to make the post more engaging for all employees.</p>`,
              image: {
                wide_first: {
                  url: `https://picsum.photos/seed/${postId}/800/450`,
                },
              },
            },
          },
          author: {
            ...author,
            entityType: "user",
            avatar: { thumb: { url: author.avatar } },
          },
          channel: {
            id: channelId,
            pluginID: "news",
            config: { localization: { en_US: { title: "Company News" } } },
          },
          published: postDate.toISOString(),
          updated: new Date(
            postDate.getTime() + rand(1000, 60000)
          ).toISOString(),
          entityType: "post",
          highlighted: i === 0,
          commentingAllowed: true,
          likingAllowed: true,
          sharingAllowed: true,
          acknowledgingEnabled: false,
          links: {
            detail_view: { href: `/openlink/content/news/article/${postId}` },
          },
          rights: ["DELETE", "MODIFY"],
        });
      }
      dashboardCache.posts = posts;
      return posts;
    }
  
    function generateFakeComments(count = 5) {
      if (dashboardCache.comments) return dashboardCache.comments;
      const users = generateFakeUsers();
      const posts = dashboardCache.posts || generateFakePosts();
      if (!posts || posts.length === 0) return [];
      const comments = [];
      const commentTexts = [
        "Thanks for sharing this!",
        "This is great news!",
        "Finally! Been waiting for this.",
        "Awesome work, team!",
        "Who should I contact for more details?",
      ];
      for (let i = 0; i < count; i++) {
        const author = users[rand(0, users.length - 1)];
        const post = posts[rand(0, posts.length - 1)];
        const createdDate = new Date(
          Date.now() - rand(3600 * 1000, 7 * 24 * 3600 * 1000)
        ); // 1 hour to 7 days ago
        comments.push({
          id: `gen_comment_${i}_${Date.now()}`,
          installationID: post.channelID,
          parentID: post.id,
          parentType: "post",
          author, // Embed full author object
          authorID: author.id,
          published: true,
          status: "PUBLISHED",
          text: `<p>${commentTexts[i]}</p>`,
          reportsCount: 0,
          rootID: post.id,
          entityType: "comment",
          created: createdDate.toISOString(),
          updated: new Date(
            createdDate.getTime() + rand(1000, 60000)
          ).toISOString(),
          links: {},
          rights: ["DELETE", "MODIFY"],
        });
      }
      dashboardCache.comments = comments.sort(
        (a, b) => new Date(b.created) - new Date(a.created)
      );
      return dashboardCache.comments;
    }
  
    function generatePageRankings() {
      const entities = {
        contents: {
          page_1: { id: "page_1", title: "Home", link: "/content/page/page_1" },
          page_2: {
            id: "page_2",
            title: "Directory",
            link: "/content/page/page_2",
          },
        },
      };

      const ranking = [
        {
          group: { contentId: "page_1", contentType: "page" },
          registeredVisitors: rand(50, 150),
          registeredVisits: rand(150, 500),
          unregisteredVisitors: 0,
          unregisteredVisits: 0,
        },
        {
          group: { contentId: "page_2", contentType: "page" },
          registeredVisitors: rand(40, 100),
          registeredVisits: rand(100, 300),
          unregisteredVisitors: 0,
          unregisteredVisits: 0,
        },
      ];

      // If we end up with 2 or fewer items, pad with fallback real-looking pages
      if (ranking.length <= 2) {
        const fallbackPages = [
          {
            id: "68e0898fa7a5ee7ddb9ea9c9",
            title: "Home",
            link: "/content/page/68e0898fa7a5ee7ddb9ea9ca",
          },
          {
            id: "68fa4196837a3628330d7ad8",
            title: "Office / Plant",
            link: "/content/page/68fa4196837a3628330d7ad9",
          },
          {
            id: "68e08809d09b383e577dfe32",
            title: "News",
            link: "/content/page/68e08809d09b383e577dfe33",
          },
          {
            id: "68e08bce128d6a0ee98125a6",
            title: "Home Social",
            link: "/content/page/68e08bce128d6a0ee98125a8",
          },
          {
            id: "68e088ab128d6a0ee9810899",
            title: "My HR",
            link: "/content/page/68e088ab128d6a0ee981089a",
          },
        ];

        fallbackPages.forEach((page) => {
          if (!entities.contents[page.id]) {
            entities.contents[page.id] = {
              id: page.id,
              title: page.title,
              link: page.link,
            };
          }
          const alreadyRanked = ranking.find(
            (r) => r.group && r.group.contentId === page.id
          );
          if (!alreadyRanked) {
            ranking.push({
              group: { contentId: page.id, contentType: "page" },
              registeredVisitors: rand(1, 20),
              registeredVisits: rand(2, 40),
              unregisteredVisitors: 0,
              unregisteredVisits: 0,
            });
          }
        });
      }

      return {
        entities,
        ranking: ranking.slice(0, 5),
        contentType: { page: { id: "page", icon: "n", title: "Pages" } },
      };
    }
    function generatePostRankings() {
      const p =
        dashboardCache.posts || generateFakePosts();
      if (!p || p.length === 0)
        return { entities: { contents: {} }, ranking: [] };
      const e = {};
      p.forEach((t) => {
        e[t.id] = {
          id: t.id,
          title: t.contents.en_US.title,
          link: `/content/news/article/${t.id}`,
        };
      });
      const n = p
        .map((t) => ({
          group: { contentId: t.id, contentType: "post" },
          registeredVisitors: rand(5, 75),
          registeredVisits: rand(10, 200),
          unregisteredVisitors: 0,
          unregisteredVisits: 0,
        }))
        .sort((t, o) => o.registeredVisitors - t.registeredVisitors)
        .slice(0, 5);
      return {
        entities: { contents: e },
        ranking: n,
        contentType: { post: { id: "post", icon: "n", title: "Posts" } },
      };
    }
    function generateCustomPostRankings() {
      const p = dashboardCache.posts || generateFakePosts();
      if (!p || p.length === 0) return { ranking: [] };
      const r = p.slice(0, 4).map((t) => {
        const potentialVisitors = rand(250, 300);
        // To get a distribution around 75, we average two random numbers in the desired range.
        const percentage = Math.round((rand(50, 95) + rand(55, 98)) / 2);
        const visitors = Math.round(potentialVisitors * (percentage / 100));
        return { id: t.id, visitors, potentialVisitors };
      });
      return { ranking: r };
    }
  
    function generateFakePostStats(postId) {
      const commentsForPost = (dashboardCache.comments || []).filter(
        (c) => c.parentID === postId
      ).length;
      const visitors = rand(25, 150);
      const visits = visitors + rand(20, 100);
  
      return {
        registeredVisitors: visitors,
        registeredVisits: visits,
        newPosts: 1,
        comments: commentsForPost > 0 ? commentsForPost : rand(0, 15),
        likes: rand(10, 80),
        shares: 0,
      };
    }
  
    async function fetchAndCachePosts() {
      if (dashboardCache.isFetchingPosts || dashboardCache.hasFetchedPosts) {
        return;
      }
      dashboardCache.isFetchingPosts = true;
      console.log(INJECTED_LOG_PREFIX, "Fetching live posts for dashboard...");
  
      try {
        const response = await pageContextOriginalFetch("/api/posts?limit=10");
        if (!response.ok) throw new Error(`API response not OK: ${response.status}`);
        
        const data = await response.json();
        if (data && data.data && data.data.length > 0) {
          console.log(INJECTED_LOG_PREFIX, `Successfully fetched ${data.data.length} live posts.`);
          shuffleArray(data.data);
          dashboardCache.posts = data.data.slice(0, 4); // Pick 4 random posts
        } else {
          throw new Error("No posts in API response, using fallback.");
        }
      } catch (error) {
        console.warn(INJECTED_LOG_PREFIX, `Could not fetch live posts (${error.message}). Falling back to generated posts.`);
        dashboardCache.posts = generateFakePosts(4); // Use fallback
      } finally {
        dashboardCache.isFetchingPosts = false;
        dashboardCache.hasFetchedPosts = true;
        // After fetching, try to populate in case the DOM is already ready
        populateEmptyReachTab();
      }
    }
  
    async function populateEmptyReachTab() {
      // Find the "Reach" tab button by its text content for robustness
      const reachTabButton = Array.from(document.querySelectorAll('button[role="tab"]')).find(
        (btn) => btn.textContent.trim() === "Reach"
      );
  
      // 1. Only run if the Reach tab is the currently selected one.
      if (!reachTabButton || reachTabButton.getAttribute("aria-selected") !== "true") {
        return;
      }
  
      // Find the associated panel using the aria-controls attribute
      const panelId = reachTabButton.getAttribute("aria-controls");
      if (!panelId) return;
      const reachTabPanel = document.getElementById(panelId);
      if (!reachTabPanel) return;
      if (!dashboardCache.posts) {
        return;
      }
  
      // --- Assertive DOM check ---
      // Check for all possible states we need to correct:
      // 1. The "Something went wrong" error state.
      // 2. An overpopulated list (more than 4 items).
      // 3. An empty list that needs content.
      const isErrorState = !!reachTabPanel.querySelector('.ds-empty-state');
      const postList = reachTabPanel.querySelector("ul");
      const isListEmpty = postList ? postList.children.length === 0 : false;
      const isListOverpopulated = postList ? postList.children.length > 4 : false;
  
      // If none of our conditions for overwriting are met, do nothing.
      if (!isErrorState && !isListEmpty && !isListOverpopulated) {
        return;
      }
  
      console.log(
        INJECTED_LOG_PREFIX,
        `Correcting Reach tab state (Error: ${isErrorState}, Empty: ${isListEmpty}, Overpopulated: ${isListOverpopulated}). Populating...`
      );
  
      const posts = dashboardCache.posts;
      const rankings = generateCustomPostRankings().ranking;
  
      // Combine post details with their ranking stats
      const combinedData = posts.map((post, index) => {
          // Use real post data, but generate fake ranking stats for it
          let rank = rankings[index];
          if (!rank) {
            const potentialVisitors = rand(250, 300);
            const percentage = Math.round((rand(50, 95) + rand(55, 98)) / 2);
            const visitors = Math.round(potentialVisitors * (percentage / 100));
            rank = { visitors, potentialVisitors };
          }
          if (!post) return null;
          return {
            ...post,
            ...rank,
            percentage: Math.round((rank.visitors / rank.potentialVisitors) * 100),
          };
        })
        .filter(Boolean) // Filter out any nulls
        .slice(0, 4); // IMPORTANT: Ensure we only ever take 4 items.
  
      let newContent = "";
      combinedData.forEach((item) => {
        const imageUrl =
          item.contents?.en_US?.image?.thumb?.url ||
          item.contents?.en_US?.image?.wide_first?.url;
  
        const imageElement = imageUrl
          ? `<div class="me-12 size-[48px] rounded-6 bg-cover bg-center bg-no-repeat" style="background-image: url('${imageUrl}');"></div>`
          : `<div class="me-12 size-[48px] rounded-6 bg-neutral-base p-12 text-icon-neutral-weak">
               <svg aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" class="ds-icon ds-icon-plugin-news size-[24px]">
                 <path d="M23.121,7.879A3,3,0,0,1,24,10V20a3.5,3.5,0,0,1-3.5,3.5H3.5A3.5,3.5,0,0,1,0,20V2.5a2,2,0,0,1,2-2H17a2,2,0,0,1,2,2V7h2A3,3,0,0,1,23.121,7.879Zm-1.56,13.182A1.5,1.5,0,0,0,22,20V10a1,1,0,0,0-1-1H19.5a.5.5,0,0,0-.5.5V20a1.5,1.5,0,0,0,2.561,1.061ZM5.5,4.5h3.25A1.25,1.25,0,0,1,10,5.75V10.5a1.25,1.25,0,0,1-1.25,1.25H5.5a1.25,1.25,0,0,1-1.25-1.25V5.75A1.25,1.25,0,0,1,5.5,4.5Zm7.249,1.547h2a.751.751,0,0,1,.75.75v.5a.751.751,0,0,1-.75.75h-2a.764.764,0,0,1-.287-.056.755.755,0,0,1-.243-.162A.753.753,0,0,1,12,7.3V6.8a.747.747,0,0,1,.057-.288.738.738,0,0,1,.162-.244.76.76,0,0,1,.244-.164A.747.747,0,0,1,12.751,6.047Zm2,4h-2a.747.747,0,0,0-.288.057.76.76,0,0,0-.244.164.738.738,0,0,0-.162.244A.747.747,0,0,0,12,10.8v.5a.749.749,0,0,0,.751.747h2a.751.751,0,0,0,.75-.75v-.5a.751.751,0,0,0-.75-.75Zm-10,4h10a.751.751,0,0,1,.75.75v.5a.751.751,0,0,1-.75.75h-10A.749.749,0,0,1,4,15.3v-.5a.747.747,0,0,1,.057-.288.738.738,0,0,1,.162-.244.76.76,0,0,1,.244-.164A.747.747,0,0,1,4.751,14.047Zm7.5,4H4.75a.741.741,0,0,0-.531.221.757.757,0,0,0-.163.244A.765.765,0,0,0,4,18.8v.5a.748.748,0,0,0,.75.747h7.5A.751.751,0,0,0,13,19.3v-.5a.751.751,0,0,0-.75-.75Z" fill-rule="evenodd"></path>
               </svg>
             </div>`;
  
        const postUrl = item.links?.detail_view?.href || "#";
        const title = item.contents?.en_US?.title || "Untitled Post";
  
        newContent += `
            <li class="flex min-w-0 items-center leading-18">
              <section class="flex min-w-0 flex-1 items-center">
                ${imageElement}
                <div class="flex min-w-0 flex-1 flex-col">
                  <header class="mb-4 truncate text-body-sm text-neutral-strong">
                    <span tabindex="0" data-state="closed">
                      <a class="font-medium text-neutral-strong hover:underline" href="${postUrl}" target="_blank" rel="noreferrer">${title}</a>
                    </span>
                  </header>
                  <ul class="flex text-12 leading-16 text-neutral-medium">
                    <li class="ms-12 flex items-center first-of-type:m-0 [&amp;_svg]:text-icon-neutral-medium">
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" class="ds-icon ds-icon-user-group me-4 shrink-0"><path d="M13.75,7.75a6.194,6.194,0,0,1-.663,2.789.5.5,0,0,0,.1.579A4.7,4.7,0,0,0,16.5,12.5a4.75,4.75,0,0,0,0-9.5,4.7,4.7,0,0,0-3.318,1.382.5.5,0,0,0-.1.579A6.194,6.194,0,0,1,13.75,7.75Z"></path><path d="M16.5,13a7.4,7.4,0,0,0-2.377.393.5.5,0,0,0-.2.823A8.957,8.957,0,0,1,16.5,20.5a.5.5,0,0,0,.5.5h6.5a.5.5,0,0,0,.5-.5A7.508,7.508,0,0,0,16.5,13Z"></path><circle cx="7.5" cy="7.75" r="4.75"></circle><path d="M15,20.5a7.5,7.5,0,0,0-15,0,.5.5,0,0,0,.5.5h14A.5.5,0,0,0,15,20.5Z"></path></svg>
                      <span>${item.visitors} Visitors</span>
                    </li>
                    <li class="ms-12 flex items-center first-of-type:m-0 [&amp;_svg]:text-icon-neutral-medium">
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" class="ds-icon ds-icon-user-group me-4 shrink-0"><path d="M13.75,7.75a6.194,6.194,0,0,1-.663,2.789.5.5,0,0,0,.1.579A4.7,4.7,0,0,0,16.5,12.5a4.75,4.75,0,0,0,0-9.5,4.7,4.7,0,0,0-3.318,1.382.5.5,0,0,0-.1.579A6.194,6.194,0,0,1,13.75,7.75Z"></path><path d="M16.5,13a7.4,7.4,0,0,0-2.377.393.5.5,0,0,0-.2.823A8.957,8.957,0,0,1,16.5,20.5a.5.5,0,0,0,.5.5h6.5a.5.5,0,0,0,.5-.5A7.508,7.508,0,0,0,16.5,13Z"></path><circle cx="7.5" cy="7.75" r="4.75"></circle><path d="M15,20.5a7.5,7.5,0,0,0-15,0,.5.5,0,0,0,.5.5h14A.5.5,0,0,0,15,20.5Z"></path></svg>
                      <span>${item.potentialVisitors} Potential Reach</span>
                    </li>
                  </ul>
                </div>
                <div class="group ms-12 flex flex-col items-center [&amp;_div]:bg-[linear-gradient(to_right,_var(--sb-color-sbBlue-400)_var(--progress),_var(--sb-color-grey-100)_0)]" tabindex="0" data-state="closed" style="--progress: ${item.percentage}%;">
                  <span class="mb-8 text-12 font-medium leading-16 text-[#75777b] group-hover:text-[#0078b8]">${item.percentage}%</span>
                  <div class="h-[8px] w-[80px] overflow-hidden rounded-[2px] group-hover:bg-[linear-gradient(to_right,_var(--sb-color-sbBlue-500)_var(--progress),_var(--sb-color-grey-100)_0)]"></div>
                </div>
              </section>
            </li>
          `;
      });
  
      // If we are correcting an error state, we need to replace the error-state container
      // with a new list. Otherwise, we just update the existing list's content.
      if (isErrorState) {
        const container = reachTabPanel.querySelector('.ds-empty-state').parentElement;
        container.innerHTML = `<ul class="flex w-full flex-col gap-16 self-start text-14 leading-18">${newContent}</ul>`;
      } else if (postList) {
        postList.innerHTML = newContent;
      }
    }
  
     const TARGET_API_URLS = {
       POSTS: "/api/posts",
       COMMENTS: "/api/comments",
       POST_DETAIL: /^\/api\/posts\/(gen_post_[a-zA-Z0-9_]+)$/,
       POST_STATS: /^\/api\/branch\/analytics\/posts\/stats/, // NEW
       USER_STATUS: "/api/branch/analytics/users/status",
       USERS_COUNT_BY_STATUS: /^\/api\/branch\/analytics\/users\/countByStatus/,
       RANKINGS: /^\/api\/branch\/analytics\/contents\/rankings/,
       CUSTOM_POST_RANKINGS: /^\/api\/branch\/analytics\/posts\/rankings\/custom/,
     };
   
     const injectedDashboardCustomFetch = async function (...args) {
       const resource = args[0];
       const requestFullUrl =
         typeof resource === "string" ? resource : resource.url;
       let urlPath = "";
   
       try {
         urlPath = new URL(requestFullUrl, window.location.origin).pathname;
       } catch (e) {
         urlPath = requestFullUrl.startsWith("/")
           ? requestFullUrl.split("?")[0]
           : "";
       }
   
       try {
         const postDetailMatch = urlPath.match(TARGET_API_URLS.POST_DETAIL);
         if (postDetailMatch) {
           const postId = postDetailMatch[1];
           console.log(
             INJECTED_LOG_PREFIX,
             `Intercepting DETAIL for generated post: ${postId}`
           );
           const posts = dashboardCache.posts || generateFakePosts();
           const post = posts.find((p) => p.id === postId);
           if (post) {
             return new Response(JSON.stringify(post), {
               status: 200,
               headers: { "Content-Type": "application/json" },
             });
           }
           return new Response(
             JSON.stringify({
               message: `Generated post ${postId} not found in cache.`,
             }),
             { status: 404, headers: { "Content-Type": "application/json" } }
           );
         }
   
         if (urlPath.endsWith(TARGET_API_URLS.POSTS)) {
           const originalResponse = await pageContextOriginalFetch.apply(
             this,
             args
           );
           if (originalResponse.ok) {
             const data = await originalResponse.clone().json();
             if (data && data.total > 0) {
               const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
               const hasRecentPosts = data.data.some(
                 (post) => new Date(post.published) > sevenDaysAgo
               );
   
               if (!hasRecentPosts) {
                 console.log(
                   INJECTED_LOG_PREFIX,
                   "No recent posts found. Modifying dates of latest posts."
                 );
                 const modifiedPosts = data.data.slice(0, 5);
                 modifiedPosts.forEach((post, i) => {
                   const newDate = new Date(
                     Date.now() - i * 24 * 3600 * 1000 - rand(0, 12 * 3600 * 1000)
                   );
                   post.published = newDate.toISOString();
                   post.created = newDate.toISOString();
                   post.updated = newDate.toISOString();
                 });
                 dashboardCache.posts = modifiedPosts;
                 return new Response(
                   JSON.stringify({
                     ...data,
                     data: modifiedPosts,
                     total: modifiedPosts.length,
                   }),
                   { status: 200, headers: { "Content-Type": "application/json" } }
                 );
               }
               dashboardCache.posts = data.data;
               return originalResponse;
             }
           }
           console.log(
             INJECTED_LOG_PREFIX,
             "No real posts found. Generating fake posts."
           );
           const fakePosts = generateFakePosts();
           return new Response(
             JSON.stringify({
               total: fakePosts.length,
               data: fakePosts,
               links: {},
             }),
             { status: 200, headers: { "Content-Type": "application/json" } }
           );
         }
   
         if (urlPath.endsWith(TARGET_API_URLS.COMMENTS)) {
           const originalResponse = await pageContextOriginalFetch.apply(
             this,
             args
           );
           if (originalResponse.ok) {
             const data = await originalResponse.clone().json();
             if (data && data.total > 0) {
               const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
               const hasRecentComments = data.data.some(
                 (comment) => new Date(comment.created) > sevenDaysAgo
               );
               let commentsToReturn = data.data;
   
               if (!hasRecentComments) {
                 console.log(
                   INJECTED_LOG_PREFIX,
                   "No recent comments found. Modifying dates of latest comments."
                 );
                 commentsToReturn = data.data.slice(0, 5);
                 commentsToReturn.forEach((comment, i) => {
                   const newDate = new Date(
                     Date.now() -
                       rand(3600 * 1000, i * 6 * 3600 * 1000 + 3600 * 1000)
                   );
                   comment.created = newDate.toISOString();
                   comment.updated = newDate.toISOString();
                 });
               }
   
               const users = generateFakeUsers();
               commentsToReturn.forEach((comment) => {
                 comment.author =
                   users.find((u) => u.id.endsWith(comment.authorID.slice(-1))) ||
                   users[0];
               });
   
               dashboardCache.comments = commentsToReturn;
               return new Response(
                 JSON.stringify({
                   ...data,
                   data: commentsToReturn,
                   total: commentsToReturn.length,
                 }),
                 { status: 200, headers: { "Content-Type": "application/json" } }
               );
             }
           }
           console.log(
             INJECTED_LOG_PREFIX,
             "No real comments found. Generating fake comments."
           );
           const fakeComments = generateFakeComments();
           return new Response(
             JSON.stringify({
               total: fakeComments.length,
               data: fakeComments,
               links: {},
             }),
             { status: 200, headers: { "Content-Type": "application/json" } }
           );
         }
   
         // NEW: Intercepts requests for post stats and returns fake data.
         if (TARGET_API_URLS.POST_STATS.test(urlPath)) {
           console.log(INJECTED_LOG_PREFIX, "Intercepting POST STATS");
           const urlParams = getUrlParams(requestFullUrl);
           const filter = decodeURIComponent(urlParams.filter || "");
           const postIdMatch = filter.match(/postId eq "([^"]+)"/);
   
           if (postIdMatch && postIdMatch[1]) {
             const postId = postIdMatch[1];
             const fakeData = generateFakePostStats(postId);
             return new Response(JSON.stringify(fakeData), {
               status: 200,
               headers: { "Content-Type": "application/json" },
             });
           }
         }
   
         if (TARGET_API_URLS.CUSTOM_POST_RANKINGS.test(urlPath)) {
           console.log(INJECTED_LOG_PREFIX, "Intercepting CUSTOM POST RANKINGS");
           const fakeData = generateCustomPostRankings();
           return new Response(JSON.stringify(fakeData), {
             status: 200,
             headers: { "Content-Type": "application/json" },
           });
         }
   
        if (TARGET_API_URLS.RANKINGS.test(urlPath)) {
          const urlParams = getUrlParams(requestFullUrl);
          const filterDecoded = decodeURIComponent(urlParams.filter || "");
          const filterRaw = urlParams.filter || "";
          if (
            filterDecoded.includes('contentType eq "post"') ||
            filterRaw.includes("contentType%20eq%20%22post%22")
          ) {
            const fakeData = generatePostRankings();
            return new Response(JSON.stringify(fakeData), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (
            filterDecoded.includes('contentType eq "page"') ||
            filterRaw.includes("contentType%20eq%20%22page%22")
          ) {
            // 1) Try the original request first
            let originalData = null;
            try {
              const liveResp = await pageContextOriginalFetch.apply(this, args);
              if (liveResp.ok) {
                originalData = await liveResp.clone().json();
              } else {
                console.warn(
                  INJECTED_LOG_PREFIX,
                  "Original page rankings fetch failed",
                  liveResp.status
                );
              }
            } catch (e) {
              console.warn(
                INJECTED_LOG_PREFIX,
                "Original page rankings fetch error:",
                e.message
              );
            }

            const origRankingLen = originalData?.ranking?.length || 0;
            console.log(
              INJECTED_LOG_PREFIX,
              "Intercepting PAGE RANKINGS",
              {
                rankingLength: origRankingLen,
                contentsCount: Object.keys(originalData?.entities?.contents || {}).length,
              }
            );

            // 2) If too few results, fetch a broader list from the same origin (no static data)
            let dataToReturn = originalData;
            if (!originalData || origRankingLen <= 2) {
              const liveFallback = await fetchPageRankingsFromOrigin(requestFullUrl);
              if (liveFallback?.ranking?.length) {
                console.log(
                  INJECTED_LOG_PREFIX,
                  "Using live fallback page rankings from origin",
                  {
                    fallbackRankingCount: liveFallback.ranking.length,
                    fallbackContentsCount: Object.keys(liveFallback.entities?.contents || {}).length,
                  }
                );
                dataToReturn = liveFallback;
              }
              console.warn(
                INJECTED_LOG_PREFIX,
                "Live fallback page rankings unavailable; returning original (possibly sparse) data."
              );
            }

            // 3) Return original data (even if sparse) as last resort
            const safeData =
              dataToReturn || {
                entities: { contents: {}, contentType: { page: { id: "page", icon: "n", title: "Pages" } } },
                ranking: [],
              };

            // Cap to 5 and prune contents to only those IDs
            const cappedRanking = (safeData.ranking || []).slice(0, 5);
            const filteredContents = {};
            cappedRanking.forEach((r) => {
              const id = r?.group?.contentId;
              if (id && safeData.entities?.contents?.[id]) {
                filteredContents[id] = safeData.entities.contents[id];
              }
            });
            if (safeData.entities) {
              safeData.entities.contents = filteredContents;
            }
            safeData.ranking = cappedRanking;

            return new Response(JSON.stringify(safeData), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
   
         if (urlPath.endsWith(TARGET_API_URLS.USER_STATUS)) {
           return new Response(
             JSON.stringify({ activated: rand(240, 260), pending: rand(1, 5) }),
             { status: 200, headers: { "Content-Type": "application/json" } }
           );
         }
   
         if (TARGET_API_URLS.USERS_COUNT_BY_STATUS.test(urlPath)) {
           return new Response(JSON.stringify({ count: rand(2, 10) }), {
             status: 200,
             headers: { "Content-Type": "application/json" },
           });
         }
       } catch (err) {
         console.warn(
           INJECTED_LOG_PREFIX,
           "Could not intercept, falling back. Reason:",
           err.message
         );
       }
   
       return pageContextOriginalFetch.apply(this, args);
     };
     
     const observer = new MutationObserver((mutationsList, obs) => {
       if (dashboardCache.hasFetchedPosts) {
         populateEmptyReachTab();
       }
     });
     
     observer.observe(document.body, {
       childList: true,
       subtree: true,
     });

    fetchAndCachePosts();
  
    window.fetch = injectedDashboardCustomFetch;
    window.__REPLIFY_DASHBOARD_FETCH_APPLIED__ = true;
    console.log(INJECTED_LOG_PREFIX, "Dashboard fetch override applied.");
  
    window.__REPLIFY_REVERT_DASHBOARD_FETCH__ = function () {
      if (window.fetch === injectedDashboardCustomFetch) {
        window.fetch = pageContextOriginalFetch;
        delete window.__REPLIFY_DASHBOARD_FETCH_APPLIED__;
        delete window.__REPLIFY_REVERT_DASHBOARD_FETCH__;
        console.log(INJECTED_LOG_PREFIX, "Dashboard fetch restored.");
        return true;
      }
      return false;
    };
  })();

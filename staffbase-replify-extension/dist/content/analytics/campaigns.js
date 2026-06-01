// Patches window.fetch on the Campaigns analytics page to inject realistic mock engagement,
// visibility, alignment, and sentiment data. Also renders a synthetic alignment chart when the
// page shows the "publish first survey" empty state.
(function () {
  const INJECTED_LOG_PREFIX = "[Replify InjectedCampaignsPatch]:";

  if (window.__REPLIFY_CAMPAIGNS_FETCH_APPLIED__) {
    return;
  }

  const pageContextOriginalFetch = window.fetch;
  if (!pageContextOriginalFetch) {
    console.error(
      INJECTED_LOG_PREFIX,
      "window.fetch is null/undefined!"
    );
    return;
  }

  let injectedCampaignDataStore = {};

  const TARGET_URLS = {
    RANKINGS: "/api/branch/analytics/campaigns/rankings",
    CAMPAIGN_STATS: "/api/branch/analytics/campaigns/stats",
    CAMPAIGN_INFO: "/api/campaigns/",
    ALIGNMENT_RESULTS_OVERALL: "/api/alignment-survey/results/overall",
    ALIGNMENT_RESULTS_PER_CONTENT: "/api/alignment-survey/results/per-content",
    ALIGNMENT_TIMESERIES: "/api/alignment-survey/results/time-series",
    ALIGNMENT_SURVEY_CONFIG: "/api/alignment-survey/surveys",
    ENGAGEMENT_GROUPS:
      "/api/branch/analytics/campaigns/engagement/user-group-ranking",
    VISIBILITY_USER_GROUP_RANKING:
      "/api/branch/analytics/campaigns/visibility/user-group-ranking",
    SENTIMENT_TIMESERIES: "/api/community-insights/campaigns/",
    SENTIMENT_OVERALL: "/api/community-insights/campaigns/",
    VISIBILITY_TIMESERIES:
      "/api/branch/analytics/campaigns/visibility/timeseries",
    ENGAGEMENT_TIMESERIES:
      "/api/branch/analytics/campaigns/engagement/timeseries",
    POST_STATS: "/api/branch/analytics/campaigns/posts/stats",
    VISIBILITY_CONTENT_RANKING:
      "/api/branch/analytics/campaigns/visibility/content-ranking",
    VISIBILITY_ACCESSORS:
      "/api/branch/analytics/campaigns/visibility/accessors",
  };
  
  const MOCK_GROUP_NAMES = [
      "Approved Email Recipients", "Company Values", "Marketplace", "Pet Central",
      "Events and Social", "Thank You", "Leadership Team", "New York Office",
      "Remote Workers", "Project Phoenix Team",
  ];

  const rand = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };
  const randFloat = (min, max, decimals = 2) =>
    parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
  const getEmployeeCount = () => {
    const cfg = (window.__REPLIFY_ANALYTICS_CONFIG || window.replifyAnalyticsConfig || {});
    if (cfg && typeof cfg.numberOfEmployees === "number" && cfg.numberOfEmployees > 0) return cfg.numberOfEmployees;
    try {
      const raw = document.documentElement.getAttribute("data-replify-analytics-config");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.numberOfEmployees === "number" && parsed.numberOfEmployees > 0) return parsed.numberOfEmployees;
      }
    } catch (_) {}
    return 5000;
  };
  const getScale = () => Math.max(0.5, getEmployeeCount() / 5000);
  const MIN_POTENTIAL_FACTOR = 0.35; // use a lower default to keep potential visitors realistic
  // Static-style bases to mimic the provided user script while still scaling with employees.
  const POSTS_CONFIG = {
    visitors: [85, 92, 78, 65, 88, 71, 95],
    engagedUsers: [65, 71, 60, 52, 68, 55, 74],
    visits: [150, 165, 140, 120, 155, 130, 170],
    reactions: [30, 35, 28, 24, 32, 26, 38],
    comments: [12, 15, 10, 8, 14, 9, 16],
    shares: [5, 7, 4, 3, 6, 4, 8],
    surveyAnswers: [9, 11, 8, 6, 10, 7, 12],
  };
  const ALIGNMENT_TARGET_AVG = 4.2;
  const ALIGNMENT_PARTICIPANTS = 40;
  const ALIGNMENT_ANSWERS = { 1: 0, 2: 3, 3: 4, 4: 16, 5: 17 };
  const DAYS_SPAN_FOR_SERIES = 60; // roughly two months
  const VISIBILITY_STATIC_SERIES = [
    { date: "2025-07-22T00:00:00Z", seenAtLeastOne: 1, seenAtLeastTwo: 0, seenAtLeastThree: 0 },
    { date: "2025-07-27T00:00:00Z", seenAtLeastOne: 2, seenAtLeastTwo: 0, seenAtLeastThree: 0 },
    { date: "2025-08-01T00:00:00Z", seenAtLeastOne: 4, seenAtLeastTwo: 1, seenAtLeastThree: 0 },
    { date: "2025-08-06T00:00:00Z", seenAtLeastOne: 6, seenAtLeastTwo: 2, seenAtLeastThree: 0 },
    { date: "2025-08-11T00:00:00Z", seenAtLeastOne: 6, seenAtLeastTwo: 3, seenAtLeastThree: 1 },
    { date: "2025-08-16T00:00:00Z", seenAtLeastOne: 8, seenAtLeastTwo: 5, seenAtLeastThree: 1 },
    { date: "2025-08-21T00:00:00Z", seenAtLeastOne: 9, seenAtLeastTwo: 6, seenAtLeastThree: 2 },
    { date: "2025-08-26T00:00:00Z", seenAtLeastOne: 13, seenAtLeastTwo: 7, seenAtLeastThree: 3 },
    { date: "2025-08-31T00:00:00Z", seenAtLeastOne: 14, seenAtLeastTwo: 9, seenAtLeastThree: 4 },
    { date: "2025-09-05T00:00:00Z", seenAtLeastOne: 15, seenAtLeastTwo: 11, seenAtLeastThree: 5 },
    { date: "2025-09-10T00:00:00Z", seenAtLeastOne: 18, seenAtLeastTwo: 14, seenAtLeastThree: 7 },
    { date: "2025-09-15T00:00:00Z", seenAtLeastOne: 22, seenAtLeastTwo: 17, seenAtLeastThree: 9 },
    { date: "2025-09-20T00:00:00Z", seenAtLeastOne: 27, seenAtLeastTwo: 21, seenAtLeastThree: 11 },
    { date: "2025-09-25T00:00:00Z", seenAtLeastOne: 32, seenAtLeastTwo: 25, seenAtLeastThree: 14 },
    { date: "2025-10-01T00:00:00Z", seenAtLeastOne: 37, seenAtLeastTwo: 28, seenAtLeastThree: 15 },
  ];
  const ENGAGEMENT_STATIC_SERIES = [
    { date: "2025-07-22T00:00:00Z", visitors: 10, engagedUsers: 4 },
    { date: "2025-07-27T00:00:00Z", visitors: 12, engagedUsers: 6 },
    { date: "2025-08-01T00:00:00Z", visitors: 15, engagedUsers: 6 },
    { date: "2025-08-06T00:00:00Z", visitors: 17, engagedUsers: 8 },
    { date: "2025-08-11T00:00:00Z", visitors: 20, engagedUsers: 10 },
    { date: "2025-08-16T00:00:00Z", visitors: 23, engagedUsers: 10 },
    { date: "2025-08-21T00:00:00Z", visitors: 26, engagedUsers: 13 },
    { date: "2025-08-26T00:00:00Z", visitors: 29, engagedUsers: 15 },
    { date: "2025-08-31T00:00:00Z", visitors: 30, engagedUsers: 14 },
    { date: "2025-09-07T00:00:00Z", visitors: 32, engagedUsers: 15 },
    { date: "2025-09-10T00:00:00Z", visitors: 35, engagedUsers: 29 },
    { date: "2025-09-15T00:00:00Z", visitors: 45, engagedUsers: 34 },
    { date: "2025-09-20T00:00:00Z", visitors: 56, engagedUsers: 55 },
    { date: "2025-09-25T00:00:00Z", visitors: 69, engagedUsers: 62 },
    { date: "2025-10-01T00:00:00Z", visitors: 110, engagedUsers: 88 },
  ];
  const MAX_DESIRED_PCT = 88;
  const MIN_PCT_FLOOR_INPUTS = 5;
  const normalisePercentage = (inputValue, cap = MAX_DESIRED_PCT) => {
    let n = parseFloat(inputValue);
    if (isNaN(n) || n < 0) n = 0;
    if (n > 100) n = 100;
    let newPct;
    if (n >= 90) {
      newPct = rand(Math.min(cap - 30, 50), Math.min(cap - 5, 65));
    } else if (n >= 75) {
      newPct = rand(Math.min(cap - 35, 45), Math.min(cap - 10, 60));
    } else if (n >= 50) {
      newPct = rand(Math.min(cap - 40, 35), Math.min(cap - 15, 55));
    } else if (n >= 25) {
      newPct = rand(
        Math.min(cap - 45, MIN_PCT_FLOOR_INPUTS + 5),
        Math.min(cap - 20, 45)
      );
    } else {
      newPct = rand(
        MIN_PCT_FLOOR_INPUTS,
        Math.min(cap - 50, Math.max(MIN_PCT_FLOOR_INPUTS, n + rand(0, 10)))
      );
    }
    let finalPct = Math.round(Math.min(Math.max(0, newPct), cap - 1));
    return Math.max(MIN_PCT_FLOOR_INPUTS, finalPct);
  };
  const harmonisePercentagePair = ( visPctInput, engPctInput, cap = MAX_DESIRED_PCT ) => {
    let visPct = parseFloat(visPctInput);
    let engPct = parseFloat(engPctInput);
    if (isNaN(visPct)) visPct = rand(Math.max(MIN_PCT_FLOOR_INPUTS, cap - 25), cap - 10);
    if (isNaN(engPct)) engPct = rand(Math.max(MIN_PCT_FLOOR_INPUTS, cap - 35), cap - 20);
    visPct = Math.round(Math.min(Math.max(0, visPct), cap));
    engPct = Math.round(Math.min(Math.max(0, engPct), cap));
    const MIN_VIS_LEAD = rand(4, 9);
    const MAX_ALLOWED_SIMILARITY_DIFF = rand(12, 22);
    if (visPct < engPct + MIN_VIS_LEAD) {
      visPct = Math.min(cap, engPct + MIN_VIS_LEAD);
    }
    if (engPct > visPct) {
      engPct = Math.max(0, visPct - MIN_VIS_LEAD);
    }
    if (visPct - engPct > MAX_ALLOWED_SIMILARITY_DIFF) {
      visPct = engPct + MAX_ALLOWED_SIMILARITY_DIFF - rand(0, Math.floor(MAX_ALLOWED_SIMILARITY_DIFF * 0.15));
    }
    visPct = Math.round(Math.min(Math.max(0, visPct), cap));
    engPct = Math.round(Math.min(Math.max(0, engPct), cap));
    if (visPct >= cap) visPct = cap - rand(1, Math.min(3, cap > 1 ? cap - 1 : 1));
    if (engPct >= cap) engPct = cap - rand(1, Math.min(3, cap > 1 ? cap - 1 : 1));
    visPct = Math.max(0, visPct);
    engPct = Math.max(0, engPct);
    if (engPct >= visPct && visPct > 0) {
      engPct = visPct - rand(1, 2);
      if (engPct < 0) engPct = 0;
    } else if (visPct <= 0) {
      visPct = 0;
      engPct = 0;
    }
    if (visPct >= 100) visPct = MAX_DESIRED_PCT - rand(2, 5);
    if (engPct >= 100) engPct = MAX_DESIRED_PCT - rand(2, 5);
    if (engPct > visPct) engPct = Math.max(0, visPct - 1);
    return [Math.max(0, visPct), Math.max(0, engPct)];
  };
  const generateAlignmentScore = () => {
    const delta = randFloat(-1.2, 0.78);
    const raw = ALIGNMENT_TARGET_AVG + delta;
    return parseFloat(Math.max(3.2, Math.min(4.95, raw)).toFixed(2));
  };
  const getOrGenerateAlignmentScore = (campaignId) => {
    if (campaignId && injectedCampaignDataStore[campaignId]?.alignmentScore) {
      return injectedCampaignDataStore[campaignId].alignmentScore;
    }
    const score = generateAlignmentScore();
    if (campaignId) {
      injectedCampaignDataStore[campaignId] = {
        ...injectedCampaignDataStore[campaignId],
        alignmentScore: score,
      };
    }
    return score;
  };
  function generateAlignmentAnswers(avgScore, numParticipants) {
    return { ...ALIGNMENT_ANSWERS };
  }
  function applyDatesToSeries(sourceSeries, daysSpan = DAYS_SPAN_FOR_SERIES) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1); // yesterday
    const start = new Date(end);
    start.setDate(start.getDate() - Math.max(1, daysSpan));
    const totalPoints = sourceSeries.length;
    const stepMs = (end.getTime() - start.getTime()) / Math.max(1, totalPoints - 1);
    return sourceSeries.map((pt, idx) => {
      const d = new Date(start.getTime() + stepMs * idx);
      return { ...pt, date: d.toISOString().split("T")[0] + "T00:00:00Z" };
    });
  }
  let ALIGNMENT_SERIES_BY_CAMPAIGN = {};
  function generateAlignmentSeriesPoints(totalPoints = 14, target = ALIGNMENT_TARGET_AVG) {
    const startOffset = randFloat(0.7, 1.1);
    const startValue = Math.max(3.2, target - startOffset);
    const pts = Array.from({ length: totalPoints }, (_, idx) => {
      const progress = (idx / (totalPoints - 1)) * startOffset;
      const wave = Math.sin(idx / 2.8) * 0.07 + Math.cos(idx / 4.1) * 0.05;
      const noise = randFloat(-0.05, 0.05);
      const score = Math.max(3.2, Math.min(4.95, parseFloat((startValue + progress + wave + noise).toFixed(2))));
      return { date: "", score };
    });
    return applyDatesToSeries(pts, DAYS_SPAN_FOR_SERIES);
  }
  function getAlignmentSeries(campaignId = null, targetOverride = null) {
    const key = campaignId || "__default";
    if (ALIGNMENT_SERIES_BY_CAMPAIGN[key]) return ALIGNMENT_SERIES_BY_CAMPAIGN[key];
    const resolvedTarget =
      targetOverride ??
      (campaignId && injectedCampaignDataStore[campaignId]?.alignmentScore) ??
      (campaignId ? getOrGenerateAlignmentScore(campaignId) : ALIGNMENT_TARGET_AVG);
    ALIGNMENT_SERIES_BY_CAMPAIGN[key] = generateAlignmentSeriesPoints(14, resolvedTarget);
    return ALIGNMENT_SERIES_BY_CAMPAIGN[key];
  }
  function generatePositiveSentimentSeries(totalPoints = 25, baseComments = 70) {
    const template = Array.from({ length: totalPoints }, () => ({
      date: "",
      labelPositiveCount: 0,
      labelNegativeCount: 0,
      labelNeutralCount: 0,
    }));
    const dated = applyDatesToSeries(template, DAYS_SPAN_FOR_SERIES);
    return dated.map((pt, idx) => {
      // Vary total by index to add waves, spikes, and dips scaled by employee count
      const empScale = Math.max(1, getEmployeeCount() / 1000);
      const dailyBaseline = rand(8, 34) * empScale;
      const basePerDay = Math.max(
        dailyBaseline,
        (baseComments / totalPoints) * randFloat(0.9, 1.25)
      );
      const wave = Math.max(
        0.5,
        0.95 + Math.sin(idx / 3.2) * 0.35 + Math.cos(idx / 4.8) * 0.25
      );
      const noise = randFloat(0.85, 1.25);
      const spike = Math.random() < 0.12 ? randFloat(1.15, 1.4) : 1;
      const dip = Math.random() < 0.14 ? randFloat(0.55, 0.85) : 1;
      const floorPerDay = Math.max(6 * empScale, dailyBaseline * 0.5);
      const total = Math.max(
        floorPerDay,
        Math.round(basePerDay * wave * noise * spike * dip)
      );
      const neutralBias = randFloat(0.95, 1.05);
      const negativeBias = randFloat(0.95, 1.05);
      const neutralLow = Math.max(2, Math.round(total * 0.18 * neutralBias));
      const neutralHigh = Math.max(neutralLow, Math.round(total * 0.32 * neutralBias));
      let neu = rand(neutralLow, Math.min(neutralHigh, Math.max(neutralHigh, total - 3)));
      const negativeLow = Math.max(2, Math.round(total * 0.1 * negativeBias));
      const negativeHigh = Math.max(negativeLow, Math.round(total * 0.18 * negativeBias));
      let neg = rand(negativeLow, Math.min(negativeHigh, Math.max(negativeHigh, total - neu - 2)));
      let pos = total - neu - neg;
      if (pos < 1) {
        const deficit = 1 - pos;
        pos = 1;
        const reduceNeu = Math.min(deficit, Math.max(0, neu - 1));
        neu -= reduceNeu;
        const remaining = deficit - reduceNeu;
        if (remaining > 0) {
          neg = Math.max(1, neg - remaining);
        }
      }
      const sum = pos + neu + neg;
      if (sum !== total) {
        pos = Math.max(1, pos + (total - sum));
      }
      return {
        ...pt,
        labelPositiveCount: pos,
        labelNegativeCount: neg,
        labelNeutralCount: neu,
      };
    });
  }
  function extractCampaignIdFromUrl(url, paramName = "campaignId") {
    try {
      const urlObj = new URL(url, window.location.origin);
      let id = urlObj.searchParams.get(paramName);
      if (id) return id;
      const pathParts = urlObj.pathname.split("/");
      const campaignsIndex = pathParts.indexOf("campaigns");
      if (campaignsIndex !== -1 && pathParts.length > campaignsIndex + 1) {
        const potentialId = pathParts[campaignsIndex + 1];
        if (/^[a-f0-9]{24}$/i.test(potentialId)) {
          if (
            campaignsIndex + 2 >= pathParts.length ||
            ["comments", "stats", "rankings", "results", "surveys", "timeseries"].includes(pathParts[campaignsIndex + 2]) ||
            /^[a-f0-9]{24}$/i.test(pathParts[campaignsIndex + 2]) === false
          ) {
            return potentialId;
          }
        }
      }
    } catch (e) {
      console.warn(INJECTED_LOG_PREFIX + " Error parsing URL " + url + " for campaignId: " + e.message);
    }
    return null;
  }

const forceRenderAlignmentChart = () => {
  const INJECTED_LOG_PREFIX = "[Replify InjectedCampaignsPatch]:";

  // Render using the static data points from config (preserves dips while keeping target average)
  const generateDynamicChartHTML = (targetAverage = ALIGNMENT_TARGET_AVG, containerWidth, campaignId = null) => {
      const dataPoints = getAlignmentSeries(campaignId, targetAverage).map(p => ({ date: new Date(p.date), score: p.score }));

      const svgWidth = containerWidth;
      const svgHeight = 378;
      const margin = { top: 12, right: 66, bottom: 42, left: 42 };
      const innerWidth = svgWidth - margin.left - margin.right;
      const innerHeight = svgHeight - margin.top - margin.bottom;

      if (innerWidth <= 0) return '';

      const xScale = (date) => {
          const minTime = dataPoints[0].date.getTime();
          const maxTime = dataPoints[dataPoints.length - 1].date.getTime();
          return margin.left + ((date.getTime() - minTime) / (maxTime - minTime)) * innerWidth;
      };
      const yScale = (score) => {
          return margin.top + innerHeight - ((score - 1) / 4) * innerHeight;
      };

      const yAxisTicks = [1, 2, 3, 4, 5].map(val =>
          `<g class="visx-group visx-axis-tick"><svg x="0.25em" y="0.25em" font-size="12px" style="overflow: visible;"><text x="8" y="${yScale(val)}" font-family="Inter" font-size="12px" fill="var(--sb-color-grey-700)" text-anchor="start"><tspan x="8" dy="0em">${val}</tspan></text></svg></g>`
      ).join('');

      const gridLines = [1, 2, 3, 4, 5].map(val =>
          `<line class="visx-line" x1="${margin.left}" y1="${yScale(val)}" x2="${innerWidth + margin.left}" y2="${yScale(val)}" fill="transparent" shape-rendering="crispEdges" stroke="#eaf0f6" stroke-width="1"></line>`
      ).join('');

      const dateTicks = dataPoints.map((d, i) => {
          if (i % 2 !== 0 && i < dataPoints.length - 1) return '';
          const x = xScale(d.date);
          const dateString = d.date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
          return `<g class="visx-group visx-axis-tick"><line class="visx-line" x1="${x}" y1="${margin.top + innerHeight}" x2="${x}" y2="${margin.top + innerHeight + 8}" fill="transparent" shape-rendering="crispEdges" stroke="var(--sb-color-grey-100)" stroke-width="1"></line><svg x="0" y="0.25em" font-size="12px" style="overflow: visible;"><text x="${x}" y="${margin.top + innerHeight + 18}" font-family="Inter" font-size="12px" fill="var(--sb-color-grey-700)" text-anchor="middle"><tspan dy="0em">${dateString}</tspan></text></svg></g>`;
      }).join('');

      const curve = (p, i, a) => {
          const tension = 0.2;
          const [x0, y0] = i > 0 ? [xScale(a[i - 1].date), yScale(a[i - 1].score)] : p;
          const [x1, y1] = p;
          const [x2, y2] = i < a.length - 1 ? [xScale(a[i + 1].date), yScale(a[i + 1].score)] : p;
          const [x3, y3] = i < a.length - 2 ? [xScale(a[i + 2].date), yScale(a[i + 2].score)] : [x2, y2];
          const l = (p1, p2) => Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
          const d01 = l([x0, y0], [x1, y1]) || 1;
          const d12 = l([x1, y1], [x2, y2]) || 1;
          const d23 = l([x2, y2], [x3, y3]) || 1;
          const fa = tension * d12 / (d01 + d12);
          const fb = tension * d12 / (d12 + d23);
          const p1x = x1 + fa * (x2 - x0);
          const p1y = y1 + fa * (y2 - y0);
          const p2x = x2 - fb * (x3 - x1);
          const p2y = y2 - fb * (y3 - y1);
          return `C ${p1x},${p1y} ${p2x},${p2y} ${x2},${y2}`;
      };

      const scaledPoints = dataPoints.map(d => [xScale(d.date), yScale(d.score)]);
      const pathData = scaledPoints.reduce((acc, p, i, a) => acc + (i > 0 ? curve(p, i, dataPoints) : `M ${p[0]} ${p[1]}`), '');
      const path = `<path class="visx-linepath" d="${pathData}" fill="transparent" stroke-linecap="round" stroke="#0F3948" stroke-width="2"></path>`;

      const circles = dataPoints.map(d =>
          `<circle cx="${xScale(d.date)}" cy="${yScale(d.score)}" r="2.5" fill="#0F3948" stroke="#FFF" stroke-width="1"></circle>`
      ).join('');

      const hoverRects = dataPoints.map((d, i) => {
          const x = i > 0 ? xScale(dataPoints[i - 1].date) + (xScale(d.date) - xScale(dataPoints[i - 1].date)) / 2 : margin.left;
          const width = i > 0 ? (xScale(d.date) - xScale(dataPoints[i - 1].date)) / 2 + (i < dataPoints.length - 1 ? (xScale(dataPoints[i + 1].date) - xScale(d.date)) / 2 : 0) : (xScale(dataPoints[1].date) - xScale(d.date)) / 2;
          return `<rect y="${margin.top}" height="${innerHeight}" x="${x}" opacity="0" width="${width}" tabindex="0"></rect>`
      }).join('');

      return `<div class="lg:flex-[0.67] bg-neutral-surface border border-neutral-weak h-[476px] flex flex-col min-w-0 rounded-8">
          <div class="group flex flex-col flex-1 gap-24 py-24 h-full">
              <div class="flex gap-8 items-center px-[42px]">
                  <h2 class="text-title-lg">Alignment Average Over Time</h2>
              </div>
              <div class="flex-1 min-h-0 min-w-0">
                  <div style="width: 100%; height: 100%;">
                      <div class="relative">
                          <svg height="${svgHeight}" width="${svgWidth}">
                              <g>
                                  ${gridLines}
                                  ${dateTicks}
                                  <g transform="translate(${innerWidth + margin.left}, 0)">${yAxisTicks}</g>
                                  ${path}
                                  ${circles}
                                  ${hoverRects}
                              </g>
                          </svg>
                      </div>
                  </div>
              </div>
          </div>
      </div>`;
  };

  const emptyStateText = "Publish the first alignment survey in this campaign.";

  const startObserver = () => {
      let checkCounter = 0;
      const checkInterval = setInterval(() => {
          const allParagraphs = document.querySelectorAll('p');
          const targetElement = Array.from(allParagraphs).find(p => p.textContent.trim() === emptyStateText);
          checkCounter++;

          if (targetElement) {
              console.log(INJECTED_LOG_PREFIX, "✅ Found target text on check #" + checkCounter);
              clearInterval(checkInterval);

              const chartContainer = targetElement.closest('.rounded-8');
              if (chartContainer) {
                  const campaignId = extractCampaignIdFromUrl(window.location.href);
                  const campaignData = campaignId ? injectedCampaignDataStore[campaignId] : null;
                  const alignmentScore = campaignData?.alignmentScore || getOrGenerateAlignmentScore(campaignId);
                  
                  // Measure the container before generating the chart
                  const containerWidth = chartContainer.getBoundingClientRect().width;

                  console.log(INJECTED_LOG_PREFIX, `✅ Generating chart with width ${containerWidth}px and target average: ${alignmentScore}`);
                  const dynamicHTML = generateDynamicChartHTML(alignmentScore, containerWidth, campaignId);
                  chartContainer.outerHTML = dynamicHTML;
              }
          } else if (checkCounter > 20) {
              console.log(INJECTED_LOG_PREFIX, "❌ Stopped checking after 20s. Empty chart not found on this page.");
              clearInterval(checkInterval);
          }
      }, 1000);
  };

  // This observer handles the SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
          lastUrl = url;
          // Check if we are on a specific campaign page
          if (/analytics\/campaigns\/[a-f0-9]{24}/.test(url)) {
              console.log(INJECTED_LOG_PREFIX, "URL changed to a campaign page. Starting chart observer.");
              startObserver(); // Start looking for the empty chart
          }
      }
  }).observe(document, { subtree: true, childList: true });

  // Initial check for the first page load
  if (/analytics\/campaigns\/[a-f0-9]{24}/.test(location.href)) {
      console.log(INJECTED_LOG_PREFIX, "Initial load is a campaign page. Starting chart observer.");
      startObserver();
  }
};

  const injectedCustomFetch = async function (...args) {
    const resource = args[0];
    let url = typeof resource === "string" ? resource : resource.url;
    
    let matchedEndpointType = null;
    let campaignId = null;

    if (typeof url === "string") {
      if (
        url.startsWith(window.location.origin) ||
        url.startsWith("https://app.staffbase.com") ||
        url.includes("/api/")
      ) {
        if (url.includes(TARGET_URLS.RANKINGS))
          matchedEndpointType = "RANKINGS";
        else if (url.includes(TARGET_URLS.CAMPAIGN_STATS)) {
          matchedEndpointType = "CAMPAIGN_STATS";
          campaignId = extractCampaignIdFromUrl(url);
        } else if (url.includes(TARGET_URLS.ALIGNMENT_TIMESERIES)) {
          matchedEndpointType = "ALIGNMENT_TIMESERIES";
          campaignId = extractCampaignIdFromUrl(url);
        } else if (url.includes(TARGET_URLS.ALIGNMENT_RESULTS_PER_CONTENT)) {
          matchedEndpointType = "ALIGNMENT_RESULTS_PER_CONTENT";
          campaignId = extractCampaignIdFromUrl(url);
        } else if (url.includes(TARGET_URLS.ALIGNMENT_RESULTS_OVERALL)) {
          matchedEndpointType = "ALIGNMENT_RESULTS_OVERALL";
          campaignId = extractCampaignIdFromUrl(url);
        } else if (url.includes(TARGET_URLS.ENGAGEMENT_GROUPS)) {
          matchedEndpointType = "ENGAGEMENT_GROUPS";
          campaignId = extractCampaignIdFromUrl(url);
        } else if (url.includes(TARGET_URLS.VISIBILITY_USER_GROUP_RANKING)) {
          matchedEndpointType = "VISIBILITY_USER_GROUP_RANKING";
          campaignId = extractCampaignIdFromUrl(url);
        } else if (
          url.includes(TARGET_URLS.SENTIMENT_OVERALL) &&
          url.includes("/comments/sentiment-labels/overall")
        ) {
          matchedEndpointType = "SENTIMENT_OVERALL";
          campaignId = extractCampaignIdFromUrl(url);
        } else if (
          url.includes(TARGET_URLS.SENTIMENT_TIMESERIES) &&
          url.includes("/comments/sentiment-labels/time-series")
        ) {
          matchedEndpointType = "SENTIMENT_TIMESERIES";
          campaignId = extractCampaignIdFromUrl(url);
        } else if (url.includes(TARGET_URLS.VISIBILITY_TIMESERIES)) {
          matchedEndpointType = "VISIBILITY_TIMESERIES";
          campaignId = extractCampaignIdFromUrl(url);
        } else if (url.includes(TARGET_URLS.ENGAGEMENT_TIMESERIES)) {
          matchedEndpointType = "ENGAGEMENT_TIMESERIES";
          campaignId = extractCampaignIdFromUrl(url);
        } else if (url.includes(TARGET_URLS.POST_STATS)) {
          matchedEndpointType = "POST_STATS";
          campaignId = extractCampaignIdFromUrl(url);
        } else if (url.includes(TARGET_URLS.VISIBILITY_CONTENT_RANKING)) {
          matchedEndpointType = "VISIBILITY_CONTENT_RANKING";
          campaignId = extractCampaignIdFromUrl(url);
        } else if (url.includes(TARGET_URLS.VISIBILITY_ACCESSORS)) {
          matchedEndpointType = "VISIBILITY_ACCESSORS";
          campaignId = extractCampaignIdFromUrl(url);
        } else if (
          url.includes(TARGET_URLS.CAMPAIGN_INFO) &&
          !Object.values(TARGET_URLS).some(
            (v) =>
              v !== TARGET_URLS.CAMPAIGN_INFO &&
              url.includes(v) &&
              v.length > TARGET_URLS.CAMPAIGN_INFO.length
          )
        ) {
          const potentialId = extractCampaignIdFromUrl(url);
          if (
            potentialId &&
            url.endsWith(TARGET_URLS.CAMPAIGN_INFO + potentialId)
          ) {
            matchedEndpointType = "CAMPAIGN_INFO";
            campaignId = potentialId;
          }
        }
      }
    }

    if (matchedEndpointType) {
      try {
        const response = await pageContextOriginalFetch.apply(this, args);
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("application/json")
        ) {
          return response;
        }
        const clonedResponse = response.clone();
        const data = await clonedResponse.json();

        switch (matchedEndpointType) {
          case "RANKINGS":
            if (data.ranking && Array.isArray(data.ranking)) {
              const scale = getScale();
              data.ranking.forEach((item) => {
                const potential = item.potentialVisitors > 0 ? item.potentialVisitors : Math.max(item.visitors, item.engagedUsers, 1);
                let originalVisPercent = potential > 0 ? (item.visitors / potential) * 100 : 0;
                let originalEngPercent = potential > 0 ? (item.engagedUsers / potential) * 100 : 0;
                let normVisPercent = normalisePercentage( originalVisPercent, MAX_DESIRED_PCT );
                let normEngPercent = normalisePercentage( originalEngPercent, MAX_DESIRED_PCT );
                [normVisPercent, normEngPercent] = harmonisePercentagePair( normVisPercent, normEngPercent, MAX_DESIRED_PCT );
                const scaledPotential = Math.max(
                  potential,
                  Math.round(potential * scale),
                  Math.round(getEmployeeCount() * MIN_POTENTIAL_FACTOR)
                );
                item.potentialVisitors = scaledPotential;
                item.visitors = Math.round((normVisPercent / 100) * scaledPotential);
                item.engagedUsers = Math.round( (normEngPercent / 100) * scaledPotential );
                if (scaledPotential > 0) {
                  item.visitors = Math.min(item.visitors, scaledPotential);
                }
                item.engagedUsers = Math.min(item.engagedUsers, item.visitors);
                item.visitors = Math.max(0, item.visitors);
                item.engagedUsers = Math.max(0, item.engagedUsers);
                let newAlignmentScore = item.alignmentScore;
                let newAlignmentParticipants = item.alignmentParticipantsCount;
                if ( item.hasAlignmentSurvey && (item.alignmentScore === 0 || item.alignmentParticipantsCount <= 5) ) {
                  newAlignmentScore = getOrGenerateAlignmentScore(item.campaignId);
                  newAlignmentParticipants = rand(6, 25);
                } else if (item.alignmentScore > 5) {
                  newAlignmentScore = getOrGenerateAlignmentScore(item.campaignId);
                  if (item.alignmentParticipantsCount <= 5) newAlignmentParticipants = rand(6, 25);
                } else if ( typeof item.alignmentScore === "number" && item.alignmentScore > 0 ) {
                  newAlignmentScore = parseFloat( item.alignmentScore.toFixed(2) );
                  if ( item.hasAlignmentSurvey && item.alignmentParticipantsCount <= 5 ) newAlignmentParticipants = rand( 6, Math.max(6, item.alignmentParticipantsCount + rand(3, 10)) );
                } else {
                  newAlignmentScore = getOrGenerateAlignmentScore(item.campaignId);
                  newAlignmentParticipants = rand(6, 25);
                }
                if (!newAlignmentScore || Math.abs(newAlignmentScore - ALIGNMENT_TARGET_AVG) < 0.05) {
                  newAlignmentScore = getOrGenerateAlignmentScore(item.campaignId);
                }
                item.alignmentScore = newAlignmentScore;
                item.alignmentParticipantsCount = newAlignmentParticipants;
                injectedCampaignDataStore[item.campaignId] = {
                  visitors: item.visitors,
                  engagedUsers: item.engagedUsers,
                  potentialVisitors: item.potentialVisitors,
                  alignmentScore: item.alignmentScore,
                  alignmentParticipantsCount: item.alignmentParticipantsCount,
                  normVisPercent: normVisPercent,
                  normEngPercent: normEngPercent,
                  postSurveyAnswers: {},
                };
              });
            }
            break;
          case "CAMPAIGN_STATS":
            if (campaignId && data) {
              const scale = getScale();
              const basePotential = data.potentialVisitors > 0 ? data.potentialVisitors : Math.max(data.visitors, data.engagedUsers, 1);
              const potential = Math.max(
                basePotential,
                Math.round(basePotential * scale),
                Math.round(getEmployeeCount() * MIN_POTENTIAL_FACTOR)
              );
              data.potentialVisitors = potential;
              if ( injectedCampaignDataStore[campaignId] && injectedCampaignDataStore[campaignId].visitors !== undefined ) {
                data.visitors = injectedCampaignDataStore[campaignId].visitors;
                data.engagedUsers = injectedCampaignDataStore[campaignId].engagedUsers;
              } else {
                let originalVisPercent = potential > 0 ? (data.visitors / potential) * 100 : 0;
                let originalEngPercent = potential > 0 ? (data.engagedUsers / potential) * 100 : 0;
                let normVisPercent = normalisePercentage( originalVisPercent, MAX_DESIRED_PCT );
                let normEngPercent = normalisePercentage( originalEngPercent, MAX_DESIRED_PCT );
                [normVisPercent, normEngPercent] = harmonisePercentagePair( normVisPercent, normEngPercent, MAX_DESIRED_PCT );
                data.visitors = Math.round((normVisPercent / 100) * potential);
                data.engagedUsers = Math.round( (normEngPercent / 100) * potential );
                if (potential > 0) {
                  data.visitors = Math.min(data.visitors, potential);
                }
                data.engagedUsers = Math.min(data.engagedUsers, data.visitors);
                data.visitors = Math.max(0, data.visitors);
                data.engagedUsers = Math.max(0, data.engagedUsers);
                injectedCampaignDataStore[campaignId] = {
                  ...injectedCampaignDataStore[campaignId],
                  visitors: data.visitors,
                  engagedUsers: data.engagedUsers,
                  potentialVisitors: potential,
                  normVisPercent,
                  normEngPercent,
                };
              }
            }
            break;
          case "POST_STATS":
            if (campaignId && data && Array.isArray(data.posts)) {
              const scale = getScale();
              data.posts.forEach((post, index) => {
                const i = index % POSTS_CONFIG.visitors.length;
                post.visitors = Math.max(1, Math.round(POSTS_CONFIG.visitors[i] * scale));
                post.engagedUsers = Math.min(post.visitors, Math.max(1, Math.round(POSTS_CONFIG.engagedUsers[i] * scale)));
                post.visits = Math.max(post.visitors, Math.round(POSTS_CONFIG.visits[i] * scale));
                post.reactions = Math.round(POSTS_CONFIG.reactions[i] * scale);
                post.comments = Math.round(POSTS_CONFIG.comments[i] * scale);
                post.shares = Math.round(POSTS_CONFIG.shares[i] * scale);
                post.surveyAnswers = Math.max(0, Math.round(POSTS_CONFIG.surveyAnswers[i] * scale * randFloat(0.9, 1.2)));
                post.reactions = Math.min(post.reactions, post.engagedUsers);
                post.comments = Math.min(post.comments, post.engagedUsers);
                post.shares = Math.min(post.shares, post.engagedUsers);
                post.surveyAnswers = Math.min(post.surveyAnswers, post.engagedUsers);
                if (!injectedCampaignDataStore[campaignId]) injectedCampaignDataStore[campaignId] = { postSurveyAnswers: {} };
                if (!injectedCampaignDataStore[campaignId].postSurveyAnswers) injectedCampaignDataStore[campaignId].postSurveyAnswers = {};
                injectedCampaignDataStore[campaignId].postSurveyAnswers[ post.postId ] = post.surveyAnswers;
              });
            }
            break;
          case "ALIGNMENT_TIMESERIES":
            console.log(INJECTED_LOG_PREFIX, "Intercepted ALIGNMENT_TIMESERIES. Using generated points.");
            const seriesTarget = getOrGenerateAlignmentScore(campaignId);
            data.timeseries = getAlignmentSeries(campaignId, seriesTarget).map(dp => ({
              date: new Date(dp.date).toISOString(),
              averageScore: dp.score,
              participantCount: ALIGNMENT_PARTICIPANTS,
            }));
            break;
          case "ALIGNMENT_RESULTS_OVERALL":
            if (campaignId && data) {
              const finalScore = getOrGenerateAlignmentScore(campaignId);
              const finalParticipants = ALIGNMENT_PARTICIPANTS;
              data.averageScore = finalScore;
              data.participantCount = finalParticipants;
              data.answers = generateAlignmentAnswers( finalScore, finalParticipants );
              injectedCampaignDataStore[campaignId] = {
                ...injectedCampaignDataStore[campaignId],
                alignmentScore: finalScore,
                alignmentParticipantsCount: finalParticipants,
              };
            }
            break;
          case "ALIGNMENT_RESULTS_PER_CONTENT":
            if (campaignId && data && Array.isArray(data.contents)) {
              const finalScore = getOrGenerateAlignmentScore(campaignId);
              data.contents.forEach((content) => {
                if (content.surveyReferenceStatus === "enabled") {
                  const postId = content.contentId;
                  content.participantCount = ALIGNMENT_PARTICIPANTS;
                  content.answers = ALIGNMENT_ANSWERS;
                  content.averageScore = finalScore;
                  if (!injectedCampaignDataStore[campaignId]) injectedCampaignDataStore[campaignId] = { postSurveyAnswers: {} };
                  injectedCampaignDataStore[campaignId].postSurveyAnswers[postId] = ALIGNMENT_PARTICIPANTS;
                } else {
                  content.participantCount = 0;
                  content.answers = null;
                }
              });
            }
            break;
        case "ENGAGEMENT_GROUPS":
            if (!data.ranking || !Array.isArray(data.ranking) || data.ranking.length === 0) {
                const storedGroups = injectedCampaignDataStore[campaignId]?.userGroups;
                if (storedGroups && storedGroups.length > 0) {
                    data.ranking = storedGroups.map(group => ({
                        groupId: group.groupId,
                        groupName: group.groupName,
                        visitors: 0, 
                        engagers: 0,
                    }));
                } else {
                    data.ranking = [];
                    const numGroups = rand(5, 7);
                    const usedNames = new Set();
                    while (data.ranking.length < numGroups && usedNames.size < MOCK_GROUP_NAMES.length) {
                        const nameIndex = rand(0, MOCK_GROUP_NAMES.length - 1);
                        const name = MOCK_GROUP_NAMES[nameIndex];
                        if (!usedNames.has(name)) {
                            usedNames.add(name);
                            data.ranking.push({
                                groupId: `mock-group-eng-${Date.now()}-${data.ranking.length}`,
                                groupName: name,
                                visitors: 0,
                                engagers: 0,
                            });
                        }
                    }
                }
            }
            const hasVisitors = data.ranking.some(group => group.visitors > 0);
            if (!hasVisitors) {
                const campaignVisitors = injectedCampaignDataStore[campaignId]?.visitors || rand(100, 500);
                data.ranking.forEach(group => {
                    group.visitors = rand(Math.floor(campaignVisitors * 0.1), Math.floor(campaignVisitors * 0.4));
                });
            }
            data.ranking.forEach((group) => {
                if (group.visitors > 0) {
                    let engPctOfVis = rand(30, Math.min(95, MAX_DESIRED_PCT - 2));
                    group.engagers = Math.round( (engPctOfVis / 100) * group.visitors );
                    group.engagers = Math.min(group.engagers, group.visitors);
                    if (group.engagers === group.visitors && group.visitors > 0)
                        group.engagers = group.visitors - 1;
                    group.engagers = Math.max(0, group.engagers);
                } else {
                    group.engagers = 0;
                }
            });
            const hasEngagers = data.ranking.some(group => group.engagers > 0);
            if(!hasEngagers && data.ranking.length > 0) {
                const groupToFix = data.ranking[0];
                if (groupToFix.visitors === 0) groupToFix.visitors = rand(10, 50);
                groupToFix.engagers = rand(1, groupToFix.visitors);
            }
            break;
        case "VISIBILITY_USER_GROUP_RANKING":
            if (!data.ranking || !Array.isArray(data.ranking) || data.ranking.length === 0) {
              data.ranking = [];
              const numGroups = rand(5, 8);
              const usedNames = new Set();
              while ( data.ranking.length < numGroups && usedNames.size < MOCK_GROUP_NAMES.length ) {
                const nameIndex = rand(0, MOCK_GROUP_NAMES.length - 1);
                const name = MOCK_GROUP_NAMES[nameIndex];
                if (!usedNames.has(name)) {
                  usedNames.add(name);
                  const potential = rand(50, 500);
                  data.ranking.push({
                    groupId: `mock-group-vis-${Date.now()}-${data.ranking.length}`,
                    groupName: name,
                    visitors: 0, 
                    potentialVisitors: potential,
                  });
                }
              }
            }
            if (data.ranking && Array.isArray(data.ranking)) {
              data.ranking.forEach((group) => {
                const potential = group.potentialVisitors > 0 ? group.potentialVisitors : group.visitors;
                if (potential > 0) {
                  let visPct = normalisePercentage( rand(MIN_PCT_FLOOR_INPUTS, MAX_DESIRED_PCT), MAX_DESIRED_PCT );
                  group.visitors = Math.round((visPct / 100) * potential);
                  group.visitors = Math.min(group.visitors, potential);
                  if (group.visitors === potential && potential > 0) {
                    group.visitors = Math.max( 0, potential - rand(1, Math.max(1, Math.floor(potential * 0.02)) + 1) );
                  }
                  group.visitors = Math.max(0, group.visitors);
                } else {
                  group.visitors = 0;
                }
                if (group.potentialVisitors === 0 && group.visitors > 0) {
                  group.potentialVisitors = group.visitors + rand(0, Math.floor(group.visitors * 0.2));
                }
              });
            }
            if(campaignId) {
                if (!injectedCampaignDataStore[campaignId]) {
                    injectedCampaignDataStore[campaignId] = {};
                }
                injectedCampaignDataStore[campaignId].userGroups = data.ranking;
            }
            break;
          case "SENTIMENT_OVERALL":
            if (campaignId && data && data.data) {
              const stored = injectedCampaignDataStore[campaignId];
              const engagedUsers = stored?.engagedUsers || Math.round(getEmployeeCount() * 0.06);
              let baseCommenters = Math.round(engagedUsers * randFloat(0.18, 0.32));
              baseCommenters = Math.max(12, baseCommenters);
              data.data.uniqueCommenterCount = baseCommenters;
              const neutralBias = randFloat(0.95, 1.05);
              const negativeBias = randFloat(0.95, 1.05);
              const neutralLow = Math.max(2, Math.round(baseCommenters * 0.18 * neutralBias));
              const neutralHigh = Math.max(neutralLow, Math.round(baseCommenters * 0.32 * neutralBias));
              let neutralCount = rand(neutralLow, Math.min(neutralHigh, Math.max(neutralHigh, baseCommenters - 3)));
              const negativeLow = Math.max(2, Math.round(baseCommenters * 0.1 * negativeBias));
              const negativeHigh = Math.max(negativeLow, Math.round(baseCommenters * 0.18 * negativeBias));
              let negativeCount = rand(negativeLow, Math.min(negativeHigh, Math.max(negativeHigh, baseCommenters - neutralCount - 2)));
              let positiveCount = baseCommenters - neutralCount - negativeCount;
              if (positiveCount < 1) {
                const deficit = 1 - positiveCount;
                positiveCount = 1;
                const reduceNeutral = Math.min(deficit, Math.max(0, neutralCount - 1));
                neutralCount -= reduceNeutral;
                const remaining = deficit - reduceNeutral;
                if (remaining > 0) {
                  negativeCount = Math.max(1, negativeCount - remaining);
                }
              }
              const sumOverall = positiveCount + neutralCount + negativeCount;
              if (sumOverall !== baseCommenters) {
                positiveCount = Math.max(1, positiveCount + (baseCommenters - sumOverall));
              }
              data.data.labelPositiveCount = positiveCount;
              data.data.labelNegativeCount = negativeCount;
              data.data.labelNeutralCount = neutralCount;
            }
            break;
          case "SENTIMENT_TIMESERIES":
            if (data.data) {
              // Generate a dense series with balanced sentiment (~25 points over ~60 days)
              const engaged = injectedCampaignDataStore[campaignId]?.engagedUsers || Math.round(getEmployeeCount() * 0.12);
              const empScale = Math.max(1, getEmployeeCount() / 1000);
              const baseComments = Math.max(
                50,
                Math.round(engaged * randFloat(0.45, 0.9)),
                Math.round(empScale * rand(70, 140))
              );
              data.data = generatePositiveSentimentSeries(25, baseComments);
            }
            break;
          case "VISIBILITY_TIMESERIES": {
            const scaleVis = getScale();
            const targetPotential =
              injectedCampaignDataStore[campaignId]?.potentialVisitors ||
              Math.round(getEmployeeCount() * MIN_POTENTIAL_FACTOR);

            const datedSeries = applyDatesToSeries(VISIBILITY_STATIC_SERIES);
            // Initial scale pass
            let scaledSeries = datedSeries.map((pt) => ({
              date: pt.date,
              seenAtLeastOne: Math.max(1, Math.round(pt.seenAtLeastOne * scaleVis)),
              seenAtLeastTwo: Math.max(0, Math.round(pt.seenAtLeastTwo * scaleVis)),
              seenAtLeastThree: Math.max(0, Math.round(pt.seenAtLeastThree * scaleVis)),
            }));

            // Rescale to make final point ~95-98% of potentialVisitors
            const lastPoint = scaledSeries[scaledSeries.length - 1];
            if (lastPoint && targetPotential > 0) {
              const desiredFinal = Math.max(
                1,
                Math.round(targetPotential * randFloat(0.95, 0.98))
              );
              const currentFinal = lastPoint.seenAtLeastOne || 1;
              const adjustFactor = desiredFinal / currentFinal;
              scaledSeries = scaledSeries.map((pt) => ({
                ...pt,
                seenAtLeastOne: Math.max(1, Math.round(pt.seenAtLeastOne * adjustFactor)),
                seenAtLeastTwo: Math.max(0, Math.round(pt.seenAtLeastTwo * adjustFactor)),
                seenAtLeastThree: Math.max(0, Math.round(pt.seenAtLeastThree * adjustFactor)),
              }));
            }

            // Ensure non-decreasing order and clip to potential
            let maxOne = 0,
              maxTwo = 0,
              maxThree = 0;
            scaledSeries.forEach((pt) => {
              maxOne = Math.max(maxOne, pt.seenAtLeastOne);
              maxTwo = Math.max(maxTwo, pt.seenAtLeastTwo);
              maxThree = Math.max(maxThree, pt.seenAtLeastThree);
              pt.seenAtLeastOne = Math.min(targetPotential, maxOne);
              pt.seenAtLeastTwo = Math.min(
                pt.seenAtLeastOne,
                Math.max(maxTwo, pt.seenAtLeastTwo)
              );
              pt.seenAtLeastThree = Math.min(
                pt.seenAtLeastTwo,
                Math.max(maxThree, pt.seenAtLeastThree)
              );
            });
            data.timeseries = scaledSeries;
            break;
          }
          case "ENGAGEMENT_TIMESERIES": {
            const scaleEng = getScale();
            const datedEngSeries = applyDatesToSeries(ENGAGEMENT_STATIC_SERIES);
            data.timeseries = datedEngSeries.map((pt) => ({
              date: pt.date,
              visitors: Math.max(1, Math.round(pt.visitors * scaleEng)),
              engagedUsers: Math.min(
                Math.max(1, Math.round(pt.engagedUsers * scaleEng)),
                Math.max(1, Math.round(pt.visitors * scaleEng))
              ),
            }));
            break;
          }
          case "CAMPAIGN_INFO":
            break;
          case "VISIBILITY_CONTENT_RANKING": {
            const scale = getScale();
            const ensureSeries = () => {
              if (Array.isArray(data.rankingSeries)) return data.rankingSeries;
              if (Array.isArray(data.ranking)) return data.ranking;
              return [];
            };
            let series = ensureSeries();
            if (!series.length) {
              const fallbackCount = rand(4, 6);
              series = Array.from({ length: fallbackCount }, (_, i) => ({
                contentId: `mock-content-${Date.now()}-${i}`,
                title: `Content ${i + 1}`,
                potentialVisitors: 0,
                visitors: 0,
              }));
            }
            const minPotential = Math.max(
              Math.round(getEmployeeCount() * (MIN_POTENTIAL_FACTOR * 0.9)),
              200
            );
            const minVisitors = Math.max(Math.round(getEmployeeCount() * 0.05), 20);
            const maxVisitorsPct = 0.9;

            const mapped = series.map((item, idx) => {
              const potentialBase =
                item.potentialVisitors ||
                item.visitors ||
                Math.round(getEmployeeCount() * 0.15);
              const potential = Math.max(
                potentialBase,
                Math.round(potentialBase * scale),
                minPotential
              );
              const basePct = randFloat(0.34, 0.78);
              const jitter =
                randFloat(-0.05, 0.06) + ((idx % 3) * randFloat(0.01, 0.02));
              const pct = Math.min(0.88, Math.max(0.34, basePct + jitter));
              let visitors = Math.round(potential * pct);
              const floorVisitors = Math.max(Math.round(potential * 0.34), minVisitors);
              const capVisitors = Math.round(potential * maxVisitorsPct);
              visitors = Math.max(visitors, floorVisitors);
              visitors = Math.min(visitors, capVisitors, potential - 1);
              if (visitors < 1) visitors = 1;
              return {
                ...item,
                potentialVisitors: potential,
                visitors,
              };
            });

            mapped.sort((a, b) => b.visitors - a.visitors);
            data.rankingSeries = mapped;
            data.ranking = mapped;
            break;
          }
          case "VISIBILITY_ACCESSORS":
            if (data && typeof data.potentialVisitors === "number") {
              data.potentialVisitors = Math.max(
                data.potentialVisitors,
                Math.round(getEmployeeCount() * MIN_POTENTIAL_FACTOR)
              );
            }
            break;
        }
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (err) {
        console.error(
          INJECTED_LOG_PREFIX,
          "Error during interception for",
          url,
          "(" + matchedEndpointType + "):",
          err
        );
        return pageContextOriginalFetch.apply(this, args);
      }
    }
    return pageContextOriginalFetch.apply(this, args);
  };

  window.fetch = injectedCustomFetch;
  window.__REPLIFY_CAMPAIGNS_FETCH_APPLIED__ = true;
  
  forceRenderAlignmentChart();

  window.__REPLIFY_REVERT_CAMPAIGNS_FETCH__ = function () {
    if (window.fetch === injectedCustomFetch) {
      window.fetch = pageContextOriginalFetch;
      delete window.__REPLIFY_CAMPAIGNS_FETCH_APPLIED__;
      delete window.__REPLIFY_REVERT_CAMPAIGNS_FETCH__;
      console.log(
        INJECTED_LOG_PREFIX,
        "Fetch restored to page original by revert function."
      );
      return true;
    }
    return false;
  };
})();

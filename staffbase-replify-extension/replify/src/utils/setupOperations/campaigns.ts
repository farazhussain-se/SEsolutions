// setupOperations/campaigns.ts

const h = (token: string) => ({
  Authorization: `Basic ${token}`,
  "Content-Type": "application/json",
});

const CAMPAIGN_COLORS = ["#006cff", "#1d8713", "#d9380a", "#090d48", "#b22d5b", "#207d9f", "#974fe1"];

const PREDEFINED_CAMPAIGNS = [
  { title: "Company News", goal: "Keep employees informed on organizational updates and milestones." },
  { title: "Employee Spotlight", goal: "Celebrate team members and share their stories across the org." },
  { title: "Benefits & Wellbeing", goal: "Promote wellbeing programs and employee benefits awareness." },
  { title: "Learning & Development", goal: "Share training opportunities and professional growth resources." },
  { title: "Culture & Events", goal: "Highlight company culture, events, and community moments." },
  { title: "Leadership Updates", goal: "Deliver strategic messages and priorities from leadership." },
  { title: "HR Announcements", goal: "Communicate important HR policies, deadlines, and updates." },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function campaignsInstallation(domain: string, token: string) {
  const results: { success: Record<string, number>; errors: Record<string, string> } = { success: {}, errors: {} };

  const existingByTitle = new Map();
  try {
    const existingCampaignsRes = await fetch(`https://${domain}/api/campaigns?limit=200`, {
      credentials: "omit",
      headers: h(token),
    });
    if (existingCampaignsRes.ok) {
      const existingCampaignsData = await existingCampaignsRes.json();
      for (const campaign of (existingCampaignsData.data || [])) {
        const normalizedTitle = (campaign?.title || '').trim().toLowerCase();
        if (normalizedTitle && campaign?.id) {
          existingByTitle.set(normalizedTitle, campaign.id);
        }
      }
    } else {
      results.errors["Campaign Lookup"] = `Could not fetch existing campaigns (${existingCampaignsRes.status}); proceeding without reuse lookup`;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.errors["Campaign Lookup"] = `Could not fetch existing campaigns; proceeding without reuse lookup (${message})`;
  }

  // 1. Collect all unassigned post IDs across all channels
  const channelsRes = await fetch(`https://${domain}/api/branch/channels?limit=100`, {
    credentials: "omit",
    headers: h(token),
  });
  if (!channelsRes.ok) {
    results.errors["Channel Get Error"] = `Error getting channels (${channelsRes.status})`;
    return results;
  }
  const channelsData = await channelsRes.json();
  if (!channelsData.total || channelsData.total === 0) {
    results.errors["No Channels"] = "No channels found";
    return results;
  }

  const unassignedPostIds: string[] = [];
  for (const channel of channelsData.data) {
    const postsRes = await fetch(`https://${domain}/api/channels/${channel.id}/posts?limit=100`, {
      credentials: "omit",
      headers: h(token),
    });
    if (!postsRes.ok) continue;
    const postsData = await postsRes.json();
    if (!postsData.data) continue;
    for (const post of postsData.data) {
      if (!post.campaignId) unassignedPostIds.push(post.id);
    }
  }

  if (unassignedPostIds.length < 3) {
    results.errors["No Posts"] = "Not enough unassigned posts to create campaigns (need at least 3)";
    return results;
  }

  // 2. Shuffle posts and distribute across predefined campaigns (min 3 per campaign)
  const shuffled = shuffle(unassignedPostIds);
  const MIN_PER_CAMPAIGN = 3;
  const maxCampaigns = Math.min(PREDEFINED_CAMPAIGNS.length, Math.floor(shuffled.length / MIN_PER_CAMPAIGN));
  const campaignsToCreate = PREDEFINED_CAMPAIGNS.slice(0, maxCampaigns);

  // Distribute: give each campaign a roughly equal share
  const chunkSize = Math.floor(shuffled.length / campaignsToCreate.length);
  const chunks: string[][] = campaignsToCreate.map((_, i) => {
    const start = i * chunkSize;
    // Last campaign gets any remainder
    const end = i === campaignsToCreate.length - 1 ? shuffled.length : start + chunkSize;
    return shuffled.slice(start, end);
  });

  // 3. Create campaigns and assign posts
  const startAt = new Date().toISOString();
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);
  const endAt = endDate.toISOString();

  for (let i = 0; i < campaignsToCreate.length; i++) {
    const { title, goal } = campaignsToCreate[i];
    const postIds = chunks[i];
    const color = CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length];

    const normalizedTitle = title.trim().toLowerCase();
    let campaignId = existingByTitle.get(normalizedTitle);

    if (!campaignId) {
      const createRes = await fetch(`https://${domain}/api/campaigns`, {
        method: "POST",
        credentials: "omit",
        headers: h(token),
        body: JSON.stringify({ title, goal, color, startAt, endAt }),
      });
      if (!createRes.ok) {
        results.errors[`Create ${title}`] = `Failed to create campaign (${createRes.status})`;
        continue;
      }
      campaignId = (await createRes.json()).id;
      if (campaignId) {
        existingByTitle.set(normalizedTitle, campaignId);
      }
    }

    let count = 0;
    await Promise.all(
      postIds.map(async (postId) => {
        const res = await fetch(`https://${domain}/api/posts/${postId}`, {
          method: "PUT",
          credentials: "omit",
          headers: h(token),
          body: JSON.stringify({ campaignId }),
        });
        if (res.ok) count++;
      })
    );
    results.success[title] = count;
  }

  return results;
}


// setupOperations/microsoft.js

const headers = (token: string) => ({
  Authorization: `Basic ${token}`,
  "Content-Type": "application/json",
});

const MS365_FEATURES = [
  "search",
  "documentLibraryWidget",
  "filesWidget",
  "sitesWidget",
  "calendarWidget",
  "tasksWidget",
  "teamsOverviewWidget",
  "teamsFeedWidget",
  "fileViewerWidget",
  "vivaEngageCommunitiesWidget",
  "teamsCollaboration",
];

export async function microsoftInstallation(domain: string, token: string) {
  const base = `https://${domain}/api/branch/integrations`;

  // Activate MS365 connection (400 means already exists — ok)
  const activateRes = await fetch(`${base}/`, {
    method: "POST",
    credentials: "omit",
    headers: headers(token),
    body: JSON.stringify({
      id: "ms365",
      config: { isCustom: false, clientId: null, clientSecret: null },
    }),
  });
  if (!activateRes.ok && activateRes.status !== 400) {
    throw new Error(`Microsoft: failed to activate MS365 (${activateRes.status})`);
  }

  const added: string[] = [];
  const alreadyExist: string[] = [];
  const errors: string[] = [];

  for (const id of MS365_FEATURES) {
    const res = await fetch(`${base}/ms365/features`, {
      method: "POST",
      credentials: "omit",
      headers: headers(token),
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      added.push(id);
    } else if (res.status === 400) {
      alreadyExist.push(id);
    } else {
      errors.push(id);
    }
  }

  return { added, alreadyExist, errors };
}

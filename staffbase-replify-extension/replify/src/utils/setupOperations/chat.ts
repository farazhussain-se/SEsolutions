// setupOperations/chat.js

const headers = (token: string) => ({
  Authorization: `Basic ${token}`,
  "Content-Type": "application/json",
});

export async function chatInstallation(domain: string, token: string, branchId: string) {
  const url = `https://${domain}/api/spaces/${branchId}/installations`;

  const listRes = await fetch(url, {
    credentials: "omit",
    headers: headers(token),
  });
  if (!listRes.ok) throw new Error(`Chat: failed to list installations (${listRes.status})`);

  const listData = await listRes.json();
  const installed = (listData.data || []).some((p: { pluginID?: string }) => p.pluginID === "chat");
  if (installed) return "Chat is already installed";

  const createRes = await fetch(url, {
    method: "POST",
    credentials: "omit",
    headers: headers(token),
    body: JSON.stringify({
      accessorIDs: [branchId],
      config: {
        localization: { en_US: { title: "Chat" } },
        icon: "D",
      },
      pluginID: "chat",
      published: "now",
    }),
  });
  if (!createRes.ok) throw new Error(`Chat: failed to install (${createRes.status})`);
  return "Chat installed";
}

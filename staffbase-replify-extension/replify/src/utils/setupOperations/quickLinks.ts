// setupOperations/quickLinks.js
// mobileQuickLinks: { [menuItemTitle]: { title: string, position: number } }

type QuickLinkEntry = { title: string; position: number };
type QuickLinksMap = Record<string, QuickLinkEntry>;
type QuickLinkResults = { success: string[]; errors: Record<string, string> };

const fetchHeaders = (token: string) => ({
  Authorization: `Basic ${token}`,
  "Content-Type": "application/json;charset=utf-8",
});

async function patchMenuItem(
  domain: string,
  token: string,
  branchId: string,
  path: string,
  installationId: string,
  localization: unknown,
  visibility: string[],
  position: number
) {
  const res = await fetch(`https://${domain}/api/spaces/${branchId}/menu`, {
    method: "PATCH",
    credentials: "omit",
    headers: fetchHeaders(token),
    body: JSON.stringify([
      {
        op: "replace",
        path,
        installationId,
        value: {
          config: {
            localization,
            showInToolbar: true,
            toolbarPosition: position,
            logo: null,
            logoDark: null,
            logoDesktopMenu: null,
          },
          visibility,
        },
      },
    ]),
  });
  return res.ok;
}

async function disableMenuItem(
  domain: string,
  token: string,
  branchId: string,
  path: string,
  installationId: string
) {
  await fetch(`https://${domain}/api/spaces/${branchId}/menu`, {
    method: "PATCH",
    credentials: "omit",
    headers: fetchHeaders(token),
    body: JSON.stringify([
      {
        op: "replace",
        path,
        installationId,
        value: { config: { showInToolbar: false } },
      },
    ]),
  });
}

async function searchFolders(
  domain: string,
  token: string,
  branchId: string,
  folderId: string,
  parentPath: string,
  quickLinksMap: QuickLinksMap,
  results: QuickLinkResults
) {
  const res = await fetch(`https://${domain}/api/spaces/${branchId}/menu/${folderId}`, {
    credentials: "omit",
    headers: fetchHeaders(token),
  });
  if (!res.ok) return;

  const data = await res.json();
  const children = data.children;
  if (!children || children.total === 0) return;

  const items = children.data;
  for (let x = 0; x < items.length; x++) {
    const item = items[x];
    if (item.restrictedPluginID) continue;

    if (item.children && item.children.total > 0) {
      await searchFolders(domain, token, branchId, item.id, `${parentPath}/${x}`, quickLinksMap, results);
    }

    const langs = Object.keys(item.config.localization);
    const lastLangIdx = langs.length - 1;
    for (let li = 0; li < langs.length; li++) {
      const lang = langs[li];
      const title = item.config.localization[lang].title.toLowerCase().trim();
      if (quickLinksMap[title]) {
        item.config.localization[lang].shortTitle = quickLinksMap[title].title;
        const visibility = item.visibility.includes("mobile")
          ? item.visibility
          : [...item.visibility, "mobile"];
        const ok = await patchMenuItem(
          domain, token, branchId,
          `${parentPath}/${x}`,
          item.id,
          item.config.localization,
          visibility,
          quickLinksMap[title].position
        );
        if (ok) results.success.push(title);
        else results.errors[title] = `Error setting quick link for ${title}`;
        break;
      } else if (item.config.showInToolbar === true && li === lastLangIdx) {
        await disableMenuItem(domain, token, branchId, `${parentPath}/${x}`, item.id);
      }
    }
  }
}

export async function mobileQuickLinkInstallation(
  domain: string,
  token: string,
  branchId: string,
  mobileQuickLinks: QuickLinksMap
) {
  const results: QuickLinkResults = { success: [], errors: {} };

  // Normalize keys to lowercase
  const quickLinksMap: QuickLinksMap = {};
  for (const key of Object.keys(mobileQuickLinks)) {
    quickLinksMap[key.toLowerCase().trim()] = mobileQuickLinks[key];
  }

  const menuRes = await fetch(`https://${domain}/api/spaces/${branchId}/menu`, {
    credentials: "omit",
    headers: fetchHeaders(token),
  });
  if (!menuRes.ok) throw new Error(`QuickLinks: failed to get menu (${menuRes.status})`);
  const menu = await menuRes.json();

  const topItems = menu.children;
  if (!topItems || topItems.total === 0) return results;

  const items = topItems.data;
  for (let x = 0; x < items.length; x++) {
    const item = items[x];
    if (item.restrictedPluginID) continue;

    if (item.children && item.children.total > 0) {
      await searchFolders(domain, token, branchId, item.id, `/${x}`, quickLinksMap, results);
    }

    const langs = Object.keys(item.config.localization);
    const lastLangIdx = langs.length - 1;
    for (let li = 0; li < langs.length; li++) {
      const lang = langs[li];
      const title = item.config.localization[lang].title.toLowerCase().trim();
      if (quickLinksMap[title]) {
        item.config.localization[lang].shortTitle = quickLinksMap[title].title;
        const visibility = item.visibility.includes("mobile")
          ? item.visibility
          : [...item.visibility, "mobile"];
        const ok = await patchMenuItem(
          domain, token, branchId,
          `/${x}`,
          item.id,
          item.config.localization,
          visibility,
          quickLinksMap[title].position
        );
        if (ok) results.success.push(title);
        else results.errors[title] = `Error setting quick link for ${title}`;
        break;
      } else if (item.config.showInToolbar === true && li === lastLangIdx) {
        await disableMenuItem(domain, token, branchId, `/${x}`, item.id);
      }
    }
  }

  return results;
}

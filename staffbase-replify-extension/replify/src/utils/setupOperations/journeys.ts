// setupOperations/journeys.js

const JOURNEYS_DATABASE = {
  onboarding: {
    title: "Onboarding",
    associatedGroup: "New Employees",
    content: {
      instant: {
        title: "Welcome to your first day!",
        content: "<div data-widget-on-card=\"true\" data-widget-conf-background-overlay-color=\"rgba(255, 255, 255, 0.55)\" data-widget-conf-crop-height=\"1152\" data-widget-conf-crop-width=\"3456\" data-widget-conf-crop-origin-y=\"1595.5\" data-widget-conf-crop-origin-x=\"0\" data-widget-conf-background-image-url=\"https://cdn-de1.staffbase.com/eyo-live-de/image/upload/v1590739666/cztmbmKyKu8QwUbR8yMhhoMPLF3WHpptcNvubk9QrNm4DGfkoiKnrKA79OAAJljkfojUrfqviPwV6v0QgOxbJVv7U9NkVth8xQfH7hsKutFtCfbnE5dgzzKPnI6myoXENIbRygBhOlIio7KmwtaAESPSoHHyYlIoOmyeh2vqoK5fM2fT8o0Vg1NiK3UqFQoP/christian-perner-UKLIuV8rAks-unsplash.jpeg\" data-widget-conf-mobile-zone=\"49.888888888888886\" data-widget-type=\"HeroImage\" data-widget-src=\"internal://staffbase.content.widgets.HeroImage\"><div data-heading=\"\"><p><span style=\"color: #d30001;\">Welcome {{user.profile.firstName}},</span></p></div><div data-description=\"\"><p><strong><span style=\"color: #000000;\">It's great to have you with us!</span></strong></p></div></div><p>&nbsp;</p><div data-widget-conf-grid-type=\"66-33\" data-widget-type=\"Section\" data-widget-on-card=\"false\" data-widget-src=\"internal://staffbase.content.widgets.Section\"><div><div data-widget-type=\"StaticContent\" data-widget-on-card=\"false\" data-widget-conf-background-color=\"#ffffff\" data-widget-conf-design=\"2\" data-widget-title=\"Get to know (y)our app\" data-widget-src=\"internal://staffbase.content.widgets.StaticContent\"><p><span style=\"background-color: transparent; font-family: inherit;\">This app will connect you to your colleagues and the company! </span></p><p><span style=\"background-color: transparent; font-family: inherit;\">Here, you will be provided the most recent news, have access to important corporate documents and be able to give your feedback through surveys.&nbsp;</span></p><p><span style=\"background-color: transparent; font-family: inherit;\">Use this time to take a look around and get to know your personalized app! It has been created uniquely for you, and contains a lot of useful information.&nbsp;</span></p><p><span style=\"background-color: transparent; font-family: inherit;\"> </span><strong style=\"background-color: transparent; font-family: inherit;\">Enjoy the app!</strong></p><p>&nbsp;</p><div data-widget-conf-secondary-column-mode=\"true\" data-widget-conf-open-in-mobile-browser=\"false\" data-widget-conf-tile-text-color=\"#000000\" data-widget-conf-tile-bg-color=\"#f3f3f3\" data-widget-type=\"QuickLinks\" data-widget-conf-design=\"2\" data-widget-conf-type=\"tiles\" data-widget-title=\"Quicklinks\" data-widget-src=\"internal://staffbase.content.widgets.QuickLinks\"><ul><li><span class=\"icon we-icon\">A</span><a href=\"https://staffbase.com/en/\" data-title=\"App Settings\" tabindex=\"0\">App Settings</a></li><li><span class=\"icon we-icon\">?</span><a href=\"https://staffbase.com/en/\" data-title=\"Support / FAQ\" tabindex=\"0\">Support / FAQ</a></li><li><span class=\"icon we-icon\">h</span><a href=\"https://staffbase.com/en/\" data-title=\"Netiquette\" tabindex=\"0\">Netiquette</a></li></ul></div><p><strong>&nbsp;</strong></p></div></div><div><div data-widget-type=\"StaticContent\" data-widget-title=\"Your Profile\" data-widget-on-card=\"true\" data-widget-conf-background-color=\"#ffffff\" data-widget-conf-design=\"2\" data-widget-src=\"internal://staffbase.content.widgets.StaticContent\"><div data-widget-type=\"StaticContent\" data-widget-on-card=\"false\" data-widget-conf-background-color=\"#ffffff\" data-widget-conf-design=\"2\" data-widget-src=\"internal://staffbase.content.widgets.StaticContent\"><p style=\"text-align: center;\">{{user.profile.avatar-100}}</p><p style=\"text-align: center;\">Name:&nbsp;<br>{{user.profile.firstName}} {{user.profile.lastName}}<br><br>Location:<br>{{user.profile.location}}<br><br>Department:<br>{{user.profile.department}}</p></div><div data-widget-conf-open-in-mobile-browser=\"false\" data-widget-conf-text-color=\"#ffffff\" data-widget-conf-bg-color=\"#d00303\" data-widget-type=\"Button\" data-widget-conf-href=\"https://app.staffbase.com/profile/\" data-widget-src=\"internal://staffbase.content.widgets.Button\">Update profile</div></div></div></div>",
        teaser: "",
        image: null,
        dayOffset: null,
        timeOfDay: null,
        notificationChannels: ["email", "push"],
      },
      day3: {
        title: "Explore Additional Content",
        content: "<div data-widget-conf-grid-type=\"66-33\" data-widget-type=\"Section\" data-widget-on-card=\"false\" data-widget-src=\"internal://staffbase.content.widgets.Section\"><div><div data-widget-type=\"StaticContent\" data-widget-on-card=\"false\" data-widget-conf-background-color=\"#ffffff\" data-widget-conf-design=\"2\" data-widget-title=\"Did you know ...\" data-widget-src=\"internal://staffbase.content.widgets.StaticContent\"><p><span style=\"font-weight: 400;\">that there are several <strong>communities</strong> you can join on a voluntary basis?</span></p><p>There are a different groups for different interests, including one for tips on productivity and specifically for IT security.&nbsp;</p><p>To check out more content you can subscribe to:&nbsp;</p><ul><li>open your <em>personal menu</em></li><li>click on <em>my groups</em><br><br><a class=\"internal-link colored clickable\" style=\"background-color: transparent; font-family: inherit;\" href=\"https://app.staffbase.com/settings/groups\" target=\"_blank\" rel=\"nofollow noopener\">Check it out</a></li></ul><p>&nbsp;</p><p><strong>Enjoy!</strong></p></div></div><div><div data-widget-conf-design=\"2\" data-widget-conf-background-color=\"#ffffff\" data-widget-on-card=\"false\" data-widget-title=\"Communities\" data-widget-type=\"StaticContent\" data-widget-src=\"internal://staffbase.content.widgets.StaticContent\"><p><img src=\"https://cdn-de1.staffbase.com/eyo-live-de/image/upload/v1590746074/NxUh4WC4HgtEgJx7Qabkeuq41cytpa6EIxcT3MVXpYgp4l0ezmxFVArl6pTCYMYJgmdKwUgEUR6FqUjxVdGyK2d5K1Q6VSYfMiSm5YGoZNRXjLWTO7GDA3cwHIsuQpJKuKwBFUqPw8IbnUi846tJCZqhd8KjOtPztsLPxnFWz1MPu52I7akmPc83c4Kwpi35/Bildschirmfoto%202020-05-29%20um%2011.54.png\" height=\"688\" width=\"657\" data-original-height=\"688\" data-original-width=\"657\"></p></div><div data-widget-conf-open-in-mobile-browser=\"false\" data-widget-conf-text-color=\"#ffffff\" data-widget-conf-bg-color=\"#d00303\" data-widget-conf-href=\"https://app.staffbase.com/\" data-widget-type=\"Button\" data-widget-src=\"internal://staffbase.content.widgets.Button\">Show all communities</div></div></div>",
        teaser: "",
        image: null,
        dayOffset: 2,
        timeOfDay: 43500000,
        notificationChannels: ["email", "push"],
      },
      day5: {
        title: "Personalize your experience",
        content: "<div data-widget-type=\"StaticContent\" data-widget-on-card=\"false\" data-widget-conf-background-color=\"#ffffff\" data-widget-conf-design=\"2\" data-widget-title=\"Did you know ...\" data-widget-src=\"internal://staffbase.content.widgets.StaticContent\"><p><span style=\"font-weight: 400;\">1) that you can <strong>mention your colleagues</strong> in comments?</span></p><p>Simply use the <strong>@</strong> followed by the name (e.g. @John) and pick the right person. John will be notified and can easily join the discussion or simply don't miss something he should know about.&nbsp;&nbsp;</p><p>2) that you can<strong> translate posts and comments</strong> if needed?</p><p><span style=\"background-color: transparent; font-family: inherit;\">If you see a post or comment that is not in your language, you can easily translate it using the \"see translation\" button on a post. It will translate the content automatically into your app language!</span></p><p><strong style=\"background-color: transparent; font-family: inherit;\">Enjoy!</strong></p></div><p>&nbsp;</p><div><div data-widget-type=\"StaticContent\" data-widget-title=\"@Fiona look at this!\" data-widget-on-card=\"false\" data-widget-conf-background-color=\"#ffffff\" data-widget-conf-design=\"2\" data-widget-src=\"internal://staffbase.content.widgets.StaticContent\"><p><img src=\"https://cdn-de1.staffbase.com/eyo-live-de/image/upload/c_crop,w_2305,h_2305,x_548/v1591278954/uZADpDtLzFvjTA8mEjlmmc5MkRnNGEgks9cDcBhBzglXybJeLjm24gB7XrfhBt5AV33dcSzRg5GTBxbeDu5H5wBSEG6z3BohBdJxKAkZKzxLwug1AgwTHKul8VyZmdODJbyTj7CqhOzMvEc5A6a6r2hsxI8jLg4Y4l3olvrc3IOZ9MoO3ZSX0VtZc8eN50mQ/meghan-schiereck-_XFObcM_7KU-unsplash.jpeg\"></p></div></div>",
        teaser: "",
        image: null,
        dayOffset: 4,
        timeOfDay: 43500000,
        notificationChannels: ["email", "push"],
      },
      day7: {
        title: "Bookmark important posts",
        content: "<div data-widget-type=\"Section\" data-widget-conf-grid-type=\"66-33\" data-widget-taype=\"Section\" data-widget-on-card=\"false\" data-widget-src=\"internal://staffbase.content.widgets.Section\"><div><div data-widget-type=\"StaticContent\" data-widget-on-card=\"false\" data-widget-conf-background-color=\"#ffffff\" data-widget-conf-design=\"2\" data-widget-title=\"Did you know ...\" data-widget-src=\"internal://staffbase.content.widgets.StaticContent\"><p><span style=\"font-weight: 400;\">that you can <strong>bookmark</strong>&nbsp;posts?</span></p><p>Simply click the bookmark button below a post. You can a<span style=\"background-color: transparent; font-family: inherit;\">ccess your bookmarks via your personal menu at any time.<br><br></span><strong style=\"background-color: transparent; font-family: inherit;\">Enjoy bookmarking!</strong></p></div></div><div><div data-widget-type=\"StaticContent\" data-widget-on-card=\"false\" data-widget-conf-background-color=\"#ffffff\" data-widget-conf-design=\"2\" data-widget-src=\"internal://staffbase.content.widgets.StaticContent\"><p><img src=\"https://cdn-de1.staffbase.com/eyo-live-de/image/upload/c_crop,w_376,h_598/v1590753520/b8FmCteY0Dk3kAv6qK47Kj1XB1LKJZdLszPRkXuZBSynSXiGZNk5WoI9BRFZAlo33KF8ESSjUoIvsr04admWsiryiMQqEmGA2IdkE9fjBsIEhBpc14oHAi1fy0M8iIbbXB3yDO69zFIDZh821zvFRHZc8ny3gExXSXNhBorNflOFQNTSgycvrohDMhjgNI4f/Bildschirmfoto%202020-05-29%20um%2013.58.png\" data-original-width=\"376\" data-original-height=\"598\"></p></div></div></div>",
        teaser: "",
        image: null,
        dayOffset: 6,
        timeOfDay: 43500000,
        notificationChannels: ["email", "push"],
      },
      day30: {
        title: "Feedback Wanted 🤩🤩🤩🤩🤩🤩🤩🤩🤩🤩",
        content: "<div data-widget-type=\"StaticContent\" data-widget-on-card=\"false\" data-widget-conf-background-color=\"#ffffff\" data-widget-conf-design=\"2\" data-widget-title=\"Feedback\" data-widget-src=\"internal://staffbase.content.widgets.StaticContent\"><p>We would love to hear your feedback on your onboarding experience!</p></div>",
        teaser: "",
        image: null,
        dayOffset: 29,
        timeOfDay: 43500000,
        notificationChannels: ["email", "push"],
      },
    },
  },
};

const h = (token: string) => ({
  Authorization: `Basic ${token}`,
  "Content-Type": "application/json",
});

export async function journeysInstallation(domain: string, token: string, branchId: string, desiredJourneys: string[], userId: string) {
  const created: string[] = [];
  const alreadyExists: string[] = [];
  const errors: Record<string, string[]> = {};

  // Get existing journeys
  const journeysRes = await fetch(
    `https://${domain}/api/installations/administrated?pluginID=journeys`,
    { credentials: "omit", headers: h(token) }
  );
  if (!journeysRes.ok) throw new Error(`Journeys: failed to list journeys (${journeysRes.status})`);
  const journeysData = await journeysRes.json();

  const existingJourneyNames: string[] = [];
  if (journeysData.total > 0) {
    for (const j of journeysData.data) {
      const enTitle = j.config?.localization?.en_US?.title?.toLowerCase().trim();
      if (enTitle && enTitle in JOURNEYS_DATABASE) existingJourneyNames.push(enTitle);
    }
  }

  const allKeys = Object.keys(JOURNEYS_DATABASE);
  let toCreate = desiredJourneys[0] === "all" ? allKeys : desiredJourneys;
  toCreate = toCreate.filter((key) => {
    if (existingJourneyNames.includes(key)) {
      alreadyExists.push(key);
      return false;
    }
    return true;
  });

  // Get existing groups
  const groupsRes = await fetch(`https://${domain}/api/branch/groups`, {
    credentials: "omit",
    headers: h(token),
  });
  if (!groupsRes.ok) throw new Error(`Journeys: failed to list groups (${groupsRes.status})`);
  const groupsData = await groupsRes.json();
  const existingGroups: Record<string, string> = {};
  if (groupsData.total > 0) {
    for (const g of groupsData.data) existingGroups[g.name.toLowerCase()] = g.id;
  }

  for (const journeyKey of toCreate) {
    const journey = JOURNEYS_DATABASE[journeyKey as keyof typeof JOURNEYS_DATABASE];
    errors[journey.title] = [];

    // Create or reuse group
    let groupId;
    const groupNameLower = journey.associatedGroup.toLowerCase();
    if (existingGroups[groupNameLower]) {
      groupId = existingGroups[groupNameLower];
      errors[journey.title].push(`Warning: Group "${journey.associatedGroup}" already exists, reusing it.`);
    } else {
      const groupRes = await fetch(`https://${domain}/api/branch/groups`, {
        method: "POST",
        credentials: "omit",
        headers: h(token),
        body: JSON.stringify({
          type: "enumeration",
          config: {
            localization: {
              de_DE: { title: journey.associatedGroup },
              en_US: { title: journey.associatedGroup },
            },
          },
          name: journey.associatedGroup,
          accessorIDs: [],
        }),
      });
      if (!groupRes.ok) {
        errors[journey.title].push(`Error creating group for ${journey.title}`);
        continue;
      }
      groupId = (await groupRes.json()).id;
    }

    // Add user to group
    const addUserRes = await fetch(`https://${domain}/api/groups/${groupId}/users`, {
      method: "POST",
      credentials: "omit",
      headers: h(token),
      body: JSON.stringify([userId]),
    });
    if (!addUserRes.ok) {
      errors[journey.title].push(`Warning: could not add user to group for ${journey.title}`);
    }

    // Create journey installation
    const installRes = await fetch(`https://${domain}/api/spaces/${branchId}/installations`, {
      method: "POST",
      credentials: "omit",
      headers: h(token),
      body: JSON.stringify({
        accessorIDs: [branchId],
        config: { localization: { en_US: { title: journey.title } } },
        pluginID: "journeys",
      }),
    });
    if (!installRes.ok) {
      errors[journey.title].push(`Error creating ${journey.title} journey`);
      continue;
    }
    const journeyId = (await installRes.json()).id;

    // Set journey settings
    const settingsRes = await fetch(`https://${domain}/api/installations/${journeyId}`, {
      method: "POST",
      credentials: "omit",
      headers: h(token),
      body: JSON.stringify({
        includeExisting: true,
        journeyType: "joinGroup",
        multipleExecutions: false,
        recipientIds: [groupId],
      }),
    });
    if (!settingsRes.ok) {
      errors[journey.title].push(`Error setting settings for ${journey.title} journey`);
      continue;
    }

    // Add journey steps
    for (const stepKey of Object.keys(journey.content)) {
      const step = (journey.content as Record<string, typeof journey.content[keyof typeof journey.content]>)[stepKey];
      const stepRes = await fetch(`https://${domain}/api/branch/journeys/${journeyId}/posts`, {
        method: "POST",
        credentials: "omit",
        headers: h(token),
        body: JSON.stringify({
          contents: {
            en_US: {
              title: step.title,
              content: step.content,
              teaser: step.teaser,
              image: step.image,
            },
          },
          dayOffset: step.dayOffset,
          timeOfDay: step.timeOfDay,
          notificationChannels: step.notificationChannels,
        }),
      });
      if (!stepRes.ok) {
        errors[journey.title].push(`Error adding step "${step.title}"`);
      }
    }

    // Publish journey
    const publishRes = await fetch(`https://${domain}/api/installations/${journeyId}`, {
      method: "POST",
      credentials: "omit",
      headers: h(token),
      body: JSON.stringify({ published: "now" }),
    });
    if (!publishRes.ok) {
      errors[journey.title].push(`Warning: could not publish ${journey.title} journey`);
    }

    created.push(journey.title);
  }

  // Journey Navigator
  const navRes = await fetch(`https://${domain}/api/branch/journeys/navigator`, {
    credentials: "omit",
    headers: h(token),
  });
  if (!navRes.ok && navRes.status === 404) {
    const createNavRes = await fetch(`https://${domain}/api/branch/journeys/navigator`, {
      method: "POST",
      credentials: "omit",
      headers: h(token),
      body: JSON.stringify({ localization: { en_US: { title: "My Tasks" } } }),
    });
    if (createNavRes.ok) created.push("Journey Navigator");
    else errors["Journey Navigator"] = ["Error creating Journey Navigator"];
  } else if (navRes.ok) {
    alreadyExists.push("Journey Navigator");
  }

  // Add Journey Navigator quick link
  const qlRes = await fetch(`https://${domain}/api/branch/quicklinks/?platform=desktop`, {
    credentials: "omit",
    headers: h(token),
  });
  if (qlRes.ok) {
    const qlData = await qlRes.json();
    const links = (qlData.data || []).map((q: { link: string }) => q.link);
    if (!links.includes(`https://${domain}/journey-navigator`)) {
      const addQlRes = await fetch(`https://${domain}/api/branch/quicklinks/`, {
        method: "POST",
        credentials: "omit",
        headers: h(token),
        body: JSON.stringify({
          platform: "desktop",
          link: `https://${domain}/journey-navigator`,
          accessorIds: [branchId],
          localization: { en_US: { name: "My Journey" } },
          icon: "\uE85B",
          priority: 2,
        }),
      });
      if (addQlRes.ok) created.push("Journey Navigator Quicklink");
      else errors["Journey Navigator Quicklink"] = ["Error adding Journey Navigator Quicklink"];
    } else {
      alreadyExists.push("Journey Navigator Quicklink");
    }
  }

  // Add Journey Navigator to Links Plugin
  const linksRes = await fetch(
    `https://${domain}/api/installations/administrated?pluginID=link&spaceIDs=${branchId}`,
    { credentials: "omit", headers: h(token) }
  );
  if (linksRes.ok) {
    const linksData = await linksRes.json();
    const navUrl = `https://${domain}/journey-navigator`;
    const alreadyInLinks = (linksData.data || []).some((l: { targetURL: string }) => l.targetURL === navUrl);
    if (!alreadyInLinks) {
      const addLinkRes = await fetch(`https://${domain}/api/spaces/${branchId}/installations`, {
        method: "POST",
        credentials: "omit",
        headers: h(token),
        body: JSON.stringify({
          pluginID: "link",
          config: {
            icon: "\uE85B",
            localization: { en_US: { title: "Journey Navigator" } },
          },
          accessorIDs: [branchId],
          targetURL: navUrl,
          published: "now",
        }),
      });
      if (addLinkRes.ok) created.push("Journey Navigator Link");
      else errors["Journey Navigator Link"] = ["Error adding Journey Navigator to Links Plugin"];
    } else {
      alreadyExists.push("Journey Navigator Link");
    }
  }

  return { created, alreadyExists, errors };
}

// setupOperations/launchpad.js

const APPLICATION_DATABASE = {
  sharepoint: {
    title: "Sharepoint",
    url: "https://www.office.com/",
    description: "File Repo, M365, Microsoft, Sites",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT22iB5t3WegsRmXagULwbpL_eA1cCD1naqcg&s",
  },
  teams: {
    title: "Teams",
    url: "https://www.microsoft.com/en-ca/microsoft-teams/log-in",
    description: "Collaboration, Chat, Video Call, Messaging, Livestreaming, Files, Viva",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Microsoft_Office_Teams_%282025%E2%80%93present%29.svg/960px-Microsoft_Office_Teams_%282025%E2%80%93present%29.svg.png",
  },
  outlook: {
    title: "Outlook",
    url: "https://outlook.office.com/mail/",
    description: "Email, Microsoft, Mail",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Outlook.com_icon_%282012-2019%29.svg/2028px-Outlook.com_icon_%282012-2019%29.svg.png",
  },
  word: {
    title: "Word",
    url: "https://www.microsoft.com/en-us/microsoft-365/word",
    description: "Notes, Document, Document Creation, Files",
    image: "https://mailmeteor.com/logos/assets/PNG/Microsoft_Office_Word_Logo_512px.png",
  },
  powerpoint: {
    title: "Powerpoint",
    url: "https://www.microsoft.com/en-us/microsoft-365/powerpoint",
    description: "Slides, Presentations",
    image: "https://cdn.pixabay.com/photo/2021/01/30/12/18/powerpoint-5963677_1280.png",
  },
  excel: {
    title: "Excel",
    url: "https://www.microsoft.com/en-us/microsoft-365/excel",
    description: "Sheets, Database, Data, Data Management",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Microsoft_Excel_2013-2019_logo.svg/1200px-Microsoft_Excel_2013-2019_logo.svg.png",
  },
  workday: {
    title: "Workday",
    url: "https://www.workday.com/en-us/signin.html",
    description: "HRIS, HR, Payroll, Absence, Timeoff",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSLFIDB0yG0-HK-KtPAhiDOwrW-bBVmju65ug&s",
  },
  confluence: {
    title: "Confluence",
    url: "https://mitarbeiterapp.atlassian.net/wiki/spaces/EC/overview",
    description: "Documents, How-to, Instructions, Knowledge Management",
    image: "https://cdn.worldvectorlogo.com/logos/confluence-1.svg",
  },
  salesforce: {
    title: "Salesforce",
    url: "https://mitarbeiterapp.atlassian.net/wiki/",
    description: "CRM, Sales, Deals, Accounts",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Salesforce.com_logo.svg/3840px-Salesforce.com_logo.svg.png",
  },
  slack: {
    title: "Slack",
    url: "https://slack.com/ssb/first",
    description: "Collaboration, Chat, Video Call, Messaging",
    image: "https://cdn.freebiesupply.com/logos/large/2x/slack-logo-icon.png",
  },
  zoom: {
    title: "Zoom",
    url: "https://zoom.us/signin",
    description: "Video meeting, livestream",
    image: "https://t4.ftcdn.net/jpg/03/75/33/61/360_F_375336103_KQSAG9rQuOgdSx01GNIPK9abZaIeGoGR.jpg",
  },
  ukg: {
    title: "UKG",
    url: "https://www.ukg.com/",
    description: "HRIS, HR, Payroll, Absence, Timeoff",
    image: "https://assets.wheelhouse.com/media/_solution_logo_07202023_49710648.jpeg",
  },
  servicenow: {
    title: "ServiceNow",
    url: "https://www.servicenow.com/",
    description: "Ticketing, IT, Helpdesk, Service Help",
    image: "https://play-lh.googleusercontent.com/HdfHZ5jnfMM1Ep7XpPaVdFIVSRx82wKlRC_qmnHx9H1E4aWNp4WKoOcH0x95NAnuYg",
  },
  drive: {
    title: "Drive",
    url: "https://workspace.google.com/products/drive/",
    description: "Files, Storage, Knowledge Repo",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ3RaendkWxwbnlsA8UyDPmcDbqIMQETxKYpw&s",
  },
  docs: {
    title: "Docs",
    url: "https://docs.google.com/document/u/0/",
    description: "Notes, Document, Document Creation, Files",
    image: "https://storage.googleapis.com/gweb-uniblog-publish-prod/original_images/Google_Docs.png",
  },
  slides: {
    title: "Slides",
    url: "https://workspace.google.com/products/slides/",
    description: "Presentations, Slides, Presentation",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Google_Slides_logo_%282014-2020%29.svg/960px-Google_Slides_logo_%282014-2020%29.svg.png",
  },
  sheets: {
    title: "Sheets",
    url: "https://workspace.google.com/products/sheets/",
    description: "Sheets, Database, Data, Data Management",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSxViZyCe5Vg6NrNijiTsdXSJy9Nt-0_TcvtA&s",
  },
  travelperk: {
    title: "Travelperk",
    url: "https://www.travelperk.com/",
    description: "Travel, Expenses",
    image: "https://play-lh.googleusercontent.com/fje71aZ6jMNWsWuIGmkealWptgM90xetbUgAPBNnZ2ighWqCYLpJjNogEZR8ar_2UCse",
  },
  jira: {
    title: "Jira",
    url: "https://jira.com",
    description: "Ticketing",
    image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSZ3jgHFfaTrS0P36OtkWQwMtRShBYoVXIVug&s",
  },
};

const headers = (token: string) => ({
  Authorization: `Basic ${token}`,
  "Content-Type": "application/json",
});

export async function launchpadInstallation(domain: string, token: string, branchId: string, desiredApps: string[]) {
  const url = `https://${domain}/api/branch/launchpad/apps`;

  const listRes = await fetch(url, {
    credentials: "omit",
    headers: headers(token),
  });
  if (!listRes.ok) throw new Error(`Launchpad: failed to list apps (${listRes.status})`);
  const listData = await listRes.json();

  let existingTitles: string[] = [];
  if (listData.total > 0) {
    existingTitles = listData.data.map((app: { content: Record<string, { title: string }> }) => {
      const firstLang = Object.keys(app.content)[0];
      return app.content[firstLang].title.toLowerCase().trim();
    });
  }

  const allKeys = Object.keys(APPLICATION_DATABASE);
  let toAdd = desiredApps[0] === "all" ? allKeys : desiredApps;
  toAdd = toAdd.filter((key) => !existingTitles.includes(key.toLowerCase().trim()));

  const added: string[] = [];
  const notAdded: string[] = [];

  await Promise.all(
    toAdd.map(async (key) => {
      const app = APPLICATION_DATABASE[key as keyof typeof APPLICATION_DATABASE];
      if (!app) {
        notAdded.push(`${key} (not available)`);
        return;
      }
      const res = await fetch(url, {
        method: "POST",
        credentials: "omit",
        headers: headers(token),
        body: JSON.stringify({
          url: app.url,
          image: app.image,
          accessorIds: [branchId],
          enforceNewWindow: false,
          content: { en_US: { title: app.title, description: app.description } },
          visibility: ["desktop", "mobile"],
        }),
      });
      if (res.ok) added.push(app.title);
      else notAdded.push(app.title);
    })
  );

  return { added, notAdded };
}

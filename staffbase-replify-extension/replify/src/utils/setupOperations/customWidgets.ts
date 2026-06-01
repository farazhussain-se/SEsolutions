// setupOperations/customWidgets.js

const CUSTOM_WIDGETS = [
  {
    name: "staffbase-stock-ticker",
    url: "https://eirastaffbase.github.io/stock-ticker/dist/staffbase.stock-ticker.js",
  },
  {
    name: "staffbase-job-postings",
    url: "https://eirastaffbase.github.io/job-postings/dist/staffbase.job-postings.js",
  },
  {
    name: "eira-weather-time",
    url: "https://eirastaffbase.github.io/weather-time/dist/eira.weather-time.js",
  },
  {
    name: "maximize-it-countup",
    url: "https://maximizeit.github.io/sb-custom-widget-countup/dist/maximize-it.custom-widget-countup.js",
  },
  {
    name: "maximize-it-countdown",
    url: "https://maximizeit.github.io/sb-custom-widget-countdown/dist/maximize-it.custom-widget-countdown.js",
  },
  {
    name: "staffbase-salesforce-viewer",
    url: "https://eirastaffbase.github.io/widgets/salesforce-viewer/dist/staffbase.salesforce-viewer.js",
  },
  {
    name: "staffbase-static-tasks",
    url: "https://eirastaffbase.github.io/widgets/static-tasks/dist/staffbase.static-tasks.js",
  },
  {
    name: "staffbase-shift-viewer",
    url: "https://eirastaffbase.github.io/widgets/shift-viewer/dist/staffbase.shift-viewer.js",
  },
];

export async function customWidgetsInstallation(domain: string, token: string) {
  const url = `https://${domain}/api/branch/widgets`;
  const results: { added: string[]; errors: string[] } = { added: [], errors: [] };

  for (const widget of CUSTOM_WIDGETS) {
    const res = await fetch(url, {
      method: "POST",
      credentials: "omit",
      headers: {
        Authorization: `Basic ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: widget.url,
        elements: [widget.name],
        attributes: [],
      }),
    });
    if (res.ok) {
      results.added.push(widget.name);
    } else {
      results.errors.push(`${widget.name} (${res.status})`);
    }
  }

  return results;
}

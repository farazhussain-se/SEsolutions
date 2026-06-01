// setupOperations/emailTemplates.js

import ceoExecutive from "./templatePayloads/ceo-executive-template.json";
import fromProductWithLove from "./templatePayloads/from-product-with-love.json";
import importantCompanyUpdate from "./templatePayloads/important-company-update.json";
import leadershipUpdate from "./templatePayloads/leadership-update.json";
import longFormNewsletter from "./templatePayloads/long-form-newsletter.json";
import notesFromJeremiah from "./templatePayloads/notes-from-jeremiah.json";
import organizationalUpdate from "./templatePayloads/organizational-update.json";

interface EmailTemplate {
  title: string;
  imgSrcs?: string[];
  thumbnailUrl?: string;
  content: unknown;
}

const TEMPLATES: EmailTemplate[] = [
  ceoExecutive,
  fromProductWithLove,
  importantCompanyUpdate,
  leadershipUpdate,
  longFormNewsletter,
  notesFromJeremiah,
  organizationalUpdate,
];

const h = (token: string) => ({
  Authorization: `Basic ${token}`,
  "Content-Type": "application/json",
});

function replaceSrcUrls(obj: unknown, urls: string[]): unknown {
  let idx = 0;
  function traverse(node: Record<string, unknown>) {
    for (const key in node) {
      if (typeof node[key] === "object" && node[key] !== null) {
        traverse(node[key] as Record<string, unknown>);
      } else if (key === "src" && node[key] === "replace me") {
        node[key] = urls[idx++];
      }
    }
  }
  traverse(obj as Record<string, unknown>);
  return obj;
}

export async function emailTemplatesInstallation(domain: string, token: string) {
  const results: { added: string[]; alreadyExist: string[]; errors: string[] } = {
    added: [],
    alreadyExist: [],
    errors: [],
  };

  // Get accessorIDs from spaces
  const spacesRes = await fetch(`https://${domain}/api/spaces`, {
    credentials: "omit",
    headers: h(token),
  });
  if (!spacesRes.ok) throw new Error(`Email templates: failed to get spaces (${spacesRes.status})`);
  const spacesData = await spacesRes.json();
  const accessorIDs = spacesData.data?.[0]?.accessorIDs;
  if (!accessorIDs) throw new Error("Email templates: could not get accessorIDs from spaces");

  // Get or create "Default Template Gallery"
  const galleryRes = await fetch(`https://${domain}/api/email-service/galleries?limit=100`, {
    credentials: "omit",
    headers: h(token),
  });
  if (!galleryRes.ok) throw new Error(`Email templates: failed to get galleries (${galleryRes.status})`);
  const galleryData = await galleryRes.json();

  let galleryId = galleryData.data?.find((g: { name: string; id: string }) => g.name === "Default Template Gallery")?.id;

  if (!galleryId) {
    const createGalleryRes = await fetch(`https://${domain}/api/email-service/galleries?limit=20`, {
      method: "POST",
      credentials: "omit",
      headers: h(token),
      body: JSON.stringify({
        name: "Default Template Gallery",
        description: "Pre-defined Templates for your needs",
        accessorIds: accessorIDs,
        adminIds: accessorIDs,
      }),
    });
    if (!createGalleryRes.ok)
      throw new Error(`Email templates: failed to create gallery (${createGalleryRes.status})`);
    galleryId = (await createGalleryRes.json()).id;
  }

  // Get existing template names
  const existingRes = await fetch(
    `https://${domain}/api/email-service/templates?limit=100&galleryId=${galleryId}`,
    { credentials: "omit", headers: h(token) }
  );
  if (!existingRes.ok)
    throw new Error(`Email templates: failed to get existing templates (${existingRes.status})`);
  const existingData = await existingRes.json();
  const existingNames: string[] = (existingData.data || []).map((t: { name: string }) => t.name);

  // Process each template
  for (const template of TEMPLATES) {
    const { title, imgSrcs, content, thumbnailUrl } = template;

    if (existingNames.includes(title)) {
      results.alreadyExist.push(title);
      continue;
    }

    try {
      // Create template
      const createRes = await fetch(`https://${domain}/api/email-service/templates`, {
        method: "POST",
        credentials: "omit",
        headers: h(token),
        body: JSON.stringify({ galleryId, name: title, renderingMode: "designer" }),
      });
      if (!createRes.ok) {
        results.errors.push(`${title}: failed to create template (${createRes.status})`);
        continue;
      }
      const templateId = (await createRes.json()).id;

      // Replace image placeholders with GCP source URLs directly (no re-upload needed)
      const contentCopy = JSON.parse(JSON.stringify(content));
      const filledContent = replaceSrcUrls(contentCopy, imgSrcs || []);

      const putRes = await fetch(
        `https://${domain}/api/email-service/templates/${templateId}/contents/pikasso`,
        {
          method: "PUT",
          credentials: "omit",
          headers: h(token),
          body: JSON.stringify({ content: filledContent }),
        }
      );
      if (!putRes.ok) {
        results.errors.push(`${title}: failed to add content (${putRes.status})`);
        continue;
      }

      // Set thumbnail if present (use source URL directly)
      if (thumbnailUrl) {
        await fetch(`https://${domain}/api/email-service/templates/${templateId}`, {
          method: "PATCH",
          credentials: "omit",
          headers: h(token),
          body: JSON.stringify({ thumbnailUrl }),
        }).catch(() => {}); // Non-fatal
      }

      results.added.push(title);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.errors.push(`${title}: ${message}`);
    }
  }

  return results;
}

import { chatInstallation } from "./setupOperations/chat.js";
import { microsoftInstallation } from "./setupOperations/microsoft.js";
import { launchpadInstallation } from "./setupOperations/launchpad.js";
import { customWidgetsInstallation } from "./setupOperations/customWidgets.js";
import { mobileQuickLinkInstallation } from "./setupOperations/quickLinks.js";
import { journeysInstallation } from "./setupOperations/journeys.js";
import { campaignsInstallation } from "./setupOperations/campaigns.js";
import { emailTemplatesInstallation } from "./setupOperations/emailTemplates.js";

type ProgressCallback = (message: string) => void;

interface JourneyOptions {
  user: string;
  desired: string[];
}

type MobileQuickLinks = Record<string, { title: string; position: number }>;

export interface SetupOptions {
  domain: string;
  token: string;
  branchId: string;
  chat: boolean;
  microsoft: boolean;
  campaigns: boolean;
  launchpad: string[];
  customWidgets: boolean;
  mobileQuickLinks: MobileQuickLinks | null;
  journeys: JourneyOptions | null;
  emailTemplates: boolean;
  onProgress?: ProgressCallback;
}

export type SetupReport = Record<string, unknown>;

export async function runSetup(options: SetupOptions): Promise<SetupReport> {
  const {
    domain,
    token,
    branchId,
    chat,
    microsoft,
    campaigns,
    launchpad,
    customWidgets,
    mobileQuickLinks,
    journeys,
    emailTemplates,
    onProgress = () => {},
  } = options;

  const report: SetupReport = {};

  if (chat) {
    onProgress("Setting up Chat...");
    try {
      report.chat = await chatInstallation(domain, token, branchId);
    } catch (err) {
      report.chat = `Error: ${(err as Error).message}`;
    }
  }

  if (microsoft) {
    onProgress("Setting up Microsoft 365...");
    try {
      report.microsoft = await microsoftInstallation(domain, token);
    } catch (err) {
      report.microsoft = `Error: ${(err as Error).message}`;
    }
  }

  if (launchpad && launchpad.length > 0) {
    onProgress("Setting up Launchpad...");
    try {
      report.launchpad = await launchpadInstallation(
        domain,
        token,
        branchId,
        launchpad
      );
    } catch (err) {
      report.launchpad = `Error: ${(err as Error).message}`;
    }
  }

  if (customWidgets) {
    onProgress("Registering Custom Widgets...");
    try {
      report.customWidgets = await customWidgetsInstallation(domain, token);
    } catch (err) {
      report.customWidgets = `Error: ${(err as Error).message}`;
    }
  }

  if (mobileQuickLinks) {
    onProgress("Setting up Mobile Quick Links...");
    try {
      report.mobileQuickLinks = await mobileQuickLinkInstallation(
        domain,
        token,
        branchId,
        mobileQuickLinks
      );
    } catch (err) {
      report.mobileQuickLinks = `Error: ${(err as Error).message}`;
    }
  }

  if (journeys) {
    onProgress("Setting up Journeys...");
    try {
      report.journeys = await journeysInstallation(
        domain,
        token,
        branchId,
        journeys.desired,
        journeys.user
      );
    } catch (err) {
      report.journeys = `Error: ${(err as Error).message}`;
    }
  }

  if (campaigns) {
    onProgress("Setting up Campaigns (AI-powered)...");
    try {
      report.campaigns = await campaignsInstallation(domain, token);
    } catch (err) {
      report.campaigns = `Error: ${(err as Error).message}`;
    }
  }

  if (emailTemplates) {
    onProgress("Setting up Email Templates...");
    try {
      report.emailTemplates = await emailTemplatesInstallation(domain, token);
    } catch (err) {
      report.emailTemplates = `Error: ${(err as Error).message}`;
    }
  }

  return report;
}

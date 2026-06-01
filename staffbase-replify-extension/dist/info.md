## Replify for Staffbase

_Replify_ is an internal Chrome extension that helps Staffbase Solutions teams brand their demo environments with one click. It lets you:

- Personalize colors, logo, and background image from a side panel  
- Preview changes live  
- Save and reuse environment tokens  
- Import LinkedIn posts  
- Set up new demo instances programmatically  

---

## Overview

Replify streamlines demo preparation by combining branding, content import, and environment setup in a single tool. Once authenticated with your Staffbase admin API key, you can:

1. Brand an existing environment  
2. Configure a new environment from scratch  

All settings are stored locally so you can switch between projects without re-entering tokens.

---

## Usage

1. Navigate to a Staffbase demo environment (URL under `app.staffbase.com`).
2. Click the Replify icon or open the side panel.
3. Click **+** to enter and save your Staffbase admin API key.
4. Select a saved environment or authenticate a new one.

### 4.1 Brand an Existing Environment

- Enter prospect name, logo URL, and background image URL  
- Pick primary branding color, text color, and neutral background color  
- Adjust logo padding and background position  
- Click **Preview Branding** to see live changes, or **Create** to apply immediately  

### 4.2 Set Up a New Demo Environment

- Toggle features: chat, Microsoft integration, campaigns  
- Choose launchpad items, mobile quick links, custom widgets, and merge integrations  
- Click **Set Up Environment** and wait a few minutes for provisioning  

### 4.3 Import LinkedIn Posts

- Enter a LinkedIn page URL and desired post count  
- Click **Import LinkedIn** — the process runs in the background  

---

## Permissions

- **scripting**  
  Inject custom CSS and modify the DOM during live previews.  
- **activeTab**  
  Grant temporary access to the active tab for querying and script injection.  
- **sidePanel**  
  Enable the extension UI in Chrome’s side panel.  
- **Host permissions**  
  - `https://app.staffbase.com/*` — read and update environment settings  
  - `https://sb-news-generator.uc.r.appspot.com/*` — provision new demo instances  

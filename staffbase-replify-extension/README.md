# Replify Chrome Extension

This Chrome extension allows you to automatically brand demo environments. 

## Installation

1.  **Clone the repository:**
    ```bash
    git clone replify-extension
    cd replify-extension
    ```

2.  **Navigate to the `replify` folder within `replify-extension`:**
    ```bash
    cd replify
    ```

3.  **Install dependencies:**
    ```bash
    npm install
    ```

4.  **Build the extension:**
    ```bash
    npm run build
    ```
    This command builds the popup app from `replify/` into `dist/main.js`.

5.  **Load the unpacked extension in Chrome:**
    * Open Google Chrome.
    * Navigate to `chrome://extensions/` in the address bar.
    * Enable "Developer mode" in the top right corner.
    * Click the "Load unpacked" button in the top left corner.
    * In the file dialog, navigate to and select the **`dist`** folder from your local repository.

## Development

The extension utilizes two main folders:

* **`dist`**: This folder contains the unpacked Chrome extension loaded by Chrome.
* **`replify`**: This folder contains the React source code for the popup and build tooling.

### Development Workflow

1.  **Make changes:** Modify files in `replify/src` (and any extension files in `dist` when needed).
2.  **Build popup bundle:** From `replify/`, run:
    ```bash
    npm run build
    ```
    This rewrites `dist/main.js`.
3.  **Reload extension in Chrome:** Open `chrome://extensions` and click **Reload** on Replify.
4.  **Reopen popup:** Close and reopen the extension popup to verify changes.

### Fast Rebuild

From `replify/`:

```bash
npm run build
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Click **Reload** on Replify
3. Reopen the popup

### Optional Watch Mode

For continuous popup rebuilds while editing:

```bash
npm run dev
```

This watches source files and rebuilds `dist/main.js` on changes. You still need to click **Reload** in `chrome://extensions` to load each updated build.


/*!
 * Copyright 2026, Staffbase SE and contributors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { ReactElement, useEffect, useId, useRef } from "react";

import widgetCss from "./legacy/widget.css.txt";
import widgetHtml from "./legacy/widget.html.txt";
import widgetScript from "./legacy/widget.script.txt";

export interface CarmaxStockWidgetProps {
  ticker?: string;
  contentLanguage?: string;
}

const TRADINGVIEW_SRC = "https://s3.tradingview.com/tv.js";

let tradingViewLoad: Promise<void> | null = null;

function loadTradingView(): Promise<void> {
  if (typeof window !== "undefined" && (window as unknown as { TradingView?: unknown }).TradingView) {
    return Promise.resolve();
  }
  if (!tradingViewLoad) {
    tradingViewLoad = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${TRADINGVIEW_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Failed to load TradingView script")));
        return;
      }
      const script = document.createElement("script");
      script.src = TRADINGVIEW_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load TradingView script"));
      document.head.appendChild(script);
    });
  }
  return tradingViewLoad;
}

export const CarmaxStockWidget = ({ ticker }: CarmaxStockWidgetProps): ReactElement => {
  const rootRef = useRef<HTMLDivElement>(null);
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const resolvedTicker = (ticker || "KMX").trim().toUpperCase().replace(/[^A-Z0-9.:]/g, "") || "KMX";
    const input = root.querySelector<HTMLInputElement>("#csw-tickerInput");
    if (input) {
      input.value = resolvedTicker;
      input.placeholder = resolvedTicker;
    }

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    loadTradingView()
      .then(() => {
        if (cancelled || !root) return;
        const runLegacyWidget = new Function("root", "instanceId", "defaultTicker", widgetScript) as (
          root: HTMLElement,
          instanceId: string,
          defaultTicker: string
        ) => (() => void) | undefined;
        cleanup = runLegacyWidget(root, instanceId, resolvedTicker);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("CarMax stock widget: failed to load TradingView", err);
      });

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
    // Re-run only when the instance or its configured default ticker changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, ticker]);

  return (
    <div ref={rootRef} className="csw-root">
      <style>{widgetCss}</style>
      <div dangerouslySetInnerHTML={{ __html: widgetHtml }} />
    </div>
  );
};

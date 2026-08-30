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

// ============================================================================
// MANAGER HUB — RETAIL DEMO
// ============================================================================
// DEV: this file is the widget's registration entry point — the one thing
// Staffbase's hosting app actually loads. It doesn't render anything itself;
// it (1) declares which config values become HTML attributes on the
// <manager-hub-retail-demo> custom element, (2) wraps the real UI
// (ManagerHubWidget, a normal React component in manager-hub-widget.tsx) in
// the class shape Staffbase's runtime expects, and (3) calls the global
// window.defineBlock() to register it. Everything else — what the widget
// actually shows and does — lives in manager-hub-widget.tsx (mount point) and
// dashboard-logic.ts (~2600 lines: all the real behavior).
//
// PM: this is a stripped-down, generic-branded copy of the Life Time
// "Manager Hub" widget, rebuilt as a portable sales/demo example under a
// fictional retailer ("Northwind Retail") so it can be shown to any retail
// prospect without referencing a real customer. The FUNCTIONALITY is
// identical to the branded version — same real Staffbase API calls, same
// features — only the company name, store names, job titles, and sample
// data were swapped for generic retail equivalents. See dashboard-logic.ts
// for the full feature-by-feature breakdown.
import React from "react";
import ReactDOM from "react-dom/client";

import { BlockFactory, BlockDefinition, ExternalBlockDefinition, BaseBlock } from "widget-sdk";
import { ManagerHubWidgetProps, ManagerHubWidget } from "./manager-hub-widget";
import { configurationSchema, uiSchema } from "./configuration-schema";
import icon from "../resources/manager-hub-widget.svg";
import pkg from '../package.json'

/**
 * Define which attributes are handled by the widget. This should be also reflected in configuration schema.
 *
 * NOTE: keep these all-lowercase, single-word names (like Staffbase's own
 * examples use "apikey" rather than "apiKey"). Custom element attribute
 * names get lowercased by the DOM when set, but `observedAttributes` is
 * matched against the literal string — a camelCase name here silently never
 * matches, so the widget never sees attribute updates from Studio.
 */
const widgetAttributes: string[] = [
  'apitoken',
  'demomode',
];

/**
 * This factory creates the class which is registered with the tagname in the `custom element registry`
 * Gets the parental class and a set of helper utilities provided by the hosting application.
 */
const factory: BlockFactory = (BaseBlockClass, _widgetApi) => {
  /**
   *  <manager-hub-retail-demo apitoken="..."></manager-hub-retail-demo>
   */
  return class ManagerHubWidgetBlock extends BaseBlockClass implements BaseBlock {
    private _root: ReactDOM.Root | null = null;

    public constructor() {
      super();
    }

    private get props(): ManagerHubWidgetProps {
      const attrs = this.parseAttributes<ManagerHubWidgetProps>();
      return {
        ...attrs,
        widgetApi: _widgetApi,
        contentLanguage: this.contentLanguage,
      };
    }

    public renderBlock(container: HTMLElement): void {
      this._root ??= ReactDOM.createRoot(container);
      this._root.render(<ManagerHubWidget {...this.props} />);
    }

    /**
     * The observed attributes, where the widgets reacts on.
     */
    public static get observedAttributes(): string[] {
      return widgetAttributes;
    }

    /**
     * Callback invoked on every change of an observed attribute. Call the parental method before
     * applying own logic.
     */
    public attributeChangedCallback(...args: [string, string | undefined, string | undefined]): void {
      super.attributeChangedCallback.apply(this, args);
    }
  };
};

/**
 * The definition of the block, to let it successful register to the hosting application
 */
const blockDefinition: BlockDefinition = {
    // Deliberately different from the branded widget's tag name
    // ("manager-hub-widget") so the two could, in principle, be installed on
    // the same branch/page without a custom-element registry collision.
    name: "manager-hub-retail-demo",
    factory: factory,
    attributes: widgetAttributes,
    blockLevel: 'block',
    configurationSchema: configurationSchema,
    uiSchema: uiSchema,
    label: 'Manager Hub (Retail Demo)',
    iconUrl: icon
};

/**
 * Wrapping definition, which defines meta informations about the block.
 */
const externalBlockDefinition: ExternalBlockDefinition = {
  blockDefinition,
  author: pkg.author,
  version: pkg.version
};

/**
 * This call is mandatory to register the block in the hosting application.
 */
window.defineBlock(externalBlockDefinition);

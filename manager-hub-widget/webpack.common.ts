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

import * as path from "path";
import * as webpack from "webpack";

const config: webpack.Configuration = {
  entry: {
    "farazhussain.manager-hub-widget": "./src/index.tsx",
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: ["babel-loader"],
        exclude: /.*\/node_modules/,
      },
      {
        test: /\.svg$/i,
        use: [{ loader: "@svgr/webpack", options: { icon: true } }],
      },
      {
        test: /manager-hub-widget\.svg$/,
        use: [
          {
            loader: "url-loader",
          },
        ],
      },
      {
        test: /\.txt$/,
        type: "asset/source",
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    alias: {
      "widget-sdk": path.resolve(__dirname, "node_modules/@staffbase/widget-sdk"),
    },
  },
  output: {
    filename: "[name].js",
    path: __dirname + "/dist",
  },
};

export default config;

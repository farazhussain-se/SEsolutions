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
    "farazhussain.lifetime-audit-widget": "./src/index.ts",
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: ["babel-loader"],
        exclude: /.*\/node_modules/,
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

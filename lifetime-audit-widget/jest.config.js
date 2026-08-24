// eslint-disable-next-line no-undef
module.exports = {
  setupFilesAfterEnv: ["./test/jest-setup.ts"],
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "\\.svg": "<rootDir>/__mocks__/svg.js",
    "^nanoid(/(.*)|$)": "nanoid$1",
    "^@rjsf/mui$": "<rootDir>/node_modules/@rjsf/mui/lib/index.js",
  },
  transform: {
    "^.+\\.txt$": "<rootDir>/test/rawTextTransform.js",
    "^.+\\.[jt]sx?$": "babel-jest",
  },
  transformIgnorePatterns: [String.raw`\/node_modules\/(?!(nanoid|@x0k\/json-schema-merge|@rjsf\/mui))\/`],
};

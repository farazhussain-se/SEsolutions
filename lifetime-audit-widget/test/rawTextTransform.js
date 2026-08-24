/* eslint-disable no-undef -- CommonJS jest transform (module.exports); inherited scaffold boilerplate */
module.exports = {
  process(sourceText) {
    return { code: `module.exports = ${JSON.stringify(sourceText)};` };
  },
};

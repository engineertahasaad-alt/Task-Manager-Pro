// Polyfill Array.prototype.toReversed for EAS build environments
// that run metro config resolution in a Node runtime older than 20.0.0.
// This executes before metro-config's mergeConfig() is called, ensuring
// the method exists regardless of which Node version the EAS worker uses.
if (!Array.prototype.toReversed) {
  // eslint-disable-next-line no-extend-native
  Array.prototype.toReversed = function () {
    return [...this].reverse();
  };
}

const { getDefaultConfig } = require("expo/metro-config");
const { mergeConfig } = require("metro-config");
const path = require("path");

const projectRoot = __dirname;
// Two levels up: artifacts/taskflow-mobile → artifacts → repo root
const monorepoRoot = path.resolve(projectRoot, "../..");

const defaultConfig = getDefaultConfig(projectRoot);

module.exports = mergeConfig(defaultConfig, {
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, "node_modules"),
      path.resolve(monorepoRoot, "node_modules"),
    ],
  },
});

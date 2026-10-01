// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// On the web, maplibre-gl is loaded at runtime from public/maplibre (see KMapMapLibre.web.tsx)
// instead of being bundled: Expo puts every node_modules package in the first download, and the
// map worker already loads those same files. Only the bare import is redirected; the CSS subpath
// and the native build are unaffected.
const maplibreStub = path.resolve(__dirname, 'src/components/map/maplibre-stub.js');
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'maplibre-gl') {
    return { type: 'sourceFile', filePath: maplibreStub };
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;

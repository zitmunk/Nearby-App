const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// ⚠️ ESTA ES LA MAGIA: Cuando compilamos para WEB, redirigimos la librería nativa
// a nuestro archivo "stub" vacío para que no intente cargar el código nativo.
if (process.env.EXPO_OS === 'web') {
  config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules || {}),
    'react-native-google-mobile-ads': path.resolve(__dirname, 'src/stubs/GoogleMobileAdsStub.js'),
  };
}

module.exports = config;
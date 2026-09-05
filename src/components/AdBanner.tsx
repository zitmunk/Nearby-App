import { Platform } from 'react-native';

export default function AdBanner(props: any) {
  if (Platform.OS === 'web') {
    const AdBannerWeb = require('./AdBanner.web').default;
    return <AdBannerWeb {...props} />;
  } else {
    const AdBannerNative = require('./AdBanner.native').default;
    return <AdBannerNative {...props} />;
  }
}
import { View } from 'react-native';
import { BannerAd } from 'react-native-google-mobile-ads';

// Define los props que acepta (puedes ampliarlos)
interface AdBannerProps {
  unitId: string;
  size: any;
  requestOptions?: any;
  style?: any;
}

export default function AdBanner({ unitId, size, requestOptions, style }: AdBannerProps) {
  return (
    <View style={style}>
      <BannerAd
        unitId={unitId}
        size={size}
        requestOptions={requestOptions || { requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
}
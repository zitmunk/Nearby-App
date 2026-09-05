// src/stubs/GoogleMobileAdsStub.js
import { Text, View } from 'react-native';

export const BannerAd = ({ size }) => (
  <View style={{ backgroundColor: '#eee', padding: 10, margin: 10 }}>
    <Text style={{ color: '#555' }}>Anuncio no disponible en web</Text>
  </View>
);

export const InterstitialAd = {
  createForAdRequest: () => ({ load: () => {}, show: () => {}, addAdEventListener: () => {} }),
};

export const RewardedAd = {
  createForAdRequest: () => ({ load: () => {}, show: () => {}, addAdEventListener: () => {} }),
};

export const TestIds = { BANNER: 'BANNER', INTERSTITIAL: 'INTERSTITIAL', REWARDED: 'REWARDED' };
export const AdEventType = { LOADED: 'loaded', ERROR: 'error', OPENED: 'opened', CLOSED: 'closed' };
export const RewardedAdEventType = { EARNED_REWARD: 'rewarded' };
export default {};
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '../supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }) as any,
});

export default function RootLayout() {
  useEffect(() => {
    // Inicializar anuncios solo en móvil (evita que la web lo analice)
 //   if (Platform.OS !== 'web') {
 //     try {
 //       const ads = require('react-native-google-mobile-ads');
 //       ads.mobileAds().initialize();
 //     } catch (e) {
 //       console.log('Error cargando anuncios', e);
 //     }
 //   }

    const updateActivity = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ last_active: new Date().toISOString() })
          .eq('id', user.id);
      }
    };

    updateActivity();
    const interval = setInterval(updateActivity, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="feed" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
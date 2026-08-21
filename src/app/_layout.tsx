import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '../supabase';

// Configurar el manejador de notificaciones actualizado para versiones recientes de Expo
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  } as any), // Usar 'as any' previene cualquier conflicto de tipos estrictos con TypeScript
});

export default function RootLayout() {
  useEffect(() => {
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
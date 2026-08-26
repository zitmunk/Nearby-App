import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      alert('¡Permiso denegado para notificaciones!');
      return null;
    }
    
    // IMPORTANTE: Asegúrate de tener tu projectId en app.json
    const token = (await Notifications.getExpoPushTokenAsync({
      projectId: "7bc385e4-e611-46ad-bcb7-6fb4f7b3db9d"
    })).data;
    
    return token;
  }
  return null;
}
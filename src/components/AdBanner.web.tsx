import { StyleSheet, Text, View } from 'react-native';

// Definimos el tipo de las props para que TypeScript no se queje
interface AdBannerProps {
  size?: any;
  unitId?: string;
  style?: any;
}

// En web, devolvemos un placeholder o null para no romper
export default function AdBanner({ size, unitId, style }: AdBannerProps) {
  // Puedes mostrar un mensaje de "Anuncio (solo en app)" si quieres
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.text}>📱 Anuncio disponible en la app</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  text: {
    color: '#666',
    fontSize: 12,
  },
});
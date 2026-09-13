import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
    Animated,
    Dimensions,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Colors } from '../constants/Colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface FeedItemProps {
  item: any;
  index: number;
}

export function FeedItem({ item, index }: FeedItemProps) {
  const router = useRouter();

  // ✅ TODOS los Hooks de animación van AQUÍ
  const itemFadeAnim = useRef(new Animated.Value(0)).current;
  const itemTranslateY = useRef(new Animated.Value(20)).current;

  // ✅ useEffect para la animación
  useEffect(() => {
    // Animación de entrada
    Animated.parallel([
      Animated.timing(itemFadeAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.timing(itemTranslateY, {
        toValue: 0,
        duration: 400,
        delay: index * 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Funciones de utilidad
  const isUserOnline = (lastSeen: string) => {
    if (!lastSeen) return false;
    const diffMinutes = (new Date().getTime() - new Date(lastSeen).getTime()) / 60000;
    return diffMinutes < 5;
  };

  const handlePress = () => {
    // Feedback visual al presionar
    Animated.sequence([
      Animated.timing(itemFadeAnim, {
        toValue: 0.7,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(itemFadeAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.push({
        pathname: '/chat',
        params: {
          receiverId: item.id,
          receiverName: item.full_name || item.username,
        },
      });
    });
  };

  const handleLongPress = () => {
    // Esta función se pasa al padre mediante props o se maneja con un callback
    // Por ahora solo hacemos un feedback visual
    Animated.sequence([
      Animated.timing(itemFadeAnim, {
        toValue: 0.5,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(itemFadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const online = isUserOnline(item.last_seen);
  const age = parseInt(item.age, 10);
  const isValidAge = !isNaN(age) && age > 0 && age < 120;

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        {
          opacity: itemFadeAnim,
          transform: [{ translateY: itemTranslateY }],
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.card, item.hasUnread && styles.cardUnreadNeon]}
        activeOpacity={0.9}
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
        <View style={[styles.imageContainer, online && styles.onlineBorder]}>
          {item.avatar_url && item.avatar_url.trim() !== '' && item.avatar_url.trim() !== 'EMPTY' ? (
            <Image source={{ uri: item.avatar_url.trim() }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={40} color="#666" />
            </View>
          )}
        </View>

        <View style={styles.ageBadge}>
          <Text style={styles.ageBadgeText}>{isValidAge ? age : '?'}</Text>
        </View>

        <View style={styles.indicatorsContainer}>
          <View style={[styles.onlineDot, online && styles.onlineDotActive]} />
          {item.hasUnread && <Ionicons name="mail" size={13} color="#22c55e" style={styles.mailIcon} />}
        </View>

        <View style={styles.overlay}>
          <Text style={styles.name} numberOfLines={1}>{item.full_name || item.username}</Text>
          <View style={styles.distanceContainer}>
            <Ionicons name="location-outline" size={12} color="#22c55e" />
            <Text style={styles.distance}>
              {item.dist_meters != null
                ? (item.dist_meters < 100
                  ? 'Muy cerca'
                  : item.dist_meters < 1000
                    ? `${Math.round(item.dist_meters)} m`
                    : `${(item.dist_meters / 1000).toFixed(1)} km`)
                : 'Distancia desconocida'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    flex: 1,
    margin: 3,
    maxWidth: '31.3%',
  },
  card: {
    flex: 1,
    margin: 0,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: '#262626',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    position: 'relative',
  },
  cardUnreadNeon: {
    borderColor: '#22c55e',
    borderWidth: 2.5,
    elevation: 8,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#333',
  },
  onlineBorder: {
    borderColor: '#22c55e',
  },
  avatar: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ageBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 24,
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#000',
  },
  ageBadgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  indicatorsContainer: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  onlineDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#555',
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  onlineDotActive: {
    backgroundColor: '#22c55e',
  },
  mailIcon: {
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 6,
    backgroundColor: 'rgba(5, 5, 5, 0.85)',
  },
  name: {
    fontSize: 11,
    fontWeight: 'bold',
    color: Colors.textPrimary,
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  distance: {
    fontSize: 9,
    color: '#22c55e',
    fontWeight: '600',
    marginLeft: 2,
  },
});
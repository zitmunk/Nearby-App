import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { supabase } from '../supabase';

const { width } = Dimensions.get('window');
const imageSize = width / 3 - 4; // Cuadrícula de 3 columnas

export default function UserProfileScreen() {
  const { userId, userName } = useLocalSearchParams();
  const router = useRouter();
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        const myId = data.user.id;
        setCurrentUserId(myId);
        
        // Si no hay userId en los parámetros O el userId es igual al mío, cargamos mi álbum
        const targetId = (!userId || userId === myId) ? myId : userId;
        fetchPublicAlbum(targetId as string);
      }
    });
  }, [userId]);

  const fetchPublicAlbum = async (targetId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_shared_albums')
      .select('*')
      .eq('owner_id', targetId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPhotos(data);
    }
    setLoading(false);
  };

  const handleStartChat = () => {
    router.push({
      pathname: '/chat',
      params: { receiverId: userId, receiverName: userName },
    });
  };

  const pickAndUploadPhoto = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permiso denegado', 'Se necesita acceso a la galería para subir fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !currentUserId) return;

    setUploading(true);
    try {
      const imageUri = result.assets[0].uri;
      const fileExt = imageUri.substring(imageUri.lastIndexOf('.') + 1) || 'jpg';
      const fileName = `shared_album_${currentUserId}_${Date.now()}.${fileExt}`;

      const response = await fetch(imageUri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(fileName, blob, { contentType: `image/${fileExt}` });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-images')
        .getPublicUrl(fileName);

      const { error: dbError } = await supabase.from('user_shared_albums').insert({
        owner_id: currentUserId,
        image_url: publicUrl,
      });

      if (dbError) throw dbError;

      // Refrescar el álbum local con la nueva foto instantáneamente
      fetchPublicAlbum(currentUserId);
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo subir la foto: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photoId: string, imageUrl: string) => {
    Alert.alert('Eliminar foto', '¿Deseas borrar esta foto de tu álbum?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('user_shared_albums').delete().eq('id', photoId);
          if (error) {
            Alert.alert('Error', 'No se pudo eliminar el registro.');
            return;
          }

          // Eliminar del Storage opcionalmente
          const pathParts = imageUrl.split('/');
          const fileName = pathParts[pathParts.length - 1];
          await supabase.storage.from('chat-images').remove([fileName]);

          setPhotos((prev) => prev.filter((p) => p.id !== photoId));
        },
      },
    ]);
  };

  // Es tu perfil si no hay userId externo o si el userId externo es exactamente tu ID
  const isMyProfile = !userId || userId === currentUserId;

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{userName || (isMyProfile ? 'Mi Álbum' : 'Perfil de Usuario')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* INFORMACIÓN Y ACCIÓN DE CHAT (Si no es su propio perfil) */}
      {!isMyProfile && (
        <View style={styles.actionContainer}>
          <TouchableOpacity style={styles.chatButton} onPress={handleStartChat} activeOpacity={0.8}>
            <Ionicons name="chatbubble-outline" size={18} color="#000" style={{ marginRight: 8 }} />
            <Text style={styles.chatButtonText}>Enviar Mensaje</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.sectionTitleContainer}>
        <Text style={styles.sectionTitle}>🌍 Álbum Público</Text>
      </View>

      {/* CUADRÍCULA DE FOTOS */}
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : photos.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {isMyProfile ? 'Aún no has subido fotos a tu álbum público. Toca el botón "+" para agregar una.' : 'Este usuario aún no ha subido fotos.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          numColumns={3}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.9}
              onLongPress={() => isMyProfile && handleDeletePhoto(item.id, item.image_url)}
              style={styles.imageWrapper}
            >
              <Image source={{ uri: item.image_url }} style={styles.thumbnail} />
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.grid}
        />
      )}

      {/* BOTÓN FLOTANTE PARA SUBIR FOTO (Visible únicamente si es tu perfil) */}
      {isMyProfile && (
        <TouchableOpacity 
          style={styles.fab} 
          onPress={pickAndUploadPhoto} 
          disabled={uploading}
          activeOpacity={0.85}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Ionicons name="add" size={28} color="#000" />
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderPrimary,
  },
  backButton: { padding: 4 },
  backButtonText: { color: Colors.primary, fontSize: 24, fontWeight: 'bold' },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  actionContainer: { padding: 16, backgroundColor: Colors.surface, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.borderPrimary },
  chatButton: {
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  chatButtonText: { color: '#000', fontWeight: 'bold', fontSize: 15 },
  sectionTitleContainer: { paddingHorizontal: 16, paddingVertical: 12 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textSecondary },
  grid: { padding: 2 },
  imageWrapper: { padding: 2 },
  thumbnail: { width: imageSize, height: imageSize, borderRadius: 4, backgroundColor: Colors.card },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { color: Colors.textMuted, fontSize: 14, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 25,
    backgroundColor: Colors.primary,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    zIndex: 99,
  },
});
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { supabase } from '../supabase';

export default function ProfileScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (data) {
        setFullName(data.full_name || '');
        setUsername(data.username || '');
        setBirthDate(data.birth_date || '');
        setBio(data.bio || '');
        setInterests(data.interests || '');
        setAvatarUrl(data.avatar_url || '');
      }
    }
    setLoading(false);
  }

  // --- Manejo seguro de retroceso para evitar errores en web ---
  const handleBackPress = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/feed');// O la ruta principal de tu app
    }
  };

  // --- Abrir galería, comprimir y subir imagen al Bucket de Supabase ---
  async function pickAndUploadImage() {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se necesita permiso para acceder a tus fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (result.canceled) return;

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const imageUri = result.assets[0].uri;

      const manipResult = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 500 } }],
        { compress: 0.2, format: ImageManipulator.SaveFormat.JPEG }
      );

      const finalUri = manipResult.uri;
      const fileName = `${user.id}_${Date.now()}.jpg`;
      const filePath = fileName;

      const response = await fetch(finalUri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);
      Alert.alert('Imagen subida', 'Toca el botón "Guardar" arriba para actualizar definitivamente.');

    } catch (error: any) {
      console.error('Error detallado:', error);
      Alert.alert('Error al subir imagen', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateProfileAndLocation() {
    if (!username || username.trim().length < 3) {
      Alert.alert('Atención', 'El nombre de usuario debe tener al menos 3 caracteres.');
      return;
    }

    setLoading(true);

    const { status } = await Location.requestForegroundPermissionsAsync();
    let lat = -20.2642; 
    let lon = -70.1185;
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      lat = loc.coords.latitude;
      lon = loc.coords.longitude;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      Alert.alert('Error', 'No hay usuario autenticado.');
      return;
    }

    const payload = {
      id: user.id,
      full_name: fullName,
      username: username.trim(),
      birth_date: birthDate || null,
      bio: bio,
      interests: interests,
      avatar_url: avatarUrl,
      location: `SRID=4326;POINT(${lon} ${lat})`,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('profiles')
      .upsert(payload);

    if (error) {
      Alert.alert('Error al guardar', error.message);
    } else {
      Alert.alert('Éxito', 'Perfil guardado correctamente.');
    }
    setLoading(false);
  }

  // --- Ir a mi álbum público ---
  const handleOpenMyAlbum = () => {
    if (!currentUserId) return;
    router.push({
      pathname: '/album',
      params: { userId: currentUserId, userName: fullName || username || 'Mi Álbum' }
    });
  };

  // --- Función para Cerrar Sesión ---
  async function handleSignOut() {
    try {
      setLoading(true);
      await supabase.removeAllChannels();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/');
    } catch (error: any) {
      console.error('Error al cerrar sesión:', error);
      Alert.alert('Error', 'No se pudo cerrar sesión correctamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.mainContainer}>
      {/* Banner Superior Fijo con Botón de Guardar Minimalista */}
      <View style={styles.headerBanner}>
        <TouchableOpacity onPress={handleBackPress} style={styles.iconButton} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Mi Perfil</Text>
        
        <TouchableOpacity 
          onPress={updateProfileAndLocation} 
          disabled={loading} 
          style={styles.saveHeaderButton}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#38bdf8" />
          ) : (
            <Text style={styles.saveHeaderText}>Guardar</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Sección de Avatar con Estilo Flotante */}
        <View style={styles.profileHeaderContainer}>
          <TouchableOpacity onPress={pickAndUploadImage} style={styles.avatarWrapper} disabled={loading} activeOpacity={0.85}>
            <Image 
              source={{ uri: avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400' }} 
              style={styles.avatar} 
            />
            <View style={styles.overlay}>
              <Ionicons name="camera" size={18} color="#38bdf8" />
            </View>
          </TouchableOpacity>
          <Text style={styles.profileName}>{fullName || username || 'Configura tu perfil'}</Text>
          <Text style={styles.helpText}>Toca tu foto para cambiarla</Text>
        </View>

        {/* Menú de Accesos Rápidos (Álbum y Bloqueados) */}
        <View style={styles.quickLinksContainer}>
          <TouchableOpacity style={styles.quickCard} onPress={handleOpenMyAlbum} activeOpacity={0.8}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(56, 189, 248, 0.1)' }]}>
              <Ionicons name="images-outline" size={20} color="#38bdf8" />
            </View>
            <View style={styles.quickCardInfo}>
              <Text style={styles.quickCardTitle}>Mi Álbum Público</Text>
              <Text style={styles.quickCardSub}>Gestiona tus fotos visibles</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={() => router.push('/blocked_users')} activeOpacity={0.8}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(248, 113, 113, 0.1)' }]}>
              <Ionicons name="ban-outline" size={20} color="#f87171" />
            </View>
            <View style={styles.quickCardInfo}>
              <Text style={styles.quickCardTitle}>Usuarios Bloqueados</Text>
              <Text style={styles.quickCardSub}>Gestiona tus restricciones</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Formulario de Datos */}
        <View style={styles.formSection}>
          <Text style={styles.sectionHeading}>Información Personal</Text>

          <Text style={styles.label}>Nombre Completo</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Juan Pérez"
            placeholderTextColor={Colors.textMuted}
            value={fullName}
            onChangeText={setFullName}
          />

          <Text style={styles.label}>Nombre de Usuario (Mínimo 3 caracteres)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: juanp"
            placeholderTextColor={Colors.textMuted}
            value={username}
            onChangeText={setUsername}
            autoCapitalize='none'
          />

          <Text style={styles.label}>Fecha de Nacimiento (AAAA-MM-DD)</Text>
          <TextInput
            style={styles.input}
            placeholder="1995-05-20"
            placeholderTextColor={Colors.textMuted}
            value={birthDate}
            onChangeText={setBirthDate}
          />

          <Text style={styles.label}>Biografía</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Cuéntanos un poco sobre ti..."
            placeholderTextColor={Colors.textMuted}
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.label}>Intereses</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej: Tecnología, Música, Viajes..."
            placeholderTextColor={Colors.textMuted}
            value={interests}
            onChangeText={setInterests}
          />
        </View>

        {/* Botón de Cerrar Sesión */}
        <View style={styles.actionContainer}>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} disabled={loading} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color="#f87171" style={{ marginRight: 8 }} />
            <Text style={styles.signOutText}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingBottom: 40 },
  
  headerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    zIndex: 10,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary },
  saveHeaderButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  saveHeaderText: { color: '#38bdf8', fontWeight: 'bold', fontSize: 14 },

  profileHeaderContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    marginBottom: 16,
  },
  avatarWrapper: { 
    position: 'relative', 
    marginBottom: 12, 
    borderRadius: 55, 
    overflow: 'hidden', 
    borderWidth: 2, 
    borderColor: Colors.primary,
  },
  avatar: { width: 110, height: 110, borderRadius: 55, backgroundColor: Colors.background },
  overlay: { 
    position: 'absolute', 
    bottom: 0, 
    left: 0, 
    right: 0, 
    backgroundColor: 'rgba(5, 5, 5, 0.75)', 
    padding: 6, 
    alignItems: 'center' 
  },
  profileName: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 2 },
  helpText: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic' },

  quickLinksContainer: { paddingHorizontal: 16, marginBottom: 20 },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#262626',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  quickCardInfo: { flex: 1 },
  quickCardTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 1 },
  quickCardSub: { fontSize: 12, color: Colors.textSecondary },

  formSection: { paddingHorizontal: 16, marginBottom: 10 },
  sectionHeading: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 14 },
  
  label: { fontSize: 13, color: Colors.textSecondary, marginBottom: 6, fontWeight: '600' },
  input: { 
    borderWidth: 1, 
    borderColor: '#262626', 
    padding: 12, 
    borderRadius: 12, 
    marginBottom: 16, 
    backgroundColor: Colors.surface, 
    color: Colors.textPrimary,
    fontSize: 15
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  
  actionContainer: { paddingHorizontal: 16, marginTop: 10 },
  signOutButton: { 
    flexDirection: 'row',
    backgroundColor: '#1e1b18', 
    padding: 16, 
    borderRadius: 14, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    marginBottom: 20
  },
  signOutText: { color: '#f87171', fontWeight: 'bold', fontSize: 15 },
});
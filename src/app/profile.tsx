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

  // --- Abrir galería y subir imagen al Bucket de Supabase ---
  async function pickAndUploadImage() {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se necesita permiso para acceder a tus fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
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
      const fileExt = imageUri.substring(imageUri.lastIndexOf('.') + 1);
      const fileName = `${user.id}_${Date.now()}.${fileExt}`;
      const filePath = fileName;

      const response = await fetch(imageUri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, {
          contentType: `image/${fileExt}`,
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);
      Alert.alert('Imagen subida', 'Toca "Guardar" para actualizar tu perfil definitivamente.');

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
      router.back();
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
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Mi Perfil</Text>

      <TouchableOpacity onPress={pickAndUploadImage} style={styles.avatarWrapper} disabled={loading} activeOpacity={0.8}>
        <Image 
          source={{ uri: avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400' }} 
          style={styles.avatar} 
        />
        <View style={styles.overlay}>
          {loading ? <ActivityIndicator color={Colors.textPrimary} size="small" /> : <Text style={styles.editText}>Editar</Text>}
        </View>
      </TouchableOpacity>
      <Text style={styles.helpText}>Toca tu foto para cambiarla</Text>

      {/* BOTÓN PARA VER MI ÁLBUM PÚBLICO */}
      <TouchableOpacity style={styles.albumButton} onPress={handleOpenMyAlbum} activeOpacity={0.85}>
        <Text style={styles.albumButtonText}>🌍 Ver mi álbum público y fotos</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Nombre Completo:</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Juan Pérez"
        placeholderTextColor={Colors.textMuted}
        value={fullName}
        onChangeText={setFullName}
      />

      <Text style={styles.label}>Nombre de Usuario (Mínimo 3 caracteres):</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: juanp"
        placeholderTextColor={Colors.textMuted}
        value={username}
        onChangeText={setUsername}
        autoCapitalize='none'
      />

      <Text style={styles.label}>Fecha de Nacimiento (AAAA-MM-DD):</Text>
      <TextInput
        style={styles.input}
        placeholder="1995-05-20"
        placeholderTextColor={Colors.textMuted}
        value={birthDate}
        onChangeText={setBirthDate}
      />

      <Text style={styles.label}>Biografía:</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Cuéntanos un poco sobre ti..."
        placeholderTextColor={Colors.textMuted}
        value={bio}
        onChangeText={setBio}
        multiline
        numberOfLines={3}
      />

      <Text style={styles.label}>Intereses:</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Tecnología, Música, Viajes..."
        placeholderTextColor={Colors.textMuted}
        value={interests}
        onChangeText={setInterests}
      />

      <TouchableOpacity style={styles.button} onPress={updateProfileAndLocation} disabled={loading} activeOpacity={0.8}>
        {loading ? (
          <ActivityIndicator color={Colors.textPrimary} />
        ) : (
          <Text style={styles.buttonText}>Guardar y Actualizar GPS</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} disabled={loading} activeOpacity={0.8}>
        <Text style={styles.signOutText}>Cerrar Sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: Colors.background, paddingVertical: 50 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: Colors.textPrimary },
  
  avatarWrapper: { alignSelf: 'center', position: 'relative', marginBottom: 5, borderRadius: 60, overflow: 'hidden', borderWidth: 1, borderColor: '#262626' },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: Colors.surface },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(5, 5, 5, 0.8)', padding: 6, alignItems: 'center' },
  editText: { color: '#38bdf8', fontSize: 12, fontWeight: 'bold' },
  helpText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginBottom: 15, fontStyle: 'italic' },

  albumButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  albumButtonText: { color: Colors.primary, fontWeight: 'bold', fontSize: 15 },

  label: { fontSize: 14, color: Colors.textPrimary, marginBottom: 6, fontWeight: '600' },
  input: { 
    borderWidth: 1, 
    borderColor: '#262626', 
    padding: 12, 
    borderRadius: 14, 
    marginBottom: 16, 
    backgroundColor: Colors.surface, 
    color: Colors.textPrimary,
    fontSize: 16
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  
  button: { 
    backgroundColor: '#0284c7', 
    padding: 16, 
    borderRadius: 14, 
    alignItems: 'center', 
    marginTop: 10, 
    elevation: 4,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  buttonText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 16 },

  signOutButton: { 
    backgroundColor: '#1e1b18', 
    padding: 16, 
    borderRadius: 14, 
    alignItems: 'center', 
    marginTop: 12, 
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#7f1d1d'
  },
  signOutText: { color: '#f87171', fontWeight: 'bold', fontSize: 16 },
});
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function ProfileScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
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

  // --- Guardar perfil y ubicación con formato WKT exacto para PostGIS ---
  async function updateProfileAndLocation() {
    setLoading(true);

    const { status } = await Location.requestForegroundPermissionsAsync();
    let latitude = -20.2642; 
    let longitude = -70.1185;

    if (status === 'granted') {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      latitude = location.coords.latitude;
      longitude = location.coords.longitude;
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert('Error', 'No hay sesión activa.');
      setLoading(false);
      return;
    }

    // Formato requerido para que la función RPC 'get_nearby_users' interprete el punto geográfico
    const pointLocation = `SRID=4326;POINT(${longitude} ${latitude})`;

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: fullName,
        username: username,
        birth_date: birthDate || null,
        bio: bio,
        interests: interests,
        avatar_url: avatarUrl,
        location: pointLocation,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      Alert.alert('Error al guardar', error.message);
    } else {
      Alert.alert('¡Perfil actualizado!', 'Tus datos, biografía y ubicación GPS se guardaron correctamente.');
      router.back(); // Regresa al feed o pantalla anterior automáticamente
    }

    setLoading(false);
  }

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
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.editText}>Editar</Text>}
        </View>
      </TouchableOpacity>
      <Text style={styles.helpText}>Toca tu foto para cambiarla</Text>

      <Text style={styles.label}>Nombre Completo:</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Juan Pérez"
        placeholderTextColor="#64748b"
        value={fullName}
        onChangeText={setFullName}
      />

      <Text style={styles.label}>Nombre de Usuario:</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: juanp"
        placeholderTextColor="#64748b"
        value={username}
        onChangeText={setUsername}
        autoCapitalize='none'
      />

      <Text style={styles.label}>Fecha de Nacimiento (AAAA-MM-DD):</Text>
      <TextInput
        style={styles.input}
        placeholder="1995-05-20"
        placeholderTextColor="#64748b"
        value={birthDate}
        onChangeText={setBirthDate}
      />

      <Text style={styles.label}>Biografía:</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Cuéntanos un poco sobre ti..."
        placeholderTextColor="#64748b"
        value={bio}
        onChangeText={setBio}
        multiline
        numberOfLines={3}
      />

      <Text style={styles.label}>Intereses:</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Tecnología, Música, Viajes..."
        placeholderTextColor="#64748b"
        value={interests}
        onChangeText={setInterests}
      />

      <TouchableOpacity style={styles.button} onPress={updateProfileAndLocation} disabled={loading} activeOpacity={0.8}>
        {loading ? (
          <ActivityIndicator color="#fff" />
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
  container: { flexGrow: 1, padding: 20, backgroundColor: '#090d16', paddingVertical: 50 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#f9fafb' },
  
  avatarWrapper: { alignSelf: 'center', position: 'relative', marginBottom: 5, borderRadius: 60, overflow: 'hidden', borderWidth: 1, borderColor: '#1f2937' },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#1f2937' },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(9, 13, 22, 0.75)', padding: 6, alignItems: 'center' },
  editText: { color: '#38bdf8', fontSize: 12, fontWeight: 'bold' },
  helpText: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 20, fontStyle: 'italic' },

  label: { fontSize: 14, color: '#e2e8f0', marginBottom: 6, fontWeight: '600' },
  input: { 
    borderWidth: 1, 
    borderColor: '#1f2937', 
    padding: 12, 
    borderRadius: 14, 
    marginBottom: 16, 
    backgroundColor: '#111827', 
    color: '#f9fafb',
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
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

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
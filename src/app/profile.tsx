import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function ProfileScreen() {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [birthDate, setBirthDate] = useState('');
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
        setAvatarUrl(data.avatar_url || '');
      }
    }
    setLoading(false);
  }

  // --- NUEVA FUNCIÓN: Abrir galería y subir imagen ---
  async function pickAndUploadImage() {
    // 1. Solicitar permisos para acceder a la galería
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se necesita permiso para acceder a tus fotos.');
      return;
    }

    // 2. Abrir el selector de imágenes
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, // Permitir recortar
      aspect: [1, 1], // Forzar formato cuadrado (avatar)
      quality: 0.8, // Calidad de compresión
    });

    if (result.canceled) return;

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      // 3. Preparar los datos de la imagen para subirlos
      const imageUri = result.assets[0].uri;
      const fileExt = imageUri.substring(imageUri.lastIndexOf('.') + 1);
      const fileName = `${user.id}_${Date.now()}.${fileExt}`;
      const filePath = fileName; // Subimos directamente al bucket 'avatars'

      // Convertir la URI a un Blob (requerido para React Native/Supabase)
      const response = await fetch(imageUri);
      const blob = await response.blob();

      // 4. Subir al bucket 'avatars' de Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, {
          contentType: `image/${fileExt}`,
          upsert: true // Sobrescribir si ya existe
        });

      if (uploadError) throw uploadError;

      // 5. Obtener la URL pública de la imagen recién subida
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl); // Actualizar el estado visualmente
      // NOTA: La imagen no se guarda definitivamente en la BD hasta pulsar "Guardar"
      Alert.alert('Imagen subida', 'Toca "Guardar" para actualizar tu perfil.');

    } catch (error: any) {
      console.error('Error detallado:', error);
      Alert.alert('Error al subir imagen', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateProfileAndLocation() {
    setLoading(true);

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se requiere acceso a la ubicación para calcular distancias.');
      setLoading(false);
      return;
    }

    const location = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = location.coords;

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert('Error', 'No hay sesión activa.');
      setLoading(false);
      return;
    }

    const pointLocation = `POINT(${longitude} ${latitude})`;

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: fullName,
        username: username,
        birth_date: birthDate,
        avatar_url: avatarUrl, // ESTA LÍNEA YA EXISTÍA Y AHORA TIENE LA URL
        location: pointLocation,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      Alert.alert('Error al guardar', error.message);
    } else {
      Alert.alert('¡Perfil actualizado!', 'Tus datos, foto y ubicación GPS se guardaron correctamente.');
    }

    setLoading(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Mi Perfil</Text>

      {/* --- MODIFICADO: Ahora la imagen es un botón táctil --- */}
      <TouchableOpacity onPress={pickAndUploadImage} style={styles.avatarWrapper} disabled={loading}>
        <Image 
          source={{ uri: avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400' }} 
          style={styles.avatar} 
        />
        <View style={styles.overlay}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.editText}>Editar</Text>}
        </View>
      </TouchableOpacity>
      <Text style={styles.helpText}>Toca tu foto para cambiarla</Text>

      <Text style={styles.label}>Nombre Completo:</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: Juan Pérez"
        value={fullName}
        onChangeText={setFullName}
      />

      <Text style={styles.label}>Nombre de Usuario:</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej: juanp"
        value={username}
        onChangeText={setUsername}
        autoCapitalize='none'
      />

      <Text style={styles.label}>Fecha de Nacimiento (AAAA-MM-DD):</Text>
      <TextInput
        style={styles.input}
        placeholder="1995-05-20"
        value={birthDate}
        onChangeText={setBirthDate}
      />

      <TouchableOpacity style={styles.button} onPress={updateProfileAndLocation} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Guardar y Actualizar GPS</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  
  // Nuevos estilos para la foto interactiva
  avatarWrapper: { alignSelf: 'center', position: 'relative', marginBottom: 5, borderRadius: 60, overflow: 'hidden' },
  avatar: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#ddd' },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', padding: 4, alignItems: 'center' },
  editText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  helpText: { fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 20, fontStyle: 'italic' },

  label: { fontSize: 14, color: '#333', marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, marginBottom: 16, backgroundColor: '#f9f9f9' },
  button: { backgroundColor: '#007AFF', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10, elevation: 2 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
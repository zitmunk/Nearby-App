import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

const RELATIONSHIP_OPTIONS = ['Amistad', 'Citas', 'Casual / Express', 'Networking'];
const PREFERENCE_OPTIONS = ['Hombres', 'Mujeres', 'Hombres trans', 'Mujeres trans', 'Me da igual'];

export default function OnboardingScreen() {
  const router = useRouter();
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [showGenderDropdown, setShowGenderDropdown] = useState(false);
  
  // Estados para las dos secciones de búsqueda
  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [preference, setPreference] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(false);

  const handleDateChange = (text: string) => {
    let cleaned = text.replace(/[^0-9]/g, '');
    let formatted = cleaned;
    if (cleaned.length > 2 && cleaned.length <= 4) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    } else if (cleaned.length > 4) {
      formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`;
    }
    setBirthDate(formatted);
  };

  const calculateAge = (dateString: string) => {
    const [day, month, year] = dateString.split('/').map(Number);
    const birthDateObj = new Date(year, month - 1, day);
    const today = new Date();
    let age = today.getFullYear() - birthDateObj.getFullYear();
    const m = today.getMonth() - birthDateObj.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDateObj.getDate())) age--;
    return age;
  };

  const toggleSelection = (option: string, list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (list.includes(option)) {
      setter(list.filter((item) => item !== option));
    } else {
      setter([...list, option]);
    }
  };

  const handleSaveProfile = async () => {
    if (birthDate.length < 10 || !gender || lookingFor.length === 0 || preference.length === 0) {
      Alert.alert('¡Atención!', 'Por favor completa todos los campos.');
      return;
    }

    const age = calculateAge(birthDate);
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      age,
      gender,
      looking_for: lookingFor.join(', '),
      preference: preference.join(', '),
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    });

    setLoading(false);
    if (error) Alert.alert('Error', 'No se pudo guardar.');
    else router.replace('/feed');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <LinearGradient colors={['#0284c7', '#090d16']} style={styles.headerGradient}>
        <Text style={styles.logo}>N·O·W</Text>
        <Text style={styles.subtitle}>Completa tu perfil para comenzar</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.formContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>Fecha de nacimiento</Text>
        <TextInput 
          style={styles.input} 
          placeholder="DD/MM/AAAA" 
          placeholderTextColor="#64748b" 
          keyboardType="numeric" 
          maxLength={10} 
          value={birthDate} 
          onChangeText={handleDateChange} 
        />

        <Text style={styles.label}>Tu género</Text>
        <TouchableOpacity style={styles.dropdownSelector} onPress={() => setShowGenderDropdown(!showGenderDropdown)} activeOpacity={0.8}>
          <Text style={styles.dropdownSelectorText}>{gender || 'Selecciona...'}</Text>
        </TouchableOpacity>
        
        {showGenderDropdown && (
          <View style={styles.dropdownList}>
            {['Hombre', 'Mujer', 'Hombre trans', 'Mujer trans', 'Prefiero no decirlo'].map(item => (
              <TouchableOpacity key={item} style={styles.dropdownItem} onPress={() => { setGender(item); setShowGenderDropdown(false); }}>
                <Text style={styles.dropdownItemText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>¿Qué buscas? (Tipo de relación)</Text>
        <View style={styles.checkboxContainer}>
          {RELATIONSHIP_OPTIONS.map(opt => (
            <CheckboxItem key={opt} label={opt} isSelected={lookingFor.includes(opt)} onPress={() => toggleSelection(opt, lookingFor, setLookingFor)} />
          ))}
        </View>

        <Text style={styles.label}>¿A quién buscas? (Preferencias)</Text>
        <View style={styles.checkboxContainer}>
          {PREFERENCE_OPTIONS.map(opt => (
            <CheckboxItem key={opt} label={opt} isSelected={preference.includes(opt)} onPress={() => toggleSelection(opt, preference, setPreference)} />
          ))}
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile} disabled={loading} activeOpacity={0.8}>
          <Text style={styles.saveButtonText}>{loading ? 'Guardando...' : '¡Comenzar!'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Componente para las opciones seleccionables
const CheckboxItem = ({ label, isSelected, onPress }: any) => (
  <TouchableOpacity style={[styles.checkboxItem, isSelected && styles.checkboxItemSelected]} onPress={onPress} activeOpacity={0.8}>
    <Text style={[styles.checkboxText, isSelected && styles.checkboxTextSelected]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  headerGradient: { paddingVertical: 50, paddingHorizontal: 20, alignItems: 'center', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  logo: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: 5, marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#94a3b8', fontWeight: '500' },
  
  formContainer: { padding: 24, paddingBottom: 60 },
  label: { fontSize: 14, fontWeight: '600', color: '#e2e8f0', marginTop: 18, marginBottom: 8 },
  
  input: { 
    backgroundColor: '#111827', 
    padding: 14, 
    borderRadius: 14, 
    borderWidth: 1, 
    borderColor: '#1f2937', 
    color: '#f9fafb',
    fontSize: 16
  },
  
  dropdownSelector: { 
    backgroundColor: '#111827', 
    padding: 14, 
    borderRadius: 14, 
    borderWidth: 1, 
    borderColor: '#1f2937',
    justifyContent: 'center'
  },
  dropdownSelectorText: { color: '#f9fafb', fontSize: 16 },
  
  dropdownList: { 
    backgroundColor: '#111827', 
    borderRadius: 14, 
    marginTop: 6, 
    borderWidth: 1, 
    borderColor: '#1f2937',
    overflow: 'hidden'
  },
  dropdownItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  dropdownItemText: { color: '#f9fafb', fontSize: 15 },
  
  checkboxContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checkboxItem: { 
    paddingVertical: 10, 
    paddingHorizontal: 16, 
    borderRadius: 20, 
    backgroundColor: '#111827', 
    borderWidth: 1, 
    borderColor: '#1f2937' 
  },
  checkboxItemSelected: { backgroundColor: '#0c4a6e', borderColor: '#38bdf8' },
  checkboxText: { color: '#94a3b8', fontSize: 14 },
  checkboxTextSelected: { color: '#bae6fd', fontWeight: 'bold' },
  
  saveButton: { 
    backgroundColor: '#0284c7', 
    marginTop: 35, 
    padding: 16, 
    borderRadius: 14, 
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4
  },
  saveButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
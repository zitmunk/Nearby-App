// app/onboarding.tsx
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { Screen } from '../components/Screen';
import { Colors } from '../constants/Colors';
import { supabase } from '../supabase';

const RELATIONSHIP_OPTIONS = ['Amistad', 'Citas', 'Casual / Express', 'Networking'];
const PREFERENCE_OPTIONS = ['Hombres', 'Mujeres', 'Hombres trans', 'Mujeres trans', 'Me da igual'];

const MIN_AGE = 18;
const MAX_AGE = 80;

const getMaxDate = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - MIN_AGE);
  return d;
};

const getMinDate = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - MAX_AGE);
  return d;
};

export default function OnboardingScreen() {
  const router = useRouter();
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(new Date(2000, 0, 1));

  const [gender, setGender] = useState('');
  const [showGenderDropdown, setShowGenderDropdown] = useState(false);

  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [preference, setPreference] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);

  // ============================================================
  // HELPERS DE FECHA
  // ============================================================
  const formatDateForDisplay = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatDateForDB = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
  };

  const calculateAge = (date: Date): number => {
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const m = today.getMonth() - date.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < date.getDate())) age--;
    return age;
  };

  // ============================================================
  // HANDLERS DEL DATE PICKER
  // ============================================================
  const openDatePicker = () => {
    setTempDate(birthDate || new Date(2000, 0, 1));
    setShowDatePicker(true);
  };

  const onChangeDate = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'set' && selectedDate) {
        setBirthDate(selectedDate);
      }
    } else {
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  const onConfirmDateIOS = () => {
    setBirthDate(tempDate);
    setShowDatePicker(false);
  };

  const onCancelDateIOS = () => {
    setShowDatePicker(false);
  };

  // ============================================================
  // SELECCIÓN MÚLTIPLE
  // ============================================================
  const toggleSelection = (option: string, list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (list.includes(option)) {
      setter(list.filter((item) => item !== option));
    } else {
      setter([...list, option]);
    }
  };

  // ============================================================
  // GUARDAR PERFIL
  // ============================================================
  const handleSaveProfile = async () => {
    if (!birthDate) {
      Alert.alert('Fecha requerida', 'Por favor selecciona tu fecha de nacimiento.');
      return;
    }

    const age = calculateAge(birthDate);

    if (age < MIN_AGE) {
      Alert.alert(
        'Edad mínima',
        `Lo sentimos, debes tener al menos ${MIN_AGE} años para usar NOW.\n\nSegún tu fecha tendrías ${age} años.`
      );
      return;
    }

    if (age > MAX_AGE) {
      Alert.alert(
        '¡Uy! 😅',
        `Lo sentimos, eres muy "old school" para esto ✌️\n\nEsta app es para menores de ${MAX_AGE} años. Pero hey, ¡la juventud es una actitud! 🎉`
      );
      return;
    }

    if (!gender) {
      Alert.alert('Falta género', 'Selecciona tu género para continuar.');
      return;
    }

    if (lookingFor.length === 0) {
      Alert.alert('Falta qué buscas', 'Selecciona al menos una opción en "¿Qué buscas?".');
      return;
    }

    if (preference.length === 0) {
      Alert.alert('Faltan preferencias', 'Selecciona al menos una opción en "¿A quién buscas?".');
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      birth_date: formatDateForDB(birthDate),
      gender: gender,
      looking_for: lookingFor.join(', '),
      preference: preference.join(', '),
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    });

    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.replace('/feed');
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <Screen
      scroll={false}
      backgroundColor={Colors.background}
      paddingHorizontal={0}
      paddingTop={0}
      paddingBottom={0}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        {/* HEADER PLANO - igual que el feed */}
        <View style={styles.header}>
          <Text style={styles.logo}>N·O·W</Text>
          <Text style={styles.subtitle}>Completa tu perfil para comenzar</Text>
        </View>

        <TouchableWithoutFeedback onPress={() => setShowGenderDropdown(false)}>
          <ScrollView contentContainerStyle={styles.formContainer} showsVerticalScrollIndicator={false}>

            {/* FECHA DE NACIMIENTO */}
            <Text style={styles.label}>Fecha de nacimiento</Text>
            <TouchableOpacity
              style={styles.input}
              onPress={openDatePicker}
              activeOpacity={0.8}
            >
              <Text style={{ color: birthDate ? Colors.textPrimary : Colors.textMuted, fontSize: 16 }}>
                {birthDate ? formatDateForDisplay(birthDate) : 'Selecciona tu fecha'}
              </Text>
            </TouchableOpacity>

            {showDatePicker && (
              <>
                <DateTimePicker
                  value={birthDate || tempDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={getMaxDate()}
                  minimumDate={getMinDate()}
                  onChange={onChangeDate}
                  locale="es-ES"
                />
                {Platform.OS === 'ios' && (
                  <View style={styles.datePickerButtons}>
                    <TouchableOpacity
                      style={styles.datePickerButton}
                      onPress={onCancelDateIOS}
                    >
                      <Text style={styles.datePickerButtonText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.datePickerButton, styles.datePickerButtonPrimary]}
                      onPress={onConfirmDateIOS}
                    >
                      <Text style={[styles.datePickerButtonText, styles.datePickerButtonTextPrimary]}>
                        Listo
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {/* GÉNERO */}
            <Text style={styles.label}>Tu género</Text>
            <TouchableOpacity
              style={styles.dropdownSelector}
              onPress={() => setShowGenderDropdown(!showGenderDropdown)}
              activeOpacity={0.8}
            >
              <Text style={[styles.dropdownSelectorText, !gender && { color: Colors.textMuted }]}>
                {gender || 'Selecciona...'}
              </Text>
            </TouchableOpacity>

            {showGenderDropdown && (
              <View style={styles.dropdownList}>
                {['Hombre', 'Mujer', 'Hombre trans', 'Mujer trans', 'Prefiero no decirlo'].map(item => (
                  <TouchableOpacity
                    key={item}
                    style={styles.dropdownItem}
                    onPress={() => { setGender(item); setShowGenderDropdown(false); }}
                  >
                    <Text style={styles.dropdownItemText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* QUÉ BUSCAS */}
            <Text style={styles.label}>¿Qué buscas? (Tipo de relación)</Text>
            <View style={styles.checkboxContainer}>
              {RELATIONSHIP_OPTIONS.map(opt => (
                <CheckboxItem
                  key={opt}
                  label={opt}
                  isSelected={lookingFor.includes(opt)}
                  onPress={() => toggleSelection(opt, lookingFor, setLookingFor)}
                />
              ))}
            </View>

            {/* PREFERENCIAS */}
            <Text style={styles.label}>¿A quién buscas? (Preferencias)</Text>
            <View style={styles.checkboxContainer}>
              {PREFERENCE_OPTIONS.map(opt => (
                <CheckboxItem
                  key={opt}
                  label={opt}
                  isSelected={preference.includes(opt)}
                  onPress={() => toggleSelection(opt, preference, setPreference)}
                />
              ))}
            </View>

            {/* BOTÓN GUARDAR */}
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveProfile}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={styles.saveButtonText}>
                {loading ? 'Guardando...' : '¡Comenzar!'}
              </Text>
            </TouchableOpacity>

          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ============================================================
// CHECKBOX ITEM
// ============================================================
const CheckboxItem = ({ label, isSelected, onPress }: any) => (
  <TouchableOpacity
    style={[styles.checkboxItem, isSelected && styles.checkboxItemSelected]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text style={[styles.checkboxText, isSelected && styles.checkboxTextSelected]}>{label}</Text>
  </TouchableOpacity>
);

// ============================================================
// ESTILOS — todos basados en Colors.ts
// ============================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  logo: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },

  formContainer: { padding: 24, paddingBottom: 60 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 18,
    marginBottom: 8,
  },

  input: {
    backgroundColor: Colors.card,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textPrimary,
    fontSize: 16,
    justifyContent: 'center',
    minHeight: 50,
  },

  dropdownSelector: {
    backgroundColor: Colors.card,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
  },
  dropdownSelectorText: { color: Colors.textPrimary, fontSize: 16 },

  dropdownList: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  dropdownItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dropdownItemText: { color: Colors.textPrimary, fontSize: 15 },

  checkboxContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checkboxItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  checkboxItemSelected: {
    backgroundColor: Colors.primary,       // amarillo
    borderColor: Colors.primary,
  },
  checkboxText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  checkboxTextSelected: {
    color: '#000',                          // negro sobre amarillo
    fontWeight: 'bold',
  },

  saveButton: {
    backgroundColor: Colors.primary,        // amarillo
    marginTop: 35,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  saveButtonText: {
    color: '#000',                          // negro sobre amarillo
    fontWeight: 'bold',
    fontSize: 16,
  },

  datePickerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
  },
  datePickerButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  datePickerButtonPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  datePickerButtonText: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  datePickerButtonTextPrimary: {
    color: '#000',
    fontWeight: '700',
  },
});
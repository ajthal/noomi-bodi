import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  Image,
  Alert,
  ActionSheetIOS,
} from 'react-native';
import {
  launchImageLibrary,
  launchCamera,
  type ImagePickerResponse,
  type CameraOptions,
} from 'react-native-image-picker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type { SavedMeal, SavedMealInput } from '../services/savedMeals';
import { useTheme } from '../contexts/ThemeContext';
import BottomSheet from './BottomSheet';

const IMAGE_OPTS: CameraOptions = {
  mediaType: 'photo',
  includeBase64: true,
  maxWidth: 512,
  maxHeight: 512,
  quality: 0.7,
};

interface Props {
  visible: boolean;
  existing?: SavedMeal | null;
  prefill?: { name: string; calories: number; protein: number; carbs: number; fat: number } | null;
  onSave: (input: SavedMealInput) => void;
  onCancel: () => void;
}

function Field({
  label,
  value,
  onChangeText,
  numeric,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  numeric?: boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={s.field}>
      <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[
          s.fieldInput,
          multiline && s.fieldInputMultiline,
          {
            backgroundColor: colors.inputBg,
            borderColor: colors.inputBorder,
            color: colors.text,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={numeric ? 'number-pad' : 'default'}
        returnKeyType={multiline ? 'default' : 'done'}
        selectTextOnFocus
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
      />
    </View>
  );
}

export default function SavedMealModal({
  visible,
  existing,
  prefill,
  onSave,
  onCancel,
}: Props) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [notes, setNotes] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    if (existing) {
      setName(existing.name);
      setCalories(String(existing.calories));
      setProtein(String(existing.protein));
      setCarbs(String(existing.carbs));
      setFat(String(existing.fat));
      setNotes(existing.notes || '');
      setImageBase64(null);
      setImagePreviewUri(existing.imageUrl || null);
    } else if (prefill) {
      setName(prefill.name);
      setCalories(String(prefill.calories));
      setProtein(String(prefill.protein));
      setCarbs(String(prefill.carbs));
      setFat(String(prefill.fat));
      setNotes('');
      setImageBase64(null);
      setImagePreviewUri(null);
    } else {
      setName('');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
      setNotes('');
      setImageBase64(null);
      setImagePreviewUri(null);
    }
  }, [visible, existing, prefill]);

  const handleImageResult = useCallback((result: ImagePickerResponse) => {
    if (result.didCancel || result.errorCode || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!asset.base64 || !asset.uri) return;
    setImageBase64(asset.base64);
    setImagePreviewUri(asset.uri);
  }, []);

  const handlePickImage = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        idx => {
          if (idx === 1) launchCamera(IMAGE_OPTS, handleImageResult);
          else if (idx === 2) launchImageLibrary(IMAGE_OPTS, handleImageResult);
        },
      );
    } else {
      Alert.alert('Add Photo', 'Choose an option', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: () => launchCamera(IMAGE_OPTS, handleImageResult) },
        { text: 'Choose from Library', onPress: () => launchImageLibrary(IMAGE_OPTS, handleImageResult) },
      ]);
    }
  }, [handleImageResult]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Missing name', 'Please enter a meal name.');
      return;
    }

    onSave({
      name: trimmedName,
      calories: parseInt(calories, 10) || 0,
      protein: parseInt(protein, 10) || 0,
      carbs: parseInt(carbs, 10) || 0,
      fat: parseInt(fat, 10) || 0,
      notes: notes.trim() || null,
      imageBase64,
    });
  };

  const isEditing = !!existing;

  return (
    <BottomSheet visible={visible} onClose={onCancel}>
      <Text style={[s.title, { color: colors.text }]}>{isEditing ? 'Edit Saved Meal' : 'New Saved Meal'}</Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.scrollContent}
      >
        <TouchableOpacity style={s.imagePickerBtn} onPress={handlePickImage}>
          {imagePreviewUri ? (
            <Image source={{ uri: imagePreviewUri }} style={s.imagePreview} />
          ) : (
            <View style={[s.imagePlaceholder, { borderColor: colors.borderLight }]}>
              <Ionicons name="camera-outline" size={28} color={colors.textTertiary} />
              <Text style={[s.imagePlaceholderText, { color: colors.textTertiary }]}>Add Photo</Text>
            </View>
          )}
        </TouchableOpacity>

        <Field label="Meal Name" value={name} onChangeText={setName} placeholder="e.g. Morning Oatmeal" />
        <Field label="Calories" value={calories} onChangeText={setCalories} numeric />
        <Field label="Protein (g)" value={protein} onChangeText={setProtein} numeric />
        <Field label="Carbs (g)" value={carbs} onChangeText={setCarbs} numeric />
        <Field label="Fat (g)" value={fat} onChangeText={setFat} numeric />
        <Field
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Ingredients, preparation, etc."
        />
      </ScrollView>

      <View style={s.actions}>
        <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
          <Text style={s.saveText}>{isEditing ? 'Update' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  imagePickerBtn: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 14,
  },
  imagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  fieldInputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  actions: {
    marginTop: 16,
    paddingHorizontal: 20,
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MealData } from '../services/storage';
import { useTheme } from '../contexts/ThemeContext';
import BottomSheet from './BottomSheet';

interface Props {
  visible: boolean;
  initialData: MealData;
  onSave: (data: MealData) => void;
  onCancel: () => void;
}

function Field({
  label,
  value,
  onChangeText,
  numeric,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  numeric?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={s.field}>
      <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[
          s.fieldInput,
          {
            backgroundColor: colors.inputBg,
            borderColor: colors.inputBorder,
            color: colors.text,
          },
        ]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={numeric ? 'number-pad' : 'default'}
        returnKeyType="done"
        selectTextOnFocus
      />
    </View>
  );
}

export default function EditMealModal({ visible, initialData, onSave, onCancel }: Props) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  useEffect(() => {
    if (visible) {
      setName(initialData.name);
      setCalories(String(initialData.calories));
      setProtein(String(initialData.protein));
      setCarbs(String(initialData.carbs));
      setFat(String(initialData.fat));
    }
  }, [visible, initialData]);

  const handleSave = () => {
    onSave({
      name: name.trim() || initialData.name,
      calories: parseInt(calories, 10) || 0,
      protein: parseInt(protein, 10) || 0,
      carbs: parseInt(carbs, 10) || 0,
      fat: parseInt(fat, 10) || 0,
    });
  };

  return (
    <BottomSheet visible={visible} onClose={onCancel}>
      <Text style={[s.title, { color: colors.text }]}>Edit Meal</Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.scrollContent}
      >
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Calories" value={calories} onChangeText={setCalories} numeric />
        <Field label="Protein (g)" value={protein} onChangeText={setProtein} numeric />
        <Field label="Carbs (g)" value={carbs} onChangeText={setCarbs} numeric />
        <Field label="Fat (g)" value={fat} onChangeText={setFat} numeric />
      </ScrollView>

      <View style={s.actions}>
        <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
          <Text style={s.saveText}>Save & Log</Text>
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

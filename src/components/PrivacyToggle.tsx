import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface PrivacyToggleProps {
  isPrivate: boolean;
  onToggle: (value: boolean) => void;
}

export default function PrivacyToggle({ isPrivate, onToggle }: PrivacyToggleProps) {
  const { colors } = useTheme();

  return (
    <View style={[s.container, { borderColor: colors.border }]}>
      <View style={s.textContainer}>
        <Text style={[s.label, { color: colors.text }]}>Private Account</Text>
        <Text style={[s.description, { color: colors.textSecondary }]}>
          Friends can't see your activity or progress
        </Text>
      </View>
      <Switch
        value={isPrivate}
        onValueChange={onToggle}
        trackColor={{ false: colors.inputBorder, true: '#4CAF50' }}
        thumbColor="#fff"
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  textContainer: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    marginTop: 2,
  },
});

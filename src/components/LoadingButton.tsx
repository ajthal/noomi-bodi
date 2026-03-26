import React, { useState, useCallback } from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { getUserFriendlyError } from '../utils/errorMessages';
import { useTheme } from '../contexts/ThemeContext';

interface LoadingButtonProps {
  title: string;
  onPress: () => Promise<void>;
  style?: ViewStyle;
  textStyle?: TextStyle;
  /** External loading override (e.g. when parent controls the state). */
  loading?: boolean;
  disabled?: boolean;
  /** If true, errors are thrown to caller instead of shown as Alert. */
  suppressErrorAlert?: boolean;
}

export function LoadingButton({
  title,
  onPress,
  style,
  textStyle,
  loading: externalLoading,
  disabled,
  suppressErrorAlert,
}: LoadingButtonProps) {
  const { colors } = useTheme();
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = externalLoading ?? internalLoading;

  const handlePress = useCallback(async () => {
    if (isLoading || disabled) return;
    setInternalLoading(true);
    try {
      await onPress();
    } catch (err) {
      if (!suppressErrorAlert) {
        Alert.alert('Error', getUserFriendlyError(err));
      } else {
        throw err;
      }
    } finally {
      setInternalLoading(false);
    }
  }, [onPress, isLoading, disabled, suppressErrorAlert]);

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: colors.accent },
        style,
        (isLoading || disabled) && styles.disabled,
      ]}
      onPress={handlePress}
      activeOpacity={0.7}
      disabled={isLoading || disabled}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={[styles.text, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
});

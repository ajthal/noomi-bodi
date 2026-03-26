import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  /** If true, renders inline (no flex:1). */
  compact?: boolean;
}

export function ErrorState({
  message = 'Something went wrong.',
  onRetry,
  compact,
}: ErrorStateProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, !compact && styles.fullScreen, { backgroundColor: compact ? undefined : colors.background }]}>
      <Icon name="cloud-offline-outline" size={48} color={colors.textTertiary} />
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.accent }]}
          onPress={onRetry}
          activeOpacity={0.7}
        >
          <Icon name="refresh" size={18} color="#fff" style={styles.retryIcon} />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  fullScreen: {
    flex: 1,
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 20,
  },
  retryIcon: {
    marginRight: 6,
  },
  retryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useImpersonation } from '../contexts/ImpersonationContext';

export default function ImpersonationBanner(): React.JSX.Element | null {
  const { isImpersonating, isSwitching, impersonatedLabel, switchBack } = useImpersonation();
  const insets = useSafeAreaInsets();

  if (!isImpersonating) return null;

  return (
    <View style={[s.container, { paddingTop: insets.top + 4 }]}>
      <View style={s.content}>
        <Ionicons name="eye-outline" size={16} color="#ffffff" />
        <Text style={s.label} numberOfLines={1}>
          Viewing as {impersonatedLabel}
        </Text>
        <TouchableOpacity
          style={s.switchBackBtn}
          onPress={switchBack}
          disabled={isSwitching}
          activeOpacity={0.7}
        >
          {isSwitching ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Text style={s.switchBackText}>Switch Back</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#EF4444',
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  switchBackBtn: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  switchBackText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
});

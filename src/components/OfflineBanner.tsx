import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';

interface OfflineBannerProps {
  isOnline: boolean;
  pendingCount: number;
}

export function OfflineBanner({ isOnline, pendingCount }: OfflineBannerProps) {
  const height = useRef(new Animated.Value(0)).current;
  const [showBackOnline, setShowBackOnline] = useState(false);
  const wasOfflineRef = useRef(false);

  const visible = !isOnline || pendingCount > 0 || showBackOnline;

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
    } else if (wasOfflineRef.current && pendingCount === 0) {
      wasOfflineRef.current = false;
      setShowBackOnline(true);
      const timer = setTimeout(() => setShowBackOnline(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, pendingCount]);

  useEffect(() => {
    Animated.timing(height, {
      toValue: visible ? 28 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [visible, height]);

  let label: string;
  let bgColor: string;
  if (showBackOnline) {
    label = 'Back online';
    bgColor = '#4CAF50';
  } else if (!isOnline) {
    label = 'You are offline';
    bgColor = '#FF9800';
  } else {
    label = `Syncing ${pendingCount} pending item${pendingCount !== 1 ? 's' : ''}…`;
    bgColor = '#FF9800';
  }

  return (
    <Animated.View style={[styles.banner, { height, backgroundColor: bgColor }]}>
      <Text style={styles.text} numberOfLines={1}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});

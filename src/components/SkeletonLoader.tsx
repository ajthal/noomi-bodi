import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

function usePulse() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return opacity;
}

interface SkeletonProps {
  style?: ViewStyle;
}

export function SkeletonText({ style, lines = 3, lastLineWidth = '60%' }: SkeletonProps & { lines?: number; lastLineWidth?: string }) {
  const { colors } = useTheme();
  const opacity = usePulse();

  return (
    <View style={style}>
      {Array.from({ length: lines }).map((_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.textLine,
            { backgroundColor: colors.border, opacity },
            i === lines - 1 ? { width: lastLineWidth as any } : null,
          ]}
        />
      ))}
    </View>
  );
}

export function SkeletonCircle({ style, size = 48 }: SkeletonProps & { size?: number }) {
  const { colors } = useTheme();
  const opacity = usePulse();

  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.border, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ style, height = 100 }: SkeletonProps & { height?: number }) {
  const { colors } = useTheme();
  const opacity = usePulse();

  return (
    <Animated.View
      style={[
        styles.card,
        { height, backgroundColor: colors.border, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonRow({ style }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = usePulse();

  return (
    <View style={[styles.row, style]}>
      <Animated.View style={[styles.rowCircle, { backgroundColor: colors.border, opacity }]} />
      <View style={styles.rowLines}>
        <Animated.View style={[styles.textLine, { backgroundColor: colors.border, opacity, width: '70%' }]} />
        <Animated.View style={[styles.textLine, { backgroundColor: colors.border, opacity, width: '45%' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  textLine: {
    height: 12,
    borderRadius: 6,
    marginBottom: 10,
    width: '100%',
  },
  card: {
    borderRadius: 14,
    width: '100%',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  rowCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  rowLines: {
    flex: 1,
  },
});

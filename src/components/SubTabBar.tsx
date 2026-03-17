import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';

export interface SubTabIcon {
  name: string;
  badge?: boolean;
}

interface SubTabBarProps {
  icons: SubTabIcon[];
  activeIndex: number;
  onPress: (index: number) => void;
}

export default function SubTabBar({ icons, activeIndex, onPress }: SubTabBarProps): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={[s.container, { borderBottomColor: colors.borderLight }]}>
      <View style={[s.segmented, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {icons.map((icon, i) => {
          const isActive = i === activeIndex;
          return (
            <TouchableOpacity
              key={icon.name}
              style={[s.segment, isActive && [s.segmentActive, { backgroundColor: colors.accent }]]}
              onPress={() => onPress(i)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={icon.name}
                size={18}
                color={isActive ? '#fff' : colors.textSecondary}
              />
              {icon.badge && (
                <View style={s.badgeDot} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  segment: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  segmentActive: {
    borderRadius: 9,
  },
  badgeDot: {
    position: 'absolute',
    top: 4,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2196F3',
  },
});

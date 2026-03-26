import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';

export interface TabGroup {
  key: string;
  label: string;
  icon: string;
  iconFocused: string;
}

const STANDARD_TABS: TabGroup[] = [
  { key: 'Home', label: 'Home', icon: 'home-outline', iconFocused: 'home' },
  { key: 'Meals', label: 'Meals', icon: 'restaurant-outline', iconFocused: 'restaurant' },
  { key: 'Reports', label: 'Reports', icon: 'stats-chart-outline', iconFocused: 'stats-chart' },
  { key: 'Social', label: 'Social', icon: 'people-outline', iconFocused: 'people' },
];

const ADMIN_TAB: TabGroup = {
  key: 'Admin',
  label: 'Admin',
  icon: 'shield-checkmark-outline',
  iconFocused: 'shield-checkmark',
};

interface CustomBottomTabBarProps {
  activeGroup: string;
  onTabPress: (groupKey: string) => void;
  showAdmin: boolean;
}

export default function CustomBottomTabBar({
  activeGroup,
  onTabPress,
  showAdmin,
}: CustomBottomTabBarProps): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tabs = showAdmin ? [...STANDARD_TABS, ADMIN_TAB] : STANDARD_TABS;

  return (
    <View
      style={[
        s.bar,
        {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.tabBarBorder,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {tabs.map(tab => {
        const focused = tab.key === activeGroup;
        const color = focused ? colors.tabBarActive : colors.tabBarInactive;
        return (
          <TouchableOpacity
            key={tab.key}
            style={s.tab}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={focused ? tab.iconFocused : tab.icon}
              size={24}
              color={color}
            />
            <Text style={[s.label, { color }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  label: {
    fontSize: 10,
    marginTop: 2,
  },
});

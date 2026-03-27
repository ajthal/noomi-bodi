import React, { useState, useCallback } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation, useNavigationState } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import { loadUserProfile } from '../services/storage';

export default function TopBar(): React.JSX.Element {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);

  const activeTabName = useNavigationState(state => {
    const tabRoute = state?.routes?.[0];
    const tabState = tabRoute?.state;
    if (tabState) {
      const activeRoute = tabState.routes[tabState.index ?? 0];
      return activeRoute?.name ?? 'Home';
    }
    return 'Home';
  });

  useFocusEffect(
    useCallback(() => {
      loadUserProfile().then(profile => {
        setPictureUrl(profile?.profilePictureUrl ?? null);
      });
    }, []),
  );

  return (
    <View style={[s.bar, { backgroundColor: colors.background, borderBottomColor: colors.borderLight }]}>
      <TouchableOpacity
        onPress={() => navigation.navigate('ProfileScreen')}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {pictureUrl ? (
          <Image source={{ uri: pictureUrl }} style={s.avatar} />
        ) : (
          <View style={[s.avatarPlaceholder, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="person" size={18} color={colors.textTertiary} />
          </View>
        )}
      </TouchableOpacity>

      <View style={s.rightIcons}>
        <TouchableOpacity
          onPress={() => navigation.navigate('FeedbackScreen', { sourceScreen: activeTabName })}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="bug-outline" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('ChatScreen')}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const AVATAR_SIZE = 32;

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
});

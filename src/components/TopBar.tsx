import React, { useState, useCallback } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import { loadUserProfile } from '../services/storage';

export default function TopBar(): React.JSX.Element {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);

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

      <TouchableOpacity
        onPress={() => navigation.navigate('ChatScreen')}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
      </TouchableOpacity>
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
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import { SkeletonCircle, SkeletonText, SkeletonCard } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { getUserFriendlyError } from '../utils/errorMessages';
import { getPublicProfile, PublicProfile } from '../services/profileService';
import {
  getFriendshipStatus,
  removeFriend,
  RelationshipStatus,
} from '../services/friendships';

interface FriendProfileScreenProps {
  route: any;
  navigation: any;
}

export default function FriendProfileScreen({ route, navigation }: FriendProfileScreenProps) {
  const { colors, isDark } = useTheme();
  const { userId } = route.params;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [relationship, setRelationship] = useState<RelationshipStatus>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getPublicProfile(userId),
      getFriendshipStatus(userId),
    ]).then(([p, fs]) => {
      setProfile(p);
      setRelationship(fs.status);
      setFriendshipId(fs.friendshipId);
      setLoading(false);
    });
  }, [userId]);

  const handleRemoveFriend = () => {
    if (!friendshipId || !profile) return;
    Alert.alert(
      'Remove Friend',
      `Remove @${profile.username || 'this user'} as a friend?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFriend(friendshipId);
              setRelationship('none');
              setFriendshipId(null);
            } catch (error) {
              console.error('Remove friend failed:', error);
              Alert.alert('Error', getUserFriendlyError(error));
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Profile</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={s.content}>
          <View style={s.profileHeader}>
            <SkeletonCircle style={s.avatarSkeleton} size={120} />
            <SkeletonText lines={1} lastLineWidth="40%" style={s.skeletonUsername} />
            <SkeletonText lines={1} lastLineWidth="30%" style={s.skeletonDisplayName} />
            <SkeletonText lines={2} lastLineWidth="70%" style={s.skeletonBio} />
          </View>
          <SkeletonCard height={60} style={s.skeletonCard} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[s.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Profile</Text>
          <View style={{ width: 24 }} />
        </View>
        <EmptyState
          icon="person-outline"
          title="User not found"
          subtitle="This profile may have been removed or the link is invalid."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>@{profile.username || 'user'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* Profile header */}
        <View style={s.profileHeader}>
          {profile.profilePictureUrl ? (
            <Image source={{ uri: profile.profilePictureUrl }} style={s.avatar} />
          ) : (
            <View style={[s.avatarPlaceholder, { backgroundColor: colors.inputBg }]}>
              <Ionicons name="person" size={50} color={colors.textTertiary} />
            </View>
          )}
          <Text style={[s.username, { color: colors.text }]}>@{profile.username || 'user'}</Text>
          {profile.displayName ? (
            <Text style={[s.displayName, { color: colors.textSecondary }]}>{profile.displayName}</Text>
          ) : null}
          {profile.bio ? (
            <Text style={[s.bio, { color: colors.textSecondary }]}>{profile.bio}</Text>
          ) : null}
          {relationship === 'accepted' && (
            <View style={[s.friendBadge, { backgroundColor: '#4CAF5020' }]}>
              <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
              <Text style={s.friendBadgeText}>Friends</Text>
            </View>
          )}
        </View>

        {/* Privacy notice */}
        {profile.isPrivate && relationship === 'accepted' && (
          <View style={[s.privacyNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
            <View style={s.privacyTextContainer}>
              <Text style={[s.privacyTitle, { color: colors.text }]}>Private Account</Text>
              <Text style={[s.privacyDescription, { color: colors.textSecondary }]}>
                You can still share meals with each other
              </Text>
            </View>
          </View>
        )}

        {/* Actions */}
        {relationship === 'accepted' && (
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.removeBtn, { borderColor: colors.error }]}
              onPress={handleRemoveFriend}
            >
              <Ionicons name="person-remove-outline" size={18} color={colors.error} />
              <Text style={[s.removeBtnText, { color: colors.error }]}>Remove Friend</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarSkeleton: {
    alignSelf: 'center',
  },
  skeletonUsername: {
    marginTop: 14,
    alignSelf: 'center',
  },
  skeletonDisplayName: {
    marginTop: 8,
    alignSelf: 'center',
  },
  skeletonBio: {
    marginTop: 8,
    alignSelf: 'center',
  },
  skeletonCard: {
    marginTop: 0,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 14,
  },
  displayName: {
    fontSize: 16,
    marginTop: 4,
  },
  bio: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  friendBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4CAF50',
  },
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  privacyTextContainer: {
    flex: 1,
  },
  privacyTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  privacyDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    marginTop: 16,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  removeBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});

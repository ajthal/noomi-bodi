import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SkeletonCircle, SkeletonText } from '../components/SkeletonLoader';
import { getUserFriendlyError } from '../utils/errorMessages';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary } from 'react-native-image-picker';
import { useTheme } from '../contexts/ThemeContext';
import { loadUserProfile, UserProfile } from '../services/storage';
import {
  validateUsername,
  checkUsernameAvailable,
  uploadProfilePicture,
  updateProfileFields,
} from '../services/profileService';
import { validateDisplayName, validateBio } from '../utils/profanityFilter';
import { isAdmin } from '../utils/roleCheck';

interface EditProfileScreenProps {
  navigation: any;
}

export default function EditProfileScreen({ navigation }: EditProfileScreenProps) {
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);

  const [original, setOriginal] = useState<{
    username: string;
    displayName: string;
    bio: string;
    pictureUrl: string | null;
  } | null>(null);

  useEffect(() => {
    Promise.all([loadUserProfile(), isAdmin()]).then(([profile, admin]) => {
      setIsAdminUser(admin);
      if (profile) {
        const u = profile.username || '';
        const d = profile.displayName || '';
        const b = profile.bio || '';
        const p = profile.profilePictureUrl || null;
        setUsername(u);
        setDisplayName(d);
        setBio(b);
        setPictureUrl(p);
        setOriginal({ username: u, displayName: d, bio: b, pictureUrl: p });
      }
      setLoading(false);
    });
  }, []);

  const hasChanges = original
    ? username !== original.username ||
      displayName !== original.displayName ||
      bio !== original.bio ||
      pictureUrl !== original.pictureUrl
    : false;

  const handleUsernameBlur = useCallback(async () => {
    const err = validateUsername(username, isAdminUser);
    if (err) {
      setUsernameError(err);
      return;
    }
    if (username === original?.username) {
      setUsernameError(null);
      return;
    }
    const available = await checkUsernameAvailable(username);
    setUsernameError(available ? null : 'This username is already taken');
  }, [username, original, isAdminUser]);

  const handlePickImage = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      maxWidth: 400,
      maxHeight: 400,
      quality: 0.8,
      includeBase64: true,
    });

    const asset = result.assets?.[0];
    if (result.didCancel || !asset?.base64) return;

    setUploading(true);
    try {
      const url = await uploadProfilePicture(asset.base64);
      setPictureUrl(url);
    } catch (error) {
      console.error('Upload failed:', error);
      Alert.alert('Upload failed', getUserFriendlyError(error));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const err = validateUsername(username, isAdminUser);
    if (err) {
      setUsernameError(err);
      return;
    }

    const dnErr = validateDisplayName(displayName, isAdminUser);
    if (dnErr) {
      setDisplayNameError(dnErr);
      return;
    }

    const bioErr = validateBio(bio, isAdminUser);
    if (bioErr) {
      setBioError(bioErr);
      return;
    }

    if (username !== original?.username) {
      const available = await checkUsernameAvailable(username);
      if (!available) {
        setUsernameError('This username is already taken');
        return;
      }
    }

    setSaving(true);
    try {
      await updateProfileFields({
        username,
        display_name: displayName || null,
        bio: bio || null,
      });
      Alert.alert('Saved', 'Your profile has been updated.');
      navigation.goBack();
    } catch (error) {
      console.error('Save failed:', error);
      Alert.alert('Error', getUserFriendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Edit Profile</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={s.content}>
          <View style={s.pictureSection}>
            <SkeletonCircle style={s.pictureSkeleton} size={120} />
          </View>
          <SkeletonText lines={1} lastLineWidth="30%" style={s.skeletonLabel} />
          <SkeletonText lines={1} lastLineWidth="100%" style={s.skeletonInput} />
          <SkeletonText lines={1} lastLineWidth="25%" style={s.skeletonLabel} />
          <SkeletonText lines={1} lastLineWidth="80%" style={s.skeletonInput} />
          <SkeletonText lines={1} lastLineWidth="15%" style={s.skeletonLabel} />
          <SkeletonText lines={3} lastLineWidth="60%" style={s.skeletonInput} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Edit Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Profile picture */}
          <View style={s.pictureSection}>
            {uploading ? (
              <View style={[s.pictureContainer, { backgroundColor: colors.inputBg }]}>
                <ActivityIndicator size="large" color={colors.accent} />
              </View>
            ) : pictureUrl ? (
              <Image source={{ uri: pictureUrl }} style={s.picture} />
            ) : (
              <View style={[s.pictureContainer, { backgroundColor: colors.inputBg }]}>
                <Ionicons name="person" size={50} color={colors.textTertiary} />
              </View>
            )}
            <TouchableOpacity onPress={handlePickImage} style={s.changePhotoBtn}>
              <Text style={[s.changePhotoText, { color: colors.accent }]}>Change Photo</Text>
            </TouchableOpacity>
          </View>

          {/* Username */}
          <Text style={[s.label, { color: colors.textSecondary }]}>Username</Text>
          <TextInput
            style={[
              s.input,
              { color: colors.text, backgroundColor: colors.inputBg, borderColor: usernameError ? colors.error : colors.inputBorder },
            ]}
            placeholder="e.g. sarah_fit"
            placeholderTextColor={colors.textTertiary}
            value={username}
            onChangeText={t => {
              setUsername(t.toLowerCase());
              setUsernameError(null);
            }}
            onBlur={handleUsernameBlur}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
          />
          {usernameError && <Text style={[s.errorText, { color: colors.error }]}>{usernameError}</Text>}

          {/* Display name */}
          <Text style={[s.label, { color: colors.textSecondary }]}>Display Name</Text>
          <TextInput
            style={[s.input, displayNameError ? { borderColor: colors.error } : undefined, { color: colors.text, backgroundColor: colors.inputBg, borderColor: displayNameError ? colors.error : colors.inputBorder }]}
            placeholder="Optional friendly name"
            placeholderTextColor={colors.textTertiary}
            value={displayName}
            onChangeText={t => {
              setDisplayName(t);
              setDisplayNameError(null);
            }}
            autoCorrect={false}
            autoCapitalize="words"
          />
          {displayNameError && <Text style={[s.errorText, { color: colors.error }]}>{displayNameError}</Text>}

          {/* Bio */}
          <Text style={[s.label, { color: colors.textSecondary }]}>Bio</Text>
          <TextInput
            style={[s.input, s.bioInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: bioError ? colors.error : colors.inputBorder }]}
            placeholder="Tell friends about yourself..."
            placeholderTextColor={colors.textTertiary}
            value={bio}
            onChangeText={t => {
              setBio(t.slice(0, 150));
              setBioError(null);
            }}
            multiline
            textAlignVertical="top"
            maxLength={150}
          />
          {bioError ? (
            <Text style={[s.errorText, { color: colors.error }]}>{bioError}</Text>
          ) : (
            <Text style={[s.charCount, { color: colors.textTertiary }]}>{bio.length}/150</Text>
          )}

          {/* Save button */}
          <TouchableOpacity
            style={[
              s.saveBtn,
              { backgroundColor: isDark ? '#ffffff' : '#111827' },
              (!hasChanges || saving || !!usernameError) && s.saveBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasChanges || saving || !!usernameError}
            activeOpacity={0.7}
          >
            {saving ? (
              <ActivityIndicator size="small" color={isDark ? '#111827' : '#ffffff'} />
            ) : (
              <Text style={[s.saveBtnText, { color: isDark ? '#111827' : '#ffffff' }]}>Save</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  pictureSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  pictureSkeleton: {
    alignSelf: 'center',
  },
  skeletonLabel: {
    marginTop: 16,
    marginBottom: 6,
  },
  skeletonInput: {
    marginTop: 6,
  },
  picture: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  pictureContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoBtn: {
    marginTop: 10,
  },
  changePhotoText: {
    fontSize: 15,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  bioInput: {
    minHeight: 80,
    maxHeight: 120,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
  },
  charCount: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },
  saveBtn: {
    marginTop: 30,
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});

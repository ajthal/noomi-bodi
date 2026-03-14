import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  ScrollView,
  Alert,
  Pressable,
  StyleSheet,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../contexts/AuthContext';
import {
  loadUserProfile,
  saveApiKey,
  getApiKey,
  clearApiKey,
} from '../services/storage';
import { updateProfileFields } from '../services/profileService';
import { OnboardingContext } from '../contexts/OnboardingContext';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';
import PrivacyToggle from '../components/PrivacyToggle';
import { getUserFriendlyError } from '../utils/errorMessages';

export default function SettingsPage(): React.JSX.Element {
  const { user, signOut } = useAuth();
  const { mode, colors, setMode } = useTheme();
  const { onResetProfile } = useContext(OnboardingContext);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    getApiKey().then(key => {
      if (key) setSavedApiKey(key);
    });
    loadUserProfile().then(profile => {
      if (profile) setIsPrivate(profile.isPrivate ?? false);
    });
  }, []);

  const maskKey = (key: string | null) => {
    if (!key) return 'No key saved';
    if (key.length <= 8) return '********';
    return `${key.slice(0, 4)}****${key.slice(-4)}`;
  };

  const handleSave = async () => {
    if (!apiKeyInput.trim()) {
      setStatus('Please enter a valid API key.');
      return;
    }
    try {
      await saveApiKey(apiKeyInput.trim());
      setSavedApiKey(apiKeyInput.trim());
      setApiKeyInput('');
      setStatus('Claude API key saved.');
    } catch (error) {
      setStatus(getUserFriendlyError(error));
    }
  };

  const handleClear = async () => {
    try {
      await clearApiKey();
      setSavedApiKey(null);
      setStatus('Claude API key cleared.');
    } catch (error) {
      setStatus(getUserFriendlyError(error));
    }
  };

  const handlePrivacyToggle = async (value: boolean) => {
    setIsPrivate(value);
    try {
      await updateProfileFields({ is_private: value });
    } catch (error) {
      setIsPrivate(!value);
      Alert.alert('Privacy update failed', getUserFriendlyError(error));
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign out',
      'This will sign you out. Your data is stored in the cloud and will be available when you sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
      ],
    );
  };

  const handleResetProfile = () => {
    Alert.alert(
      'Reset profile',
      'This will delete your plan and all chat history, and return you to setup. Your API key will be kept. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => onResetProfile() },
      ],
    );
  };

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.background }]}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Account */}
      {user && (
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Account</Text>
          <View style={s.accountRow}>
            <Ionicons name="person-circle-outline" size={22} color={colors.textSecondary} />
            <Text style={[s.accountEmail, { color: colors.text }]}>{user.email}</Text>
          </View>
        </View>
      )}

      {/* Privacy */}
      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Privacy</Text>
        <PrivacyToggle isPrivate={isPrivate} onToggle={handlePrivacyToggle} />
      </View>

      {/* API Key */}
      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Claude API Key</Text>
        <TextInput
          style={[s.input, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
          placeholder="Enter your Claude API key"
          placeholderTextColor={colors.textSecondary}
          value={apiKeyInput}
          onChangeText={setApiKeyInput}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <View style={s.buttonRow}>
          <View style={s.buttonWrapper}>
            <Button title="Save" onPress={handleSave} />
          </View>
          <View style={s.buttonWrapper}>
            <Button title="Clear Key" color="#b00020" onPress={handleClear} />
          </View>
        </View>
        <Text style={[s.savedKeyText, { color: colors.textSecondary }]}>{maskKey(savedApiKey)}</Text>
      </View>

      {/* Appearance */}
      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Appearance</Text>
        <View style={s.themeRow}>
          {(['light', 'dark', 'system'] as ThemeMode[]).map(opt => (
            <Pressable
              key={opt}
              style={[
                s.themePill,
                { borderColor: colors.border },
                mode === opt && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
              onPress={() => setMode(opt)}
            >
              <Ionicons
                name={opt === 'light' ? 'sunny-outline' : opt === 'dark' ? 'moon-outline' : 'phone-portrait-outline'}
                size={16}
                color={mode === opt ? '#fff' : colors.textSecondary}
              />
              <Text style={[s.themePillText, { color: mode === opt ? '#fff' : colors.textSecondary }]}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Actions */}
      <View style={s.section}>
        <Button title="Sign Out" onPress={handleSignOut} color="#555" />
        <View style={s.resetSpacer} />
        <Button title="Reset profile & sign out" onPress={handleResetProfile} color="#b00020" />
        <Text style={[s.resetHint, { color: colors.textSecondary }]}>
          Resets your profile, clears your plan, chat history, and meal logs, then signs you out. Your API key is kept on-device.
        </Text>
      </View>

      {status ? <Text style={[s.statusText, { color: colors.accent }]}>{status}</Text> : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  accountEmail: {
    fontSize: 15,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  buttonWrapper: {
    flex: 1,
    marginRight: 8,
  },
  savedKeyText: {
    fontSize: 14,
    marginTop: 8,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  themePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  themePillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  resetSpacer: {
    height: 12,
  },
  resetHint: {
    marginTop: 8,
    fontSize: 12,
  },
  statusText: {
    marginTop: 8,
    fontSize: 14,
  },
});

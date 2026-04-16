import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  ScrollView,
  Alert,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DeviceInfo from 'react-native-device-info';
import { version as jsBundleVersion } from '../../package.json';
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
import { useChatContext } from '../contexts/ChatContext';
import PrivacyToggle from '../components/PrivacyToggle';
import { getUserFriendlyError } from '../utils/errorMessages';

export default function SettingsPage(): React.JSX.Element {
  const { user, signOut } = useAuth();
  const { mode, colors, setMode } = useTheme();
  const { onResetProfile } = useContext(OnboardingContext);
  const { profile: chatProfile, manualClearChat, forgetEverything } = useChatContext();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);

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

  const [validating, setValidating] = useState(false);

  const handleSave = async () => {
    const key = apiKeyInput.trim();
    if (!key) {
      setStatus('Please enter a valid API key.');
      return;
    }
    if (!key.startsWith('sk-ant-')) {
      setStatus('Invalid key format. Keys should start with "sk-ant-".');
      return;
    }

    setValidating(true);
    setStatus('Validating API key...');
    try {
      // Test the key with a minimal API call
      const axios = require('axios').default;
      await axios.post(
        'https://api.anthropic.com/v1/messages',
        { model: 'claude-sonnet-4-6', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] },
        {
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'prompt-caching-2024-07-31',
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );
      await saveApiKey(key);
      setSavedApiKey(key);
      setApiKeyInput('');
      setStatus('API key validated and saved.');
    } catch (error: any) {
      const statusCode = error?.response?.status;
      if (statusCode === 401) {
        setStatus('Invalid API key. Please check and try again.');
      } else if (statusCode === 402) {
        setStatus('Your Anthropic account is out of credits. Please add credits at console.anthropic.com.');
      } else if (statusCode === 429) {
        // Rate limited means the key is valid
        await saveApiKey(key);
        setSavedApiKey(key);
        setApiKeyInput('');
        setStatus('API key validated and saved.');
      } else {
        // Other errors — still save the key but warn
        await saveApiKey(key);
        setSavedApiKey(key);
        setApiKeyInput('');
        setStatus('Key saved. Could not fully verify — please test by sending a message.');
      }
    } finally {
      setValidating(false);
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

  const handleClearChat = () => {
    Alert.alert(
      'Clear chat history',
      "This will wipe your recent chat and summary on this device. Noomi will keep remembering the durable facts about you (goals, allergies, preferences). Continue?",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearingChat(true);
            try {
              await manualClearChat();
              setStatus('Chat history cleared. Your memory is preserved.');
            } catch (error) {
              setStatus(getUserFriendlyError(error));
            } finally {
              setClearingChat(false);
            }
          },
        },
      ],
    );
  };

  const handleForgetEverything = () => {
    Alert.alert(
      'Forget everything',
      "This erases your chat history AND everything Noomi remembers about you (preferences, patterns, goals mentioned in chat). Your profile, plan, and meal logs are not affected. Continue?",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            setClearingChat(true);
            try {
              await forgetEverything();
              setStatus('Chat and memory cleared.');
            } catch (error) {
              setStatus(getUserFriendlyError(error));
            } finally {
              setClearingChat(false);
            }
          },
        },
      ],
    );
  };

  const navigation = useNavigation<any>();
  const isStandaloneScreen = useRoute().name === 'SettingsScreen';

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {isStandaloneScreen && (
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
          <View style={[s.headerBar, { borderBottomColor: colors.borderLight }]}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: colors.text }]}>Settings</Text>
            <View style={{ width: 26 }} />
          </View>
        </SafeAreaView>
      )}
      <ScrollView
        style={{ flex: 1 }}
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
            <Button title={validating ? "Validating..." : "Save"} onPress={handleSave} disabled={validating} />
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

      {/* Chat & Memory */}
      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Chat & Memory</Text>
        <View style={[s.memoryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.memoryCardTitle, { color: colors.text }]}>What Noomi remembers about you</Text>
          <Text style={[s.memoryCardBody, { color: colors.textSecondary }]}>
            {chatProfile?.aiMemory && chatProfile.aiMemory.trim()
              ? chatProfile.aiMemory.trim()
              : "Noomi hasn't built a memory yet — keep chatting and durable preferences (goals, allergies, routines) will be saved here."}
          </Text>
        </View>
        <View style={s.memoryButtonRow}>
          <View style={s.memoryButtonWrapper}>
            <Button
              title={clearingChat ? 'Working...' : 'Clear chat history'}
              onPress={handleClearChat}
              disabled={clearingChat}
              color="#555"
            />
          </View>
          <View style={s.memoryButtonWrapper}>
            <Button
              title="Forget everything"
              onPress={handleForgetEverything}
              disabled={clearingChat}
              color="#b00020"
            />
          </View>
        </View>
        <Text style={[s.memoryHint, { color: colors.textSecondary }]}>
          Clearing chat keeps Noomi's memory. "Forget everything" wipes both. Profile and meal logs are never touched here.
        </Text>
      </View>

      {/* Support */}
      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: colors.text }]}>Support</Text>
        <TouchableOpacity
          style={[s.feedbackRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.navigate('FeedbackScreen', { sourceScreen: 'Settings' })}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbox-ellipses-outline" size={20} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[s.feedbackRowTitle, { color: colors.text }]}>Submit Feedback</Text>
            <Text style={[s.feedbackRowSub, { color: colors.textSecondary }]}>
              Report a bug or suggest a feature
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
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

        {/* Version footer */}
        <View style={s.versionFooter}>
          <Text style={[s.versionText, { color: colors.textSecondary }]}>
            Version {DeviceInfo.getVersion()} ({DeviceInfo.getBuildNumber()})
          </Text>
          {jsBundleVersion !== DeviceInfo.getVersion() && (
            <Text style={[s.versionMismatchText, { color: colors.textTertiary }]}>
              JS bundle: {jsBundleVersion}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
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
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  memoryCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  memoryCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  memoryCardBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  memoryButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  memoryButtonWrapper: {
    flex: 1,
  },
  memoryHint: {
    marginTop: 8,
    fontSize: 12,
  },
  feedbackRowTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  feedbackRowSub: {
    fontSize: 12,
    marginTop: 2,
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
  versionFooter: {
    marginTop: 24,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 12,
  },
  versionMismatchText: {
    fontSize: 11,
    marginTop: 2,
    fontStyle: 'italic',
  },
});

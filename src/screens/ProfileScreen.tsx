import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Button,
  ScrollView,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../contexts/AuthContext';
import {
  loadUserProfile,
  UserProfile,
  saveApiKey,
  getApiKey,
  clearApiKey,
  estimateDailyGoals,
  MacroGoals,
} from '../services/storage';
import { OnboardingContext } from '../contexts/OnboardingContext';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';
import { cmToFeetInches, kgToLbs } from '../utils/units';

export default function ProfileScreen(): React.JSX.Element {
  const { user, signOut } = useAuth();
  const { mode, colors, setMode } = useTheme();
  const { onResetProfile } = useContext(OnboardingContext);
  const [initialLoading, setInitialLoading] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [planExpanded, setPlanExpanded] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [storedKey, storedProfile] = await Promise.all([
          getApiKey(),
          loadUserProfile(),
        ]);
        if (storedKey) setSavedApiKey(storedKey);
        if (storedProfile) setProfile(storedProfile);
      } catch (error) {
        console.warn('Failed to load profile data', error);
      } finally {
        setInitialLoading(false);
      }
    };
    loadData();
  }, []);

  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    loadUserProfile()
      .then(setProfile)
      .catch(error => {
        console.warn('Failed to refresh profile data on focus', error);
      });
  }, [isFocused]);

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
      console.warn('Failed to save Claude API key', error);
      setStatus('Failed to save key. Please try again.');
    }
  };

  const handleClear = async () => {
    try {
      await clearApiKey();
      setSavedApiKey(null);
      setStatus('Claude API key cleared.');
    } catch (error) {
      console.warn('Failed to clear Claude API key', error);
      setStatus('Failed to clear key. Please try again.');
    }
  };

  const handleResetProfile = () => {
    Alert.alert(
      'Reset profile',
      'This will delete your plan and all chat history, and return you to setup. Your API key will be kept. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await onResetProfile();
          },
        },
      ],
    );
  };

  const togglePlanExpanded = () => setPlanExpanded(prev => !prev);

  const goals: MacroGoals | null = profile ? estimateDailyGoals(profile) : null;

  const handleSignOut = () => {
    Alert.alert(
      'Sign out',
      'This will sign you out. Your data is stored in the cloud and will be available when you sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
          },
        },
      ],
    );
  };

  if (initialLoading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <ScrollView style={[s.container, { backgroundColor: colors.background }]} contentContainerStyle={s.contentContainer}>
      <Text style={[s.title, { color: colors.text }]}>Profile</Text>

      {/* Account */}
      {user && (
        <View style={s.section}>
          <Text style={[s.label, { color: colors.text }]}>Account</Text>
          <View style={s.accountRow}>
            <Ionicons name="person-circle-outline" size={22} color={colors.textSecondary} />
            <Text style={[s.accountEmail, { color: colors.text }]}>{user.email}</Text>
          </View>
        </View>
      )}

      {/* API Key */}
      <View style={s.section}>
        <Text style={[s.label, { color: colors.text }]}>Claude API Key</Text>
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
      </View>

      <View style={s.section}>
        <Text style={[s.label, { color: colors.text }]}>Saved key status</Text>
        <Text style={[s.savedKeyText, { color: colors.textSecondary }]}>{maskKey(savedApiKey)}</Text>
      </View>

      {/* Theme / Appearance */}
      <View style={s.section}>
        <Text style={[s.label, { color: colors.text }]}>Appearance</Text>
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
              <Text style={[
                s.themePillText,
                { color: mode === opt ? '#fff' : colors.textSecondary },
              ]}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Plan & Goals */}
      <View style={s.section}>
        <Text style={[s.label, { color: colors.text }]}>Your current plan</Text>
        {profile && profile.plan ? (
          <View style={[s.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {/* Profile summary line */}
            <Text style={[s.planMeta, { color: colors.textSecondary }]}>
              {profile.gender.toUpperCase()} · {profile.age}y ·{' '}
              {cmToFeetInches(profile.heightCm).feet}'
              {cmToFeetInches(profile.heightCm).inches}" ·{' '}
              {Math.round(kgToLbs(profile.weightKg))} lb
            </Text>

            {/* Goals visual */}
            {goals && <GoalsSummary goals={goals} />}

            {/* Expandable full plan text */}
            {planExpanded && (
              <View style={[s.planTextContainer, { borderTopColor: colors.border }]}>
                <Text style={[s.planText, { color: colors.text }]}>{profile.plan}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.readMoreButton, { borderTopColor: colors.border }]}
              onPress={togglePlanExpanded}
              activeOpacity={0.7}>
              <Text style={s.readMoreText}>
                {planExpanded ? 'Show less' : 'Read full plan'}
              </Text>
              <Ionicons
                name={planExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#4CAF50"
              />
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[s.planEmptyText, { color: colors.textSecondary }]}>
            Your personal plan will appear here after you complete onboarding.
          </Text>
        )}
      </View>

      {/* Sign out & Reset */}
      <View style={s.section}>
        <Button title="Sign Out" onPress={handleSignOut} color="#555" />
        <View style={s.resetSpacer} />
        <Button
          title="Reset profile & sign out"
          onPress={handleResetProfile}
          color="#b00020"
        />

        <Text style={[s.resetHint, { color: colors.textSecondary }]}>
          Resets your profile, clears your plan, chat history, and meal
          logs, then signs you out. Your API key is kept on-device.
        </Text>
      </View>

      {status ? <Text style={[s.statusText, { color: colors.accent }]}>{status}</Text> : null}
    </ScrollView>
  );
}

// ── Goals summary sub-component ───────────────────────────────────────

function GoalsSummary({ goals }: { goals: MacroGoals }) {
  const { isDark, colors } = useTheme();
  return (
    <View style={s.goalsContainer}>
      {/* Calorie ring-style highlight */}
      <View style={[s.calorieCard, { backgroundColor: isDark ? '#1b3a1b' : '#E8F5E9' }]}>
        <Text style={[s.calorieValue, { color: isDark ? '#66BB6A' : '#2E7D32' }]}>{goals.calories}</Text>
        <Text style={[s.calorieUnit, { color: colors.accent }]}>cal / day</Text>
      </View>

      {/* Macro pills */}
      <View style={s.macroPills}>
        <MacroPill label="Protein" value={goals.protein} color="#2196F3" />
        <MacroPill label="Carbs" value={goals.carbs} color="#FF9800" />
        <MacroPill label="Fat" value={goals.fat} color="#9C27B0" />
      </View>
    </View>
  );
}

function MacroPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[s.pill, { borderColor: color + '30' }]}>
      <View style={[s.pillDot, { backgroundColor: color }]} />
      <View>
        <Text style={[s.pillValue, { color }]}>{value}g</Text>
        <Text style={[s.pillLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
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
  savedKeyText: {
    fontSize: 14,
  },
  statusText: {
    marginTop: 8,
    fontSize: 14,
    color: '#006400',
  },

  // Plan card
  planCard: {
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#fafafa',
  },
  planMeta: {
    fontSize: 12,
    color: '#777',
    marginBottom: 12,
    letterSpacing: 0.3,
  },

  // Goals visual
  goalsContainer: {
    gap: 10,
  },
  calorieCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  calorieValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#2E7D32',
  },
  calorieUnit: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '500',
    marginTop: 2,
  },
  macroPills: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  pillDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pillValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  pillLabel: {
    fontSize: 10,
    color: '#888',
    marginTop: 1,
  },

  // Expandable plan
  planTextContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  planText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#333',
  },
  readMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 4,
  },
  readMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },

  planEmptyText: {
    fontSize: 14,
    color: '#777',
  },
  resetHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
  },
  resetSpacer: {
    height: 12,
  },

  // Account
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  accountEmail: {
    fontSize: 15,
    color: '#333',
  },
});

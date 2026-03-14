import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import BottomSheet from './BottomSheet';
import ThemedMarkdown from './ThemedMarkdown';
import { ErrorState } from './ErrorState';
import { getUserFriendlyError } from '../utils/errorMessages';
import { useTheme } from '../contexts/ThemeContext';
import {
  sendMessageToClaude,
  buildChatSystemPrompt,
  parsePlanText,
  stripPlanMarkers,
} from '../services/claude';
import {
  getApiKey,
  loadUserProfile,
  saveUserProfile,
  UserProfile,
} from '../services/storage';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPlanUpdated: (newPlan: string) => void;
}

export default function UpdatePlanModal({ visible, onClose, onPlanUpdated }: Props) {
  const { colors, isDark } = useTheme();
  const [request, setRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!request.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const [apiKey, profile] = await Promise.all([getApiKey(), loadUserProfile()]);
      if (!apiKey) throw new Error('No API key found');
      if (!profile) throw new Error('No profile found');

      const systemPrompt = await buildChatSystemPrompt(profile);
      const messages = [
        {
          role: 'user' as const,
          content: `I'd like to update my nutrition/fitness plan. Here's what I want to change:\n\n${request.trim()}\n\nPlease generate a complete updated plan based on my current profile and this request. Wrap the full updated plan text between [PLAN_START] and [PLAN_END] markers.`,
        },
      ];

      const rawResponse = await sendMessageToClaude(messages, apiKey, systemPrompt);
      const planText = parsePlanText(rawResponse);

      if (planText) {
        setPreview(planText);
      } else {
        const cleaned = stripPlanMarkers(rawResponse).trim();
        setPreview(cleaned);
      }
    } catch (e: any) {
      setError(getUserFriendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [request]);

  const handleSave = useCallback(async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const profile = await loadUserProfile();
      if (!profile) throw new Error('No profile found');

      const updatedProfile: UserProfile = { ...profile, plan: preview };
      await saveUserProfile(updatedProfile);
      onPlanUpdated(preview);
      handleReset();
      onClose();
    } catch (e: any) {
      setError(getUserFriendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [preview, onPlanUpdated, onClose]);

  const handleReset = () => {
    setRequest('');
    setPreview(null);
    setError(null);
    setLoading(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <View style={s.container}>
          <View style={s.header}>
            <Text style={[s.title, { color: colors.text }]}>Update Your Plan</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {!preview ? (
            <>
              <Text style={[s.description, { color: colors.textSecondary }]}>
                Describe what you'd like to change about your plan. Claude will generate an updated version for you to review.
              </Text>

              <TextInput
                style={[s.input, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
                placeholder="e.g. I want to focus more on protein, add intermittent fasting, switch to 5 meals a day..."
                placeholderTextColor={colors.textTertiary}
                value={request}
                onChangeText={setRequest}
                multiline
                textAlignVertical="top"
                maxLength={500}
                editable={!loading}
              />

              {error && (
                <ErrorState message={error} compact onRetry={() => { setError(null); handleGenerate(); }} />
              )}

              <TouchableOpacity
                style={[
                  s.generateBtn,
                  { backgroundColor: isDark ? '#ffffff' : '#111827' },
                  (!request.trim() || loading) && { opacity: 0.5 },
                ]}
                onPress={handleGenerate}
                disabled={!request.trim() || loading}
                activeOpacity={0.7}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={isDark ? '#111827' : '#ffffff'} />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={18} color={isDark ? '#111827' : '#ffffff'} />
                    <Text style={[s.generateBtnText, { color: isDark ? '#111827' : '#ffffff' }]}>
                      Generate Updated Plan
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[s.previewLabel, { color: colors.textSecondary }]}>
                Review your updated plan:
              </Text>

              <ScrollView style={[s.previewScroll, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                <ThemedMarkdown fontSize={14} lineHeight={22}>{preview}</ThemedMarkdown>
              </ScrollView>

              {error && (
                <ErrorState message={error} compact onRetry={() => { setError(null); setPreview(null); }} />
              )}

              <View style={s.actionRow}>
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: colors.inputBg, borderColor: colors.border, borderWidth: 1 }]}
                  onPress={() => setPreview(null)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={16} color={colors.text} />
                  <Text style={[s.actionBtnText, { color: colors.text }]}>Edit Request</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.actionBtn, s.saveBtn, { backgroundColor: '#4CAF50' }, loading && { opacity: 0.5 }]}
                  onPress={handleSave}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#ffffff" />
                      <Text style={[s.actionBtnText, { color: '#ffffff' }]}>Save Plan</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 100,
    maxHeight: 160,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 14,
    gap: 8,
  },
  generateBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  previewLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  previewScroll: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    maxHeight: 300,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 6,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {},
});

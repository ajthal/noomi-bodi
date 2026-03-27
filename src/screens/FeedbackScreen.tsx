import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary } from 'react-native-image-picker';
import { useTheme } from '../contexts/ThemeContext';
import { LoadingButton } from '../components/LoadingButton';
import { getUserFriendlyError } from '../utils/errorMessages';
import {
  submitFeedback,
  uploadFeedbackScreenshot,
  getDeviceContext,
  type FeedbackCategory,
} from '../services/feedback';
import createStyles from './FeedbackScreen.styles';

const CATEGORIES: { key: FeedbackCategory; label: string; icon: string }[] = [
  { key: 'bug', label: 'Bug', icon: 'bug-outline' },
  { key: 'feature', label: 'Feature', icon: 'bulb-outline' },
  { key: 'other', label: 'Other', icon: 'chatbox-ellipses-outline' },
];

interface ScreenshotItem {
  uri: string;
  base64?: string;
}

export default function FeedbackScreen(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const s = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);

  const sourceScreen = route.params?.sourceScreen ?? 'Unknown';
  const deviceInfo = useMemo(() => getDeviceContext(), []);

  const handleAddScreenshot = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
        includeBase64: true,
      });

      const asset = result.assets?.[0];
      if (result.didCancel || !asset?.uri) return;

      setScreenshots(prev => [
        ...prev,
        { uri: asset.uri!, base64: asset.base64 ?? undefined },
      ]);
    } catch (error) {
      Alert.alert('Error', getUserFriendlyError(error));
    }
  }, []);

  const handleRemoveScreenshot = useCallback((index: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please enter a short title for your feedback.');
      return;
    }

    const uploadedUrls: string[] = [];

    for (const shot of screenshots) {
      if (shot.base64) {
        try {
          const url = await uploadFeedbackScreenshot(shot.base64);
          uploadedUrls.push(url);
        } catch {
          // Skip failed uploads rather than blocking submission
        }
      }
    }

    await submitFeedback({
      category,
      title: title.trim(),
      description: description.trim() || undefined,
      screenshotUrls: uploadedUrls,
      currentScreen: sourceScreen,
    });

    Alert.alert('Thank you!', 'Your feedback has been submitted.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  }, [category, title, description, screenshots, sourceScreen, navigation]);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={[s.headerBar, { borderBottomColor: colors.borderLight }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Submit Feedback</Text>
          <View style={{ width: 26 }} />
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Category */}
        <View style={s.section}>
          <Text style={[s.label, { color: colors.text }]}>Category</Text>
          <View style={s.categoryRow}>
            {CATEGORIES.map(c => {
              const active = category === c.key;
              return (
                <Pressable
                  key={c.key}
                  style={[
                    s.categoryPill,
                    { borderColor: colors.border },
                    active && { backgroundColor: colors.accent, borderColor: colors.accent },
                  ]}
                  onPress={() => setCategory(c.key)}
                >
                  <Ionicons
                    name={c.icon}
                    size={16}
                    color={active ? '#fff' : colors.textSecondary}
                  />
                  <Text
                    style={[
                      s.categoryPillText,
                      { color: active ? '#fff' : colors.textSecondary },
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Title */}
        <View style={s.section}>
          <Text style={[s.label, { color: colors.text }]}>Title</Text>
          <TextInput
            style={[s.input, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
            placeholder="Brief summary of the issue or idea"
            placeholderTextColor={colors.textTertiary}
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            returnKeyType="next"
          />
        </View>

        {/* Description */}
        <View style={s.section}>
          <Text style={[s.label, { color: colors.text }]}>Description</Text>
          <TextInput
            style={[s.textArea, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
            placeholder="Tell us more about what happened or what you'd like to see..."
            placeholderTextColor={colors.textTertiary}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={2000}
          />
        </View>

        {/* Screenshots */}
        <View style={s.section}>
          <Text style={[s.label, { color: colors.text }]}>Screenshots</Text>
          <View style={s.screenshotRow}>
            {screenshots.map((shot, i) => (
              <View key={`${i}-${shot.uri.slice(-20)}`} style={s.screenshotWrapper}>
                <TouchableOpacity
                  style={s.removeBtn}
                  onPress={() => handleRemoveScreenshot(i)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
                <Image source={{ uri: shot.uri }} style={s.screenshotThumb} />
              </View>
            ))}
            <TouchableOpacity
              style={[s.addScreenshotBtn, { borderColor: colors.border }]}
              onPress={handleAddScreenshot}
            >
              <Ionicons name="add" size={28} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Device Context */}
        <View style={s.section}>
          <Text style={[s.label, { color: colors.textSecondary }]}>Automatically included</Text>
          <View style={[s.contextCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.contextRow}>
              <Text style={[s.contextLabel, { color: colors.textSecondary }]}>Screen</Text>
              <Text style={[s.contextValue, { color: colors.textTertiary }]}>{sourceScreen}</Text>
            </View>
            <View style={s.contextRow}>
              <Text style={[s.contextLabel, { color: colors.textSecondary }]}>Device</Text>
              <Text style={[s.contextValue, { color: colors.textTertiary }]}>{deviceInfo.model}</Text>
            </View>
            <View style={s.contextRow}>
              <Text style={[s.contextLabel, { color: colors.textSecondary }]}>OS</Text>
              <Text style={[s.contextValue, { color: colors.textTertiary }]}>
                {deviceInfo.os} {deviceInfo.osVersion}
              </Text>
            </View>
            <View style={s.contextRow}>
              <Text style={[s.contextLabel, { color: colors.textSecondary }]}>App Version</Text>
              <Text style={[s.contextValue, { color: colors.textTertiary }]}>
                {deviceInfo.appVersion} ({deviceInfo.buildNumber})
              </Text>
            </View>
          </View>
        </View>

        {/* Submit */}
        <LoadingButton
          title="Submit Feedback"
          onPress={handleSubmit}
          style={s.submitBtn}
        />
      </ScrollView>
    </View>
  );
}

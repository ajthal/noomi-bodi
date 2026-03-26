import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  ActivityLevel,
  Goal,
  Gender,
  UserProfile,
  saveUserProfile,
  getApiKey,
  saveApiKey,
  estimateDailyGoals,
  parseMacrosFromPlanText,
} from '../services/storage';
import { generatePlanWithClaude } from '../services/claude';
import { feetInchesToCm, lbsToKg } from '../utils/units';
import {
  validateUsername,
  checkUsernameAvailable,
  suggestUsernameFromEmail,
} from '../services/profileService';
import { supabase } from '../services/supabase';
import ThemedMarkdown from '../components/ThemedMarkdown';
import { createStyles } from './OnboardingScreen.styles.tsx';

interface OnboardingScreenProps {
  onComplete: () => void;
  onSignIn?: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const STEP_LABELS = ['API Key', 'Info', 'Goals', 'Activity', 'Account', 'Username', 'Details', 'Plan'];

const goalLabels: { value: Goal; label: string }[] = [
  { value: 'lose', label: 'Lose weight' },
  { value: 'maintain', label: 'Maintain weight' },
  { value: 'gain', label: 'Gain weight' },
];

const genderLabels: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const activityLabels: { value: ActivityLevel; label: string; description: string }[] = [
  {
    value: 'sedentary',
    label: 'Sedentary',
    description: 'Desk job, little to no exercise',
  },
  {
    value: 'light',
    label: 'Lightly active',
    description: 'Light exercise 1–3 days/week',
  },
  {
    value: 'moderate',
    label: 'Moderately active',
    description: 'Moderate exercise 3–5 days/week',
  },
  {
    value: 'active',
    label: 'Active',
    description: 'Hard exercise 6–7 days/week',
  },
  {
    value: 'very_active',
    label: 'Very active',
    description: 'Physical job or intense training',
  },
];

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim().replace(',', '.');
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const generateBasicPlan = (profile: UserProfile): string => {
  const { age, gender, heightCm, weightKg, goal, activityLevel } = profile;

  const s = gender === 'male' ? 5 : gender === 'female' ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + s;

  const activityMultipliers: Record<ActivityLevel, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };

  let calories = bmr * activityMultipliers[activityLevel];

  if (goal === 'lose') {
    calories -= 400;
  } else if (goal === 'gain') {
    calories += 300;
  }

  const roundedCalories = Math.round(calories / 50) * 50;

  const protein = Math.round(weightKg * (goal === 'gain' ? 2.0 : 1.6));
  const fat = Math.round(0.8 * weightKg);
  const carbs = Math.max(
    0,
    Math.round((roundedCalories - protein * 4 - fat * 9) / 4),
  );

  return [
    'Here is a simple starting point for you:',
    '',
    `• Daily calories: ~${roundedCalories} kcal`,
    `• Protein: ~${protein} g`,
    `• Carbs: ~${carbs} g`,
    `• Fats: ~${fat} g`,
    '',
    'Nutrition ideas:',
    '• Build most meals around lean proteins, colourful veg, and whole‑grain carbs.',
    '• Keep ultra‑processed snacks and sugary drinks as "sometimes" foods, not daily staples.',
    '• Aim for 2–3 balanced meals and 1–2 planned snacks instead of constant grazing.',
    '',
    'Movement ideas:',
    '• Start with a brisk 20–30 minute walk most days of the week.',
    '• Add 2 short strength sessions weekly (bodyweight is enough to start).',
    '• Prioritise sleep and stress management – they make your plan much easier to follow.',
  ].join('\n');
};

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete, onSignIn }) => {
  const { signUp, signIn, signInWithApple, signInWithGoogle, resetPassword, user } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [step, setStep] = useState<Step>(1);

  // Step 1: API key
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState('');

  // Step 2: Basic info
  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState<string>('');
  const [heightFeet, setHeightFeet] = useState<string>('');
  const [heightInches, setHeightInches] = useState<string>('');
  const [weightLbs, setWeightLbs] = useState<string>('');

  // Step 3: Goals
  const [goal, setGoal] = useState<Goal>('lose');
  const [targetWeightLbs, setTargetWeightLbs] = useState<string>('');

  // Step 4: Activity
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('sedentary');

  // Step 5: Auth
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignInMode, setIsSignInMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // Step 6: Username
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Step 7: Extra details (only if API key was entered)
  const [extraDetails, setExtraDetails] = useState<string>('');

  // Step 7: Plan
  const [isGenerating, setIsGenerating] = useState(false);
  const [planText, setPlanText] = useState<string | null>(null);

  useEffect(() => {
    getApiKey().then(key => {
      if (key) {
        setHasExistingKey(true);
        const last4 = key.slice(-4);
        setMaskedKey(`sk-ant-...${last4}`);
      }
    });
  }, []);

  const handleSocialSignIn = async (provider: 'apple' | 'google') => {
    setAuthLoading(true);
    try {
      const signInFn = provider === 'apple' ? signInWithApple : signInWithGoogle;
      const { error, cancelled } = await signInFn();
      if (cancelled) return;
      if (error) {
        Alert.alert('Sign in failed', error);
        return;
      }
      await advanceAfterAuth();
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Enter your email', 'Please enter your email address first.');
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await resetPassword(trimmedEmail);
      if (error) {
        Alert.alert('Reset failed', error);
      } else {
        Alert.alert('Check your email', 'We sent a password reset link to your email.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const advanceAfterAuth = async () => {
    // Auto-suggest username from email
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser?.email && !usernameInput) {
      setUsernameInput(suggestUsernameFromEmail(currentUser.email));
    }
    setStep(6);
  };

  const goNext = async () => {
    if (step === 1) {
      if (isEditingKey || !hasExistingKey) {
        const trimmedKey = apiKeyInput.trim();
        if (trimmedKey) {
          await saveApiKey(trimmedKey);
          setHasExistingKey(true);
        }
      }
      setStep(2);
    } else if (step === 2) {
      // Info validation
      const ageNum = parseNumber(age);
      const feetNum = parseNumber(heightFeet);
      const inchesRaw = heightInches.trim();
      const inchesNum =
        inchesRaw.length === 0 ? 0 : Number(inchesRaw.replace(',', '.'));
      const weightNum = parseNumber(weightLbs);

      if (
        !ageNum ||
        !feetNum ||
        !Number.isFinite(inchesNum) ||
        inchesNum < 0 ||
        inchesNum >= 12 ||
        !weightNum
      ) {
        Alert.alert(
          'Check your details',
          'Please enter valid age, height in feet/inches, and weight in lb.',
        );
        return;
      }
      setStep(3);
    } else if (step === 3) {
      // Goals validation
      if (goal !== 'maintain') {
        const targetNum = parseNumber(targetWeightLbs);
        if (!targetNum) {
          Alert.alert(
            'Target weight',
            'Please enter a valid target weight (or switch to "Maintain weight").',
          );
          return;
        }
      }
      setStep(4);
    } else if (step === 4) {
      // Activity → check if already authenticated to skip Account step
      if (user) {
        await advanceAfterAuth();
      } else {
        setStep(5);
      }
    } else if (step === 5) {
      // Account (sign up / sign in)
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();

      if (!trimmedEmail || !trimmedPassword) {
        Alert.alert('Missing fields', 'Please enter both email and password.');
        return;
      }
      if (trimmedPassword.length < 6) {
        Alert.alert('Weak password', 'Password must be at least 6 characters.');
        return;
      }

      setAuthLoading(true);
      try {
        if (isSignInMode) {
          const { error } = await signIn(trimmedEmail, trimmedPassword);
          if (error) {
            Alert.alert('Sign in failed', error);
            return;
          }
        } else {
          const { error } = await signUp(trimmedEmail, trimmedPassword);
          if (error) {
            Alert.alert('Sign up failed', error);
            return;
          }
        }
        await advanceAfterAuth();
      } finally {
        setAuthLoading(false);
      }
    } else if (step === 6) {
      // Username validation
      const err = validateUsername(usernameInput);
      if (err) {
        setUsernameError(err);
        return;
      }
      const available = await checkUsernameAvailable(usernameInput);
      if (!available) {
        setUsernameError('This username is already taken. Try another.');
        return;
      }
      setUsernameError(null);
      const hasKey = apiKeyInput.trim().length > 0 || !!(await getApiKey());
      if (hasKey) {
        setStep(7);
      } else {
        handleGeneratePlan();
      }
    } else if (step === 7) {
      // Details → generate plan
      handleGeneratePlan();
    }
  };

  const goBack = () => {
    if (step === 1 || step === 8 || isGenerating) return;
    if (step === 6 && user) {
      setStep(4);
      return;
    }
    setStep((prev: Step) => (prev - 1) as Step);
  };

  const handleGeneratePlan = async () => {
    const ageNum = parseNumber(age)!;
    const feetNum = parseNumber(heightFeet)!;
    const inchesRaw = heightInches.trim();
    const inchesNum =
      inchesRaw.length === 0 ? 0 : Number(inchesRaw.replace(',', '.'));
    const weightLbsNum = parseNumber(weightLbs)!;
    const heightCm = feetInchesToCm(feetNum, inchesNum);
    const weightKg = lbsToKg(weightLbsNum);
    const targetNum =
      goal === 'maintain' ? null : parseNumber(targetWeightLbs) ?? null;
    const targetWeightKg =
      goal === 'maintain' || !targetNum ? null : lbsToKg(targetNum);

    const baseProfile: UserProfile = {
      gender,
      age: ageNum,
      heightCm,
      weightKg,
      goal,
      targetWeightKg,
      activityLevel,
    };

    setIsGenerating(true);
    setStep(8);

    try {
      const apiKey = await getApiKey();

      let plan: string;
      let usedClaude = false;

      if (apiKey) {
        try {
          plan = await generatePlanWithClaude(
            baseProfile,
            apiKey,
            extraDetails.trim() || undefined,
          );
          usedClaude = true;
        } catch (error) {
          console.warn('Falling back to basic plan after Claude error', error);
          plan = generateBasicPlan(baseProfile);
        }
      } else {
        plan = generateBasicPlan(baseProfile);
      }

      const fallbackGoals = estimateDailyGoals(baseProfile);
      const parsedGoals = parseMacrosFromPlanText(plan, fallbackGoals);

      const profileToSave: UserProfile = {
        ...baseProfile,
        plan,
        username: usernameInput.trim() || null,
        ...(parsedGoals ? { dailyGoals: parsedGoals } : {}),
      };

      await saveUserProfile(profileToSave);
      setPlanText(plan);

      if (!usedClaude) {
        Alert.alert(
          'Basic plan created',
          'For a more tailored AI plan, you can add your Claude API key later in Profile settings.',
        );
      }
    } catch (error) {
      console.error('Failed to generate onboarding plan', error);
      Alert.alert(
        'Something went wrong',
        'We could not create your plan right now. Please try again in a moment.',
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Step indicator ──────────────────────────────────────────────

  const renderStepIndicator = () => {
    return (
      <View style={styles.stepIndicatorContainer}>
        {STEP_LABELS.map((label, index) => {
          const stepNumber = (index + 1) as Step;
          const isActive = step === stepNumber;
          const isCompleted = step > stepNumber;
          return (
            <View key={label} style={styles.stepItem}>
              <View
                style={[
                  styles.stepCircle,
                  isActive && styles.stepCircleActive,
                  isCompleted && styles.stepCircleCompleted,
                ]}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark" size={13} color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.stepCircleText,
                      (isActive || isCompleted) && styles.stepCircleTextActive,
                    ]}
                  >
                    {stepNumber}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  (isActive || isCompleted) && styles.stepLabelActive,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  // ── Step content ────────────────────────────────────────────────

  const renderStepContent = () => {
    // Step 1: API key
    if (step === 1) {
      const showConnected = hasExistingKey && !isEditingKey;

      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connect to Claude AI</Text>
          <Text style={styles.cardSubtitle}>
            {showConnected
              ? 'Your API key is already connected. You can continue or update it below.'
              : "NoomiBodi uses Claude to analyse meal photos and create personalised plans. You'll need an API key from Anthropic."}
          </Text>

          {showConnected ? (
            <>
              <View style={styles.connectedBanner}>
                <Ionicons name="checkmark-circle" size={22} color="#8B5CF6" />
                <Text style={styles.connectedBannerText}>API key connected</Text>
              </View>

              <View style={styles.maskedKeyContainer}>
                <Text style={styles.maskedKeyText}>{maskedKey}</Text>
                <Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />
              </View>

              <Pressable
                style={styles.changeKeyButton}
                onPress={() => setIsEditingKey(true)}
              >
                <Text style={styles.changeKeyText}>Change key</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.instructionBox}>
                <Text style={styles.instructionTitle}>How to get your API key</Text>
                <View style={styles.instructionStep}>
                  <Text style={styles.instructionNumber}>1</Text>
                  <Text style={styles.instructionText}>
                    Visit{' '}
                    <Text
                      style={styles.link}
                      onPress={() => Linking.openURL('https://console.anthropic.com')}
                    >
                      console.anthropic.com
                    </Text>
                  </Text>
                </View>
                <View style={styles.instructionStep}>
                  <Text style={styles.instructionNumber}>2</Text>
                  <Text style={styles.instructionText}>Create an account or sign in</Text>
                </View>
                <View style={styles.instructionStep}>
                  <Text style={styles.instructionNumber}>3</Text>
                  <Text style={styles.instructionText}>Navigate to Settings → API Keys</Text>
                </View>
                <View style={styles.instructionStep}>
                  <Text style={styles.instructionNumber}>4</Text>
                  <Text style={styles.instructionText}>Create a new key and paste it below</Text>
                </View>
              </View>

              <Text style={styles.fieldLabel}>API Key</Text>
              <TextInput
                style={styles.input}
                placeholder="sk-ant-api03-..."
                placeholderTextColor={colors.textTertiary}
                value={apiKeyInput}
                onChangeText={setApiKeyInput}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.apiKeyHint}>
                {apiKeyInput.trim()
                  ? 'Your key will be saved securely on this device.'
                  : "You can skip this step, but meal photo analysis and AI plans won't be available until you add a key in Profile settings."}
              </Text>
            </>
          )}
        </View>
      );
    }

    // Step 2: Basic info
    if (step === 2) {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tell us about you</Text>
          <Text style={styles.cardSubtitle}>
            This helps NoomiBodi personalise your plan.
          </Text>

          <Text style={styles.fieldLabel}>Gender</Text>
          <View style={styles.chipRow}>
            {genderLabels.map(option => (
              <Pressable
                key={option.value}
                style={[
                  styles.chip,
                  gender === option.value && styles.chipSelected,
                ]}
                onPress={() => setGender(option.value)}
              >
                <Text
                  style={[
                    styles.chipText,
                    gender === option.value && styles.chipTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Age</Text>
          <TextInput
            style={styles.input}
            placeholder="Years"
            keyboardType="numeric"
            value={age}
            onChangeText={setAge}
          />

          <Text style={styles.fieldLabel}>Height (ft / in)</Text>
          <View style={styles.heightRow}>
            <TextInput
              style={[styles.input, styles.heightInput]}
              placeholder="Feet"
              keyboardType="numeric"
              value={heightFeet}
              onChangeText={setHeightFeet}
            />
            <TextInput
              style={[styles.input, styles.heightInput]}
              placeholder="Inches"
              keyboardType="numeric"
              value={heightInches}
              onChangeText={setHeightInches}
            />
          </View>

          <Text style={styles.fieldLabel}>Current weight (lb)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 170"
            keyboardType="numeric"
            value={weightLbs}
            onChangeText={setWeightLbs}
          />
        </View>
      );
    }

    // Step 3: Goals
    if (step === 3) {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your goal</Text>
          <Text style={styles.cardSubtitle}>
            What are you hoping to achieve with NoomiBodi?
          </Text>

          <Text style={styles.fieldLabel}>Goal</Text>
          <View style={styles.chipRow}>
            {goalLabels.map(option => (
              <Pressable
                key={option.value}
                style={[
                  styles.chip,
                  goal === option.value && styles.chipSelected,
                ]}
                onPress={() => setGoal(option.value)}
              >
                <Text
                  style={[
                    styles.chipText,
                    goal === option.value && styles.chipTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {goal !== 'maintain' && (
            <>
              <Text style={styles.fieldLabel}>Target weight (lb)</Text>
              <TextInput
                style={styles.input}
                placeholder="Where would you like to get to?"
                keyboardType="numeric"
                value={targetWeightLbs}
                onChangeText={setTargetWeightLbs}
              />
            </>
          )}
        </View>
      );
    }

    // Step 4: Activity
    if (step === 4) {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Activity level</Text>
          <Text style={styles.cardSubtitle}>
            No need to impress us – be honest so the plan is realistic.
          </Text>

          {activityLabels.map(option => (
            <Pressable
              key={option.value}
              style={[
                styles.activityRow,
                activityLevel === option.value && styles.activityRowSelected,
              ]}
              onPress={() => setActivityLevel(option.value)}
            >
              <View style={styles.radioOuter}>
                {activityLevel === option.value && <View style={styles.radioInner} />}
              </View>
              <View style={styles.activityTextContainer}>
                <Text
                  style={[
                    styles.activityLabel,
                    activityLevel === option.value && styles.activityLabelSelected,
                  ]}
                >
                  {option.label}
                </Text>
                <Text style={styles.activityDescription}>{option.description}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      );
    }

    // Step 5: Account (email + social auth)
    if (step === 5) {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {isSignInMode ? 'Welcome back' : 'Create your account'}
          </Text>
          <Text style={styles.cardSubtitle}>
            {isSignInMode
              ? 'Sign in to access your data.'
              : 'Create an account to save your data in the cloud.'}
          </Text>

          {Platform.OS === 'ios' && (
            <Pressable
              style={[styles.socialButton, styles.appleButton]}
              onPress={() => handleSocialSignIn('apple')}
              disabled={authLoading}
            >
              <Ionicons name="logo-apple" size={20} color={isDark ? '#000000' : '#ffffff'} />
              <Text style={styles.appleButtonText}>Continue with Apple</Text>
            </Pressable>
          )}

          <Pressable
            style={[styles.socialButton, styles.googleButton]}
            onPress={() => handleSocialSignIn('google')}
            disabled={authLoading}
          >
            <Ionicons name="logo-google" size={18} color="#ffffff" />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!authLoading}
          />

          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType={isSignInMode ? 'password' : 'newPassword'}
            editable={!authLoading}
          />

          {isSignInMode && (
            <Pressable
              onPress={handleForgotPassword}
              disabled={authLoading}
              style={styles.forgotPassword}
            >
              <Text style={styles.forgotPasswordText}>Forgot password?</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => setIsSignInMode(prev => !prev)}
            style={styles.authToggle}
          >
            <Text style={styles.authToggleText}>
              {isSignInMode
                ? "Don't have an account? Sign Up"
                : 'Already have an account? Sign In'}
            </Text>
          </Pressable>
        </View>
      );
    }

    // Step 6: Username
    if (step === 6) {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Choose a username</Text>
          <Text style={styles.cardSubtitle}>
            Your username is how friends will find you on NoomiBodi.
          </Text>

          <Text style={styles.fieldLabel}>Username</Text>
          <TextInput
            style={[styles.input, usernameError ? { borderColor: colors.error } : undefined]}
            placeholder="e.g. sarah_fit"
            placeholderTextColor={colors.textTertiary}
            value={usernameInput}
            onChangeText={t => {
              setUsernameInput(t.toLowerCase());
              setUsernameError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
          />
          {usernameError && (
            <Text style={{ color: colors.error, fontSize: 12, marginTop: 4 }}>
              {usernameError}
            </Text>
          )}
          <Text style={styles.apiKeyHint}>
            3-20 characters. Letters, numbers, and underscores only.
          </Text>
        </View>
      );
    }

    // Step 7: Extra details
    if (step === 7) {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Anything else we should know?</Text>
          <Text style={styles.cardSubtitle}>
            Injuries, dietary preferences, time constraints, or anything that helps tailor
            your plan.
          </Text>

          <TextInput
            style={[styles.input, styles.extraInput]}
            placeholder="E.g. I have a knee injury and prefer home workouts, I work night shifts, I'm vegetarian..."
            multiline
            textAlignVertical="top"
            value={extraDetails}
            onChangeText={setExtraDetails}
          />
        </View>
      );
    }

    // Step 8: Plan
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your starting plan</Text>
        <Text style={styles.cardSubtitle}>
          Here's a simple plan to get you moving in the right direction.
        </Text>

        {isGenerating && (
          <View style={styles.generatingContainer}>
            <ActivityIndicator size="large" color={colors.text} />
            <Text style={styles.generatingText}>Creating your plan…</Text>
          </View>
        )}

        {!isGenerating && planText && (
          <ScrollView
            style={styles.planScroll}
            contentContainerStyle={styles.planContent}
            nestedScrollEnabled
          >
            <ThemedMarkdown fontSize={14} lineHeight={22}>{planText}</ThemedMarkdown>
          </ScrollView>
        )}
      </View>
    );
  };

  // ── Button labels ───────────────────────────────────────────────

  const renderPrimaryButtonLabel = () => {
    if (step === 1) {
      if (hasExistingKey && !isEditingKey) return 'Continue';
      return apiKeyInput.trim() ? 'Save & Continue' : 'Skip for Now';
    }
    if (step === 5) return isSignInMode ? 'Sign In' : 'Sign Up';
    if (step === 6) return 'Next';
    if (step === 7) return 'Generate my plan';
    if (step === 8) return 'Start using NoomiBodi';
    return 'Next';
  };

  const isPrimaryDisabled = () => {
    if (step === 5) return authLoading || !email.trim() || !password.trim();
    if (step === 6) return !usernameInput.trim();
    if (step === 8) return isGenerating || !planText;
    return isGenerating;
  };

  const handlePrimaryAction = () => {
    if (step === 8) {
      onComplete();
      return;
    }
    goNext();
  };

  // ── Render ──────────────────────────────────────────────────────

  const renderHeader = () => (
    <>
      <Text style={styles.title}>Welcome to NoomiBodi</Text>
      <Text style={styles.subtitle}>
        Answer a few quick questions so we can tailor things to you.
      </Text>
      {renderStepIndicator()}
    </>
  );

  const renderFooter = () => (
    <View style={styles.footer}>
      {step === 1 || step === 8 ? (
        <>
          <Pressable
            style={[
              styles.primaryButton,
              styles.primaryButtonFull,
              isPrimaryDisabled() && styles.primaryButtonDisabled,
            ]}
            disabled={isPrimaryDisabled()}
            onPress={handlePrimaryAction}
          >
            <Text style={styles.primaryButtonText}>{renderPrimaryButtonLabel()}</Text>
          </Pressable>
          {step === 1 && onSignIn && (
            <Pressable onPress={onSignIn} style={styles.signInLink}>
              <Text style={styles.signInLinkText}>
                Returning user? <Text style={styles.signInLinkTextBold}>Sign in here</Text>
              </Text>
            </Pressable>
          )}
        </>
      ) : (
        <View style={styles.footerButtons}>
          <Pressable
            style={[
              styles.secondaryButton,
              (isGenerating || authLoading) && styles.secondaryButtonDisabled,
            ]}
            disabled={isGenerating || authLoading}
            onPress={goBack}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                (isGenerating || authLoading) &&
                  styles.secondaryButtonTextDisabled,
              ]}
            >
              Back
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.primaryButton,
              isPrimaryDisabled() && styles.primaryButtonDisabled,
            ]}
            disabled={isPrimaryDisabled()}
            onPress={handlePrimaryAction}
          >
            {(step === 5 && authLoading) ? (
              <ActivityIndicator size="small" color={isDark ? '#121212' : '#ffffff'} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {renderPrimaryButtonLabel()}
              </Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );

  if (step === 8) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {renderHeader()}
          <View style={styles.content}>
            {renderStepContent()}
          </View>
          {renderFooter()}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.container}>
            {renderHeader()}
            <ScrollView
              style={styles.content}
              contentContainerStyle={{flexGrow: 1}}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {renderStepContent()}
            </ScrollView>
            {renderFooter()}
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default OnboardingScreen;

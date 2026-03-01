import React, { useState } from 'react';
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
import {
  ActivityLevel,
  Goal,
  Gender,
  UserProfile,
  saveUserProfile,
  loadUserProfile,
  getApiKey,
  saveApiKey,
} from '../services/storage';
import { generatePlanWithClaude } from '../services/claude';
import { feetInchesToCm, lbsToKg } from '../utils/units';
import { styles } from './OnboardingScreen.styles.tsx';

interface OnboardingScreenProps {
  onComplete: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEP_LABELS = ['API Key', 'Info', 'Goals', 'Activity', 'Account', 'Details', 'Plan'];

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

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const { signUp, signIn, user } = useAuth();
  const [step, setStep] = useState<Step>(1);

  // Step 1: API key
  const [apiKeyInput, setApiKeyInput] = useState('');

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

  // Step 6: Extra details (only if API key was entered)
  const [extraDetails, setExtraDetails] = useState<string>('');

  // Step 7: Plan
  const [isGenerating, setIsGenerating] = useState(false);
  const [planText, setPlanText] = useState<string | null>(null);

  const advanceAfterAuth = async () => {
    const hasKey = apiKeyInput.trim().length > 0 || !!(await getApiKey());
    if (hasKey) {
      setStep(6);
    } else {
      handleGeneratePlan();
    }
  };

  const goNext = async () => {
    if (step === 1) {
      // API Key
      const trimmedKey = apiKeyInput.trim();
      if (trimmedKey) {
        await saveApiKey(trimmedKey);
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
          const profile = await loadUserProfile();
          if (profile) {
            onComplete();
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
      // Details → generate plan
      handleGeneratePlan();
    }
  };

  const goBack = () => {
    if (step === 1 || step === 7 || isGenerating) return;
    if (step === 6 && user) {
      // If already authenticated, skip Account step when going back too
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
    setStep(7);

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

      const profileToSave: UserProfile = {
        ...baseProfile,
        plan,
      };

      await saveUserProfile(profileToSave);
      setPlanText(plan);

      if (!usedClaude) {
        Alert.alert(
          'Basic plan created',
          'For a more tailored AI plan, you can add your Claude API key later in the Profile tab.',
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
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connect to Claude AI</Text>
          <Text style={styles.cardSubtitle}>
            NoomiBodi uses Claude to analyse meal photos and create personalised plans.
            You'll need an API key from Anthropic.
          </Text>

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
            placeholderTextColor="#9ca3af"
            value={apiKeyInput}
            onChangeText={setApiKeyInput}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.apiKeyHint}>
            {apiKeyInput.trim()
              ? 'Your key will be saved securely on this device.'
              : "You can skip this step, but meal photo analysis and AI plans won't be available until you add a key in the Profile tab."}
          </Text>
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

    // Step 5: Account (email auth)
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

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#9ca3af"
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
            placeholderTextColor="#9ca3af"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType={isSignInMode ? 'password' : 'newPassword'}
            editable={!authLoading}
          />

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

    // Step 6: Extra details
    if (step === 6) {
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

    // Step 7: Plan
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your starting plan</Text>
        <Text style={styles.cardSubtitle}>
          Here's a simple plan to get you moving in the right direction.
        </Text>

        {isGenerating && (
          <View style={styles.generatingContainer}>
            <ActivityIndicator size="large" color="#111827" />
            <Text style={styles.generatingText}>Creating your plan…</Text>
          </View>
        )}

        {!isGenerating && planText && (
          <ScrollView style={styles.planScroll} contentContainerStyle={styles.planContent}>
            <Text style={styles.planText}>{planText}</Text>
          </ScrollView>
        )}
      </View>
    );
  };

  // ── Button labels ───────────────────────────────────────────────

  const renderPrimaryButtonLabel = () => {
    if (step === 1) return apiKeyInput.trim() ? 'Save & Continue' : 'Skip for Now';
    if (step === 5) return isSignInMode ? 'Sign In' : 'Sign Up';
    if (step === 6) return 'Generate my plan';
    if (step === 7) return 'Start using NoomiBodi';
    return 'Next';
  };

  const isPrimaryDisabled = () => {
    if (step === 5) return authLoading || !email.trim() || !password.trim();
    if (step === 7) return isGenerating || !planText;
    return isGenerating;
  };

  const handlePrimaryAction = () => {
    if (step === 7) {
      onComplete();
      return;
    }
    goNext();
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.container}>
            <Text style={styles.title}>Welcome to NoomiBodi</Text>
            <Text style={styles.subtitle}>
              Answer a few quick questions so we can tailor things to you.
            </Text>

            {renderStepIndicator()}

            <ScrollView
              style={styles.content}
              contentContainerStyle={{flexGrow: 1}}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {renderStepContent()}
            </ScrollView>

        <View style={styles.footer}>
          {step === 7 ? (
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
          ) : (
            <View style={styles.footerButtons}>
              <Pressable
                style={[
                  styles.secondaryButton,
                  (step === 1 || isGenerating || authLoading) && styles.secondaryButtonDisabled,
                ]}
                disabled={step === 1 || isGenerating || authLoading}
                onPress={goBack}
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    (step === 1 || isGenerating || authLoading) &&
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
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {renderPrimaryButtonLabel()}
                  </Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default OnboardingScreen;

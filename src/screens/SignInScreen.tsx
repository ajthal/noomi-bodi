import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, type ThemeColors } from '../contexts/ThemeContext';

interface SignInScreenProps {
  onSignedIn: () => void;
  onBack?: () => void;
}

const SignInScreen: React.FC<SignInScreenProps> = ({ onSignedIn, onBack }) => {
  const { signIn, signUp, signInWithApple, signInWithGoogle, resetPassword } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSocialSignIn = async (provider: 'apple' | 'google') => {
    setLoading(true);
    try {
      const fn = provider === 'apple' ? signInWithApple : signInWithGoogle;
      const { error, cancelled } = await fn();
      if (cancelled) return;
      if (error) {
        Alert.alert('Sign in failed', error);
        return;
      }
      onSignedIn();
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Enter your email', 'Please enter your email address first.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await resetPassword(trimmedEmail);
      if (error) {
        Alert.alert('Reset failed', error);
      } else {
        Alert.alert('Check your email', 'We sent a password reset link to your email.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async () => {
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

    setLoading(true);
    try {
      const authFn = isSignUpMode ? signUp : signIn;
      const { error } = await authFn(trimmedEmail, trimmedPassword);
      if (error) {
        Alert.alert(isSignUpMode ? 'Sign up failed' : 'Sign in failed', error);
        return;
      }
      onSignedIn();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.container}>
            {onBack && (
              <Pressable onPress={onBack} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </Pressable>
            )}
            <View style={styles.header}>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>
                Sign in to pick up where you left off.
              </Text>
            </View>

            <View style={styles.card}>
              {Platform.OS === 'ios' && (
                <Pressable
                  style={[styles.socialButton, styles.appleButton]}
                  onPress={() => handleSocialSignIn('apple')}
                  disabled={loading}
                >
                  <Ionicons name="logo-apple" size={20} color={isDark ? '#000000' : '#ffffff'} />
                  <Text style={styles.appleButtonText}>Continue with Apple</Text>
                </Pressable>
              )}

              <Pressable
                style={[styles.socialButton, styles.googleButton]}
                onPress={() => handleSocialSignIn('google')}
                disabled={loading}
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
                editable={!loading}
              />

              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType={isSignUpMode ? 'newPassword' : 'password'}
                editable={!loading}
              />

              {!isSignUpMode && (
                <Pressable
                  onPress={handleForgotPassword}
                  disabled={loading}
                  style={styles.forgotPassword}
                >
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </Pressable>
              )}

              <Pressable
                style={[
                  styles.primaryButton,
                  loading && styles.primaryButtonDisabled,
                ]}
                disabled={loading || !email.trim() || !password.trim()}
                onPress={handleEmailAuth}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={isDark ? '#121212' : '#ffffff'} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {isSignUpMode ? 'Sign Up' : 'Sign In'}
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => setIsSignUpMode(prev => !prev)}
                style={styles.authToggle}
              >
                <Text style={styles.authToggleText}>
                  {isSignUpMode
                    ? 'Already have an account? Sign In'
                    : "Don't have an account? Sign Up"}
                </Text>
              </Pressable>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      paddingHorizontal: 20,
      justifyContent: 'center',
    },
    backButton: {
      position: 'absolute',
      top: 12,
      left: 20,
      padding: 8,
      zIndex: 1,
    },
    header: {
      marginBottom: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 15,
      color: colors.textSecondary,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    socialButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginBottom: 10,
    },
    appleButton: {
      backgroundColor: isDark ? '#ffffff' : '#000000',
    },
    appleButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? '#000000' : '#ffffff',
    },
    googleButton: {
      backgroundColor: '#4285F4',
    },
    googleButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#ffffff',
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 16,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      marginHorizontal: 12,
      fontSize: 13,
      color: colors.textTertiary,
      fontWeight: '500',
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 10,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.inputBg,
    },
    forgotPassword: {
      alignSelf: 'flex-end',
      marginTop: 8,
      paddingVertical: 4,
    },
    forgotPasswordText: {
      fontSize: 13,
      color: '#4F46E5',
      fontWeight: '500',
    },
    primaryButton: {
      marginTop: 20,
      paddingVertical: 14,
      borderRadius: 999,
      backgroundColor: isDark ? '#ffffff' : '#111827',
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#121212' : '#ffffff',
    },
    authToggle: {
      marginTop: 12,
      alignItems: 'center',
      paddingVertical: 8,
    },
    authToggleText: {
      fontSize: 14,
      color: '#4F46E5',
      fontWeight: '500',
    },
  });

export default SignInScreen;

import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, type ThemeColors } from '../contexts/ThemeContext';

interface EmailVerificationScreenProps {
  onVerified: () => void;
}

const EmailVerificationScreen: React.FC<EmailVerificationScreenProps> = ({
  onVerified,
}) => {
  const { user, resendVerificationEmail, refreshSession } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      await refreshSession();
    }, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshSession]);

  useEffect(() => {
    if (user?.email_confirmed_at) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      onVerified();
    }
  }, [user, onVerified]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    setResending(true);
    try {
      const { error } = await resendVerificationEmail();
      if (error) {
        Alert.alert('Could not resend', error);
      } else {
        Alert.alert('Email sent', 'Check your inbox for the verification link.');
        setCooldown(60);
      }
    } finally {
      setResending(false);
    }
  };

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      await refreshSession();
      if (!user?.email_confirmed_at) {
        Alert.alert(
          'Not yet verified',
          'Please check your email and tap the verification link, then try again.',
        );
      }
    } finally {
      setChecking(false);
    }
  };

  const maskedEmail = user?.email
    ? user.email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '*'.repeat(b.length) + c)
    : '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.iconContainer}>
          <Ionicons name="mail-unread-outline" size={64} color="#4F46E5" />
        </View>

        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.subtitle}>
          We sent a verification link to
        </Text>
        <Text style={styles.email}>{maskedEmail}</Text>
        <Text style={styles.description}>
          Tap the link in your email to activate your account. Once verified,
          you'll be taken straight into the app.
        </Text>

        <Pressable
          style={[styles.primaryButton, checking && styles.buttonDisabled]}
          onPress={handleCheckNow}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator size="small" color={isDark ? '#121212' : '#ffffff'} />
          ) : (
            <Text style={styles.primaryButtonText}>I've verified my email</Text>
          )}
        </Pressable>

        <Pressable
          style={[
            styles.secondaryButton,
            (resending || cooldown > 0) && styles.buttonDisabled,
          ]}
          onPress={handleResend}
          disabled={resending || cooldown > 0}
        >
          {resending ? (
            <ActivityIndicator size="small" color="#4F46E5" />
          ) : (
            <Text style={styles.secondaryButtonText}>
              {cooldown > 0
                ? `Resend email (${cooldown}s)`
                : 'Resend verification email'}
            </Text>
          )}
        </Pressable>

        <Text style={styles.hint}>
          Don't see it? Check your spam or junk folder.
        </Text>
      </View>
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
      paddingHorizontal: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconContainer: {
      width: 112,
      height: 112,
      borderRadius: 56,
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    email: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginTop: 4,
      marginBottom: 16,
    },
    description: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 32,
      paddingHorizontal: 8,
    },
    primaryButton: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 999,
      backgroundColor: isDark ? '#ffffff' : '#111827',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    primaryButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#121212' : '#ffffff',
    },
    secondaryButton: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    secondaryButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#4F46E5',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    hint: {
      fontSize: 13,
      color: colors.textTertiary,
      textAlign: 'center',
    },
  });

export default EmailVerificationScreen;

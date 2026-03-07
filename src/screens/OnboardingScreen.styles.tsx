import { Platform, StyleSheet } from 'react-native';
import type { ThemeColors } from '../contexts/ThemeContext';

export const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    stepIndicatorContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    stepItem: {
      flex: 1,
      alignItems: 'center',
    },
    stepCircle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    stepCircleActive: {
      borderColor: colors.text,
      backgroundColor: colors.text,
    },
    stepCircleCompleted: {
      borderColor: '#10b981',
      backgroundColor: '#10b981',
    },
    stepCircleText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    stepCircleTextActive: {
      color: isDark ? '#121212' : '#ffffff',
    },
    stepLabel: {
      marginTop: 4,
      fontSize: 10,
      color: colors.textTertiary,
      textAlign: 'center',
    },
    stepLabelActive: {
      color: colors.text,
      fontWeight: '600',
    },
    content: {
      flex: 1,
    },
    card: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    cardSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 16,
    },

    connectedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: isDark ? '#064e3b' : '#ecfdf5',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#10b981' : '#a7f3d0',
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 16,
    },
    connectedBannerText: {
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? '#6ee7b7' : '#065f46',
    },
    maskedKeyContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.inputBg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 6,
    },
    maskedKeyText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    changeKeyButton: {
      marginTop: 12,
      alignSelf: 'center',
    },
    changeKeyText: {
      fontSize: 13,
      fontWeight: '500',
      color: '#4F46E5',
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

    instructionBox: {
      backgroundColor: colors.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 16,
    },
    instructionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 10,
    },
    instructionStep: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 8,
    },
    instructionNumber: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.text,
      color: colors.background,
      fontSize: 11,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 20,
      overflow: 'hidden',
    },
    instructionText: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    link: {
      color: '#2563eb',
      textDecorationLine: 'underline',
    },
    apiKeyHint: {
      fontSize: 12,
      color: colors.textTertiary,
      lineHeight: 17,
      marginTop: 10,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 10,
    },
    heightRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    heightInput: {
      flex: 1,
    },
    extraInput: {
      marginTop: 8,
      minHeight: 120,
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
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 4,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.card,
    },
    chipSelected: {
      borderColor: colors.text,
      backgroundColor: colors.text,
    },
    chipText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    chipTextSelected: {
      color: isDark ? colors.background : '#ffffff',
      fontWeight: '600',
    },
    activityRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
      backgroundColor: colors.inputBg,
    },
    activityRowSelected: {
      borderColor: colors.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#1118270d',
    },
    radioOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.textTertiary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
      marginRight: 10,
    },
    radioInner: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
      backgroundColor: colors.text,
    },
    activityTextContainer: {
      flex: 1,
    },
    activityLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    activityLabelSelected: {
      color: colors.text,
    },
    activityDescription: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    generatingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 32,
    },
    generatingText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.textSecondary,
    },
    planScroll: {
      flex: 1,
      marginTop: 8,
    },
    planContent: {
      paddingBottom: 16,
    },
    planText: {
      fontSize: 14,
      color: colors.text,
      lineHeight: 20,
    },
    footer: {
      paddingTop: 12,
    },
    footerButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    secondaryButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.card,
      flex: 1,
      marginRight: 8,
    },
    secondaryButtonDisabled: {
      opacity: 0.4,
    },
    secondaryButtonText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    secondaryButtonTextDisabled: {
      color: colors.textTertiary,
    },
    primaryButton: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: isDark ? '#ffffff' : '#111827',
      flex: 1,
      marginLeft: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonFull: {
      marginLeft: 0,
      alignSelf: 'stretch',
      minHeight: 52,
    },
    primaryButtonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? '#121212' : '#ffffff',
      textAlign: 'center',
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

    authToggle: {
      marginTop: 8,
      alignItems: 'center',
      paddingVertical: 8,
    },
    authToggleText: {
      fontSize: 14,
      color: '#4F46E5',
      fontWeight: '500',
    },
  });

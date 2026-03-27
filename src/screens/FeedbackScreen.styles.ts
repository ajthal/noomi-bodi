import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../contexts/ThemeContext';

export default function createStyles(colors: ThemeColors, _isDark: boolean) {
  return StyleSheet.create({
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
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },

    // ── Category Picker ──────────────────────────────────────────────
    section: {
      marginBottom: 20,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 8,
    },
    categoryRow: {
      flexDirection: 'row',
      gap: 10,
    },
    categoryPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1.5,
    },
    categoryPillText: {
      fontSize: 13,
      fontWeight: '600',
    },

    // ── Text Inputs ──────────────────────────────────────────────────
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
    },
    textArea: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      minHeight: 100,
      textAlignVertical: 'top',
    },

    // ── Screenshots ──────────────────────────────────────────────────
    screenshotRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    screenshotThumb: {
      width: 80,
      height: 80,
      borderRadius: 10,
    },
    screenshotWrapper: {
      position: 'relative',
    },
    removeBtn: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.error ?? '#d32f2f',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    addScreenshotBtn: {
      width: 80,
      height: 80,
      borderRadius: 10,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Device Context ───────────────────────────────────────────────
    contextCard: {
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
    },
    contextRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 3,
    },
    contextLabel: {
      fontSize: 12,
      fontWeight: '600',
    },
    contextValue: {
      fontSize: 12,
    },

    // ── Submit ───────────────────────────────────────────────────────
    submitBtn: {
      marginTop: 8,
    },
  });
}

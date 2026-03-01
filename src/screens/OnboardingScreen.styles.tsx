import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f9fafb',
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
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
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
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  stepCircleActive: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  stepCircleCompleted: {
    borderColor: '#10b981',
    backgroundColor: '#10b981',
  },
  stepCircleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  stepCircleTextActive: {
    color: '#ffffff',
  },
  stepLabel: {
    marginTop: 4,
    fontSize: 10,
    color: '#9ca3af',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: '#111827',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  card: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
  },

  // Step 1: Account placeholder
  accountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    marginBottom: 10,
    opacity: 0.55,
  },
  accountButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#6b7280',
  },
  comingSoonBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  accountHint: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 18,
    marginTop: 12,
    textAlign: 'center',
  },

  // Step 2: API key
  instructionBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 16,
  },
  instructionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
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
    backgroundColor: '#111827',
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
    overflow: 'hidden',
  },
  instructionText: {
    flex: 1,
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
  },
  link: {
    color: '#2563eb',
    textDecorationLine: 'underline',
  },
  apiKeyHint: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 17,
    marginTop: 10,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
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
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
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
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  chipSelected: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  chipText: {
    fontSize: 13,
    color: '#374151',
  },
  chipTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
    backgroundColor: '#f9fafb',
  },
  activityRowSelected: {
    borderColor: '#111827',
    backgroundColor: '#1118270d',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#9ca3af',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginRight: 10,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#111827',
  },
  activityTextContainer: {
    flex: 1,
  },
  activityLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  activityLabelSelected: {
    color: '#111827',
  },
  activityDescription: {
    fontSize: 12,
    color: '#6b7280',
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
    color: '#4b5563',
  },
  planScroll: {
    marginTop: 8,
  },
  planContent: {
    paddingBottom: 8,
  },
  planText: {
    fontSize: 14,
    color: '#111827',
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
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    flex: 1,
    marginRight: 8,
  },
  secondaryButtonDisabled: {
    opacity: 0.4,
  },
  secondaryButtonText: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
  },
  secondaryButtonTextDisabled: {
    color: '#9ca3af',
  },
  primaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#111827',
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
    color: '#ffffff',
    textAlign: 'center',
  },

  // Step 1: Auth toggle
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


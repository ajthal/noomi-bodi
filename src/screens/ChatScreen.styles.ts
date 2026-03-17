import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  chatContainer: {
    flex: 1,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    padding: 10,
    paddingBottom: 20,
    flexGrow: 1,
  },
  messageContainer: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    maxWidth: '85%',
  },
  userMessage: {
    backgroundColor: '#E3F2FD',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantMessage: {
    backgroundColor: '#f5f5f5',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  role: {
    fontWeight: '700',
    marginBottom: 4,
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  message: {
    fontSize: 15,
    color: '#1a1a1a',
    lineHeight: 21,
  },
  messageImage: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginBottom: 8,
  },
  thinkingText: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#aaa',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#bbb',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  quickActionsRow: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
    flexDirection: 'row',
  },
  quickActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Meal action buttons
  mealActions: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 8,
  },
  mealSummary: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
    marginBottom: 8,
  },
  mealActionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  logMealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    gap: 5,
  },
  logMealButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  editMealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    gap: 5,
  },
  editMealButtonText: {
    color: '#7C3AED',
    fontWeight: '600',
    fontSize: 13,
  },
  mealLoggedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  mealLoggedText: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '600',
  },
  saveMealRow: {
    marginTop: 8,
  },
  saveMealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FF9800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    gap: 5,
    alignSelf: 'flex-start',
  },
  saveMealButtonText: {
    color: '#FF9800',
    fontWeight: '600',
    fontSize: 13,
  },

  // Input area — Cursor/Claude-style boxed input
  inputSafeArea: {
    backgroundColor: '#fff',
  },
  apiKeyHint: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  apiKeyHintText: {
    fontSize: 13,
    color: '#d32f2f',
    fontWeight: '500',
  },
  // Input box styles are now in ChatInputBox component
});

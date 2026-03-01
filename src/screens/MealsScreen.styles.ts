import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
  },
  dateText: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  list: {
    padding: 12,
    paddingBottom: 24,
  },
  mealCard: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  mealCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mealThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  mealThumbPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealInfo: {
    flex: 1,
  },
  mealName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  mealTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  deleteBtn: {
    padding: 4,
  },
  macroRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 6,
  },
  pill: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 6,
    alignItems: 'center',
  },
  pillValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  pillLabel: {
    fontSize: 10,
    color: '#999',
    marginTop: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
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
});

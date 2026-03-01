import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  refreshBtn: {
    padding: 4,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // ── Loading / Error ───────────────────────────────────────────────
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // ── Section ───────────────────────────────────────────────────────
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },

  // ── Overview cards ────────────────────────────────────────────────
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  overviewCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: 12,
    padding: 14,
    minWidth: 150,
  },
  overviewLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  overviewValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  overviewSub: {
    fontSize: 11,
    marginTop: 2,
  },

  // ── Filters ───────────────────────────────────────────────────────
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterBtnActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#fff',
  },

  // ── Charts ────────────────────────────────────────────────────────
  chartContainer: {
    marginTop: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── User table ────────────────────────────────────────────────────
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cellEmail: {
    flex: 3,
    paddingRight: 4,
  },
  cellRole: {
    flex: 1.2,
    alignItems: 'center',
  },
  cellCalls: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cellCost: {
    flex: 1.2,
    alignItems: 'flex-end',
  },
  cellText: {
    fontSize: 12,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  // ── Activity log ──────────────────────────────────────────────────
  activityCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  activityTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityEmail: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  activityStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  activityMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  activityMetaItem: {
    fontSize: 11,
  },
  activityError: {
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },

  // ── Role picker ───────────────────────────────────────────────────
  rolePickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  rolePickerSheet: {
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 320,
  },
  rolePickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  roleOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 6,
  },
  roleOptionActive: {
    backgroundColor: '#4CAF5020',
  },
  roleOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  rolePickerCancel: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  rolePickerCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Horizontal bar card (shared by monthly + tool cost) ────────────
  costCard: {
    borderRadius: 12,
    padding: 16,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  costLabel: {
    fontSize: 12,
    fontWeight: '600',
    width: 90,
  },
  costBarArea: {
    flex: 1,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(128,128,128,0.1)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  costBarFill: {
    height: '100%',
    borderRadius: 9,
    opacity: 0.85,
  },
  costAmount: {
    fontSize: 13,
    fontWeight: '800',
    width: 72,
    textAlign: 'right',
  },
  costMeta: {
    marginLeft: 100,
    marginTop: 2,
    marginBottom: 2,
  },
  costMetaText: {
    fontSize: 10,
  },
  costDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },

  // ── Empty states ──────────────────────────────────────────────────
  emptyText: {
    textAlign: 'center',
    fontSize: 13,
    paddingVertical: 20,
  },
});

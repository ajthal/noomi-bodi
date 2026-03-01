import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  Insight,
  InsightType,
  generateInsights,
  dismissInsight,
} from '../services/insightGenerator';
import { useTheme } from '../contexts/ThemeContext';

// ── Styling helpers ──────────────────────────────────────────────────

const TYPE_CONFIG: Record<InsightType, { icon: string; color: string; bgLight: string; bgDark: string }> = {
  success:        { icon: 'checkmark-circle', color: '#4CAF50', bgLight: '#E8F5E9', bgDark: '#1b3a1b' },
  warning:        { icon: 'warning',          color: '#FF9800', bgLight: '#FFF3E0', bgDark: '#3a2e1b' },
  recommendation: { icon: 'bulb',             color: '#2196F3', bgLight: '#E3F2FD', bgDark: '#1b2d3a' },
  alert:          { icon: 'alert-circle',     color: '#F44336', bgLight: '#FFEBEE', bgDark: '#3a1b1b' },
};

// ── Component ────────────────────────────────────────────────────────

export default function InsightsPage(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const isFocused = useIsFocused();

  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const result = await generateInsights(force);
      setInsights(result.filter(i => !i.isDismissed));
    } catch (e) {
      console.error('Error loading insights:', e);
    }
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [isFocused, load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const handleDismiss = useCallback(async (id: string) => {
    setInsights(prev => prev.filter(i => i.id !== id));
    await dismissInsight(id);
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: colors.surfaceAlt }]}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={[s.loadingText, { color: colors.textSecondary }]}>Loading insights…</Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.surfaceAlt }]}>
      <ScrollView style={s.scrollArea} contentContainerStyle={s.content}>
        {/* Header */}
        <View style={s.headerRow}>
          <Text style={[s.title, { color: colors.text }]}>AI Insights</Text>
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={refreshing}
            style={[s.refreshBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#4CAF50" />
            ) : (
              <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
            )}
            <Text style={[s.refreshText, { color: colors.textSecondary }]}>
              {refreshing ? 'Generating…' : 'Refresh'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[s.subtitle, { color: colors.textSecondary }]}>
          Personalized analysis of your nutrition and weight data.
        </Text>

        {insights.length === 0 && !refreshing && (
          <View style={[s.emptyCard, { backgroundColor: colors.card }]}>
            <Ionicons name="sparkles-outline" size={36} color={colors.textTertiary} />
            <Text style={[s.emptyTitle, { color: colors.text }]}>No insights yet</Text>
            <Text style={[s.emptySubtitle, { color: colors.textSecondary }]}>
              Tap Refresh to generate AI insights based on your data, or keep logging meals to give the AI more to work with.
            </Text>
          </View>
        )}

        {insights.map(insight => {
          const cfg = TYPE_CONFIG[insight.type] ?? TYPE_CONFIG.recommendation;
          const isExpanded = expandedId === insight.id;

          return (
            <TouchableOpacity
              key={insight.id}
              activeOpacity={0.7}
              onPress={() => toggleExpand(insight.id)}
              style={[
                s.card,
                { backgroundColor: isDark ? cfg.bgDark : cfg.bgLight, borderColor: cfg.color + '44' },
              ]}
            >
              <View style={s.cardHeader}>
                <Ionicons name={cfg.icon} size={22} color={cfg.color} />
                <Text style={[s.cardTitle, { color: colors.text }]} numberOfLines={isExpanded ? undefined : 1}>
                  {insight.title}
                </Text>
                <TouchableOpacity
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    Alert.alert('Dismiss Insight', 'Hide this insight?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Dismiss', style: 'destructive', onPress: () => handleDismiss(insight.id) },
                    ])
                  }
                >
                  <Ionicons name="close-circle-outline" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>

              <Text
                style={[s.cardDesc, { color: colors.textSecondary }]}
                numberOfLines={isExpanded ? undefined : 2}
              >
                {insight.description}
              </Text>

              {!isExpanded && (
                <Text style={[s.expandHint, { color: cfg.color }]}>Tap for details</Text>
              )}

              {isExpanded && (
                <View style={s.cardFooter}>
                  <View style={[s.typeBadge, { backgroundColor: cfg.color + '22' }]}>
                    <Text style={[s.typeBadgeText, { color: cfg.color }]}>{insight.type}</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {refreshing && insights.length === 0 && (
          <View style={[s.generatingCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="small" color="#4CAF50" />
            <Text style={[s.generatingText, { color: colors.textSecondary }]}>
              Analyzing your data — this may take a few seconds…
            </Text>
          </View>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  scrollArea: { flex: 1 },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 14, marginBottom: 18 },

  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  refreshText: { fontSize: 13, fontWeight: '500' },

  // Insight cards
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', flex: 1 },
  cardDesc: { fontSize: 14, lineHeight: 20, marginLeft: 30 },
  expandHint: { fontSize: 12, marginLeft: 30, marginTop: 4, fontWeight: '500' },
  cardFooter: { flexDirection: 'row', marginTop: 8, marginLeft: 30 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  typeBadgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },

  // Empty state
  emptyCard: {
    borderRadius: 14,
    padding: 30,
    alignItems: 'center',
    marginTop: 10,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginTop: 10 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },

  // Generating state
  generatingCard: {
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  generatingText: { fontSize: 14, textAlign: 'center' },

  loadingText: { fontSize: 14, marginTop: 10 },
});

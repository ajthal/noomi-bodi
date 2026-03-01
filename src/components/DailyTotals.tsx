import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MacroGoals } from '../services/storage';
import { DailyMacroTotals } from '../services/mealLog';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  totals: DailyMacroTotals;
  goals: MacroGoals;
  compact?: boolean;
}

function ProgressBar({
  current,
  goal,
  color,
  barTrackBg,
}: {
  current: number;
  goal: number;
  color: string;
  barTrackBg?: string;
}) {
  const pct = goal > 0 ? Math.min(current / goal, 1.5) : 0;
  const displayPct = Math.min(pct, 1);
  const over = pct > 1;

  return (
    <View style={[s.barTrack, barTrackBg ? { backgroundColor: barTrackBg } : undefined]}>
      <View
        style={[
          s.barFill,
          {
            width: `${displayPct * 100}%`,
            backgroundColor: over ? '#ff6b6b' : color,
          },
        ]}
      />
    </View>
  );
}

function MacroRow({
  label,
  current,
  goal,
  unit,
  color,
  compact,
  labelColor,
  valueColor,
  barTrackBg,
}: {
  label: string;
  current: number;
  goal: number;
  unit: string;
  color: string;
  compact?: boolean;
  labelColor?: string;
  valueColor?: string;
  barTrackBg?: string;
}) {
  return (
    <View style={compact ? s.macroRowCompact : s.macroRow}>
      <View style={s.macroLabel}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={[compact ? s.labelTextCompact : s.labelText, labelColor ? { color: labelColor } : undefined]}>{label}</Text>
      </View>
      <ProgressBar current={current} goal={goal} color={color} barTrackBg={barTrackBg} />
      <Text style={[compact ? s.valueTextCompact : s.valueText, valueColor ? { color: valueColor } : undefined]}>
        {current}/{goal}
        {unit}
      </Text>
    </View>
  );
}

export default function DailyTotals({ totals, goals, compact }: Props) {
  const { colors } = useTheme();
  const calPct =
    goals.calories > 0
      ? Math.round((totals.calories / goals.calories) * 100)
      : 0;

  if (compact) {
    return (
      <View style={[s.compactContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={s.compactCalRow}>
          <Text style={[s.compactCalLabel, { color: colors.text }]}>
            {totals.calories}/{goals.calories} cal
          </Text>
          <Text style={s.compactCalPct}>{calPct}%</Text>
        </View>
        <ProgressBar
          current={totals.calories}
          goal={goals.calories}
          color="#4CAF50"
          barTrackBg={colors.border}
        />
        <View style={s.compactMacros}>
          <Text style={[s.compactMacro, { color: colors.textSecondary }]}>
            P {totals.protein}/{goals.protein}g
          </Text>
          <Text style={[s.compactMacro, { color: colors.textSecondary }]}>
            C {totals.carbs}/{goals.carbs}g
          </Text>
          <Text style={[s.compactMacro, { color: colors.textSecondary }]}>
            F {totals.fat}/{goals.fat}g
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <MacroRow
        label="Calories"
        current={totals.calories}
        goal={goals.calories}
        unit=" cal"
        color="#4CAF50"
        labelColor={colors.text}
        valueColor={colors.textSecondary}
        barTrackBg={colors.border}
      />
      <MacroRow
        label="Protein"
        current={totals.protein}
        goal={goals.protein}
        unit="g"
        color="#2196F3"
        labelColor={colors.text}
        valueColor={colors.textSecondary}
        barTrackBg={colors.border}
      />
      <MacroRow
        label="Carbs"
        current={totals.carbs}
        goal={goals.carbs}
        unit="g"
        color="#FF9800"
        labelColor={colors.text}
        valueColor={colors.textSecondary}
        barTrackBg={colors.border}
      />
      <MacroRow
        label="Fat"
        current={totals.fat}
        goal={goals.fat}
        unit="g"
        color="#9C27B0"
        labelColor={colors.text}
        valueColor={colors.textSecondary}
        barTrackBg={colors.border}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    padding: 12,
    gap: 8,
  },
  compactContainer: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fafafa',
  },
  compactCalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  compactCalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  compactCalPct: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4CAF50',
  },
  compactMacros: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  compactMacro: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },

  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  macroRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  macroLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 80,
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  labelText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  labelTextCompact: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  valueText: {
    fontSize: 12,
    color: '#666',
    width: 90,
    textAlign: 'right',
  },
  valueTextCompact: {
    fontSize: 10,
    color: '#666',
    width: 70,
    textAlign: 'right',
  },
});

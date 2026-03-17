import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';

interface CustomBarChartProps {
  labels: string[];
  data: number[];
  width: number;
  height: number;
  barColor?: string;
  labelColor?: string;
  gridColor?: string;
  goalValue?: number;
  goalColor?: string;
  goalLabel?: string;
  barPercentage?: number;
  yAxisWidth?: number;
  formatYLabel?: (value: number) => string;
  formatTooltip?: (value: number) => string;
}

const TICK_COUNT = 5;
const TOP_PAD = 30;
const X_LABEL_HEIGHT = 28;

function computeNiceScale(rawMax: number, tickCount: number) {
  if (rawMax <= 0) return { niceMax: tickCount, step: 1 };
  const rawStep = rawMax / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let niceStep: number;
  if (residual <= 1) niceStep = magnitude;
  else if (residual <= 2) niceStep = 2 * magnitude;
  else if (residual <= 5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;
  return { niceMax: niceStep * tickCount, step: niceStep };
}

const defaultFormatLabel = (v: number) => {
  if (v >= 10_000) return `${Math.round(v / 1000)}k`;
  return String(Math.round(v));
};

const MIN_SLOTS = 7;
const MAX_BAR_WIDTH = 32;
const LABEL_MIN_WIDTH = 42;

export default function CustomBarChart({
  labels,
  data,
  width,
  height,
  barColor = '#7C3AED',
  labelColor = '#888',
  gridColor = '#333',
  goalValue,
  goalColor = '#FF9800',
  goalLabel,
  barPercentage = 0.6,
  yAxisWidth = 48,
  formatYLabel = defaultFormatLabel,
  formatTooltip = (v) => Math.round(v).toLocaleString(),
}: CustomBarChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const plotHeight = height - X_LABEL_HEIGHT - TOP_PAD;
  const plotWidth = width - yAxisWidth;
  const visibleSlots = Math.max(data.length, MIN_SLOTS);
  const slotWidth = visibleSlots > 0 ? plotWidth / visibleSlots : 0;
  const barW = Math.min(MAX_BAR_WIDTH, Math.max(6, slotWidth * barPercentage));

  const maxVisibleLabels = Math.max(2, Math.floor(plotWidth / LABEL_MIN_WIDTH));
  const labelSkip = Math.max(1, Math.ceil(data.length / maxVisibleLabels));
  const shouldShowLabel = (i: number) => {
    if (data.length <= maxVisibleLabels) return true;
    if (i === data.length - 1) return true;
    if (i % labelSkip === 0) {
      const nextShown = i + labelSkip;
      if (nextShown > data.length - 1 && data.length - 1 - i < labelSkip * 0.6) return false;
      return true;
    }
    return false;
  };

  const { niceMax, step } = useMemo(() => {
    const rawMax = Math.max(...data, goalValue ?? 0, 1);
    return computeNiceScale(rawMax, TICK_COUNT);
  }, [data, goalValue]);

  const ticks = useMemo(
    () => Array.from({ length: TICK_COUNT + 1 }, (_, i) => i * step),
    [step],
  );

  const yForValue = useCallback(
    (v: number) => TOP_PAD + plotHeight * (1 - v / niceMax),
    [plotHeight, niceMax],
  );

  const handleBarPress = useCallback((index: number) => {
    setSelectedIndex(prev => (prev === index ? null : index));
  }, []);

  if (data.length === 0) return null;

  return (
    <View style={{ width, height, overflow: 'visible' }}>
      {/* Grid lines + Y-axis labels */}
      {ticks.map((val, i) => {
        const y = yForValue(val);
        return (
          <React.Fragment key={`tick-${i}`}>
            <View
              style={[
                styles.gridLine,
                { left: yAxisWidth, top: y, backgroundColor: gridColor },
              ]}
            />
            <View style={[styles.yLabelWrap, { top: y - 8, width: yAxisWidth - 6 }]}>
              <Text style={[styles.yLabel, { color: labelColor }]}>
                {formatYLabel(val)}
              </Text>
            </View>
          </React.Fragment>
        );
      })}

      {/* Bars */}
      {data.map((val, i) => {
        const barH = niceMax > 0 ? (val / niceMax) * plotHeight : 0;
        const isSelected = selectedIndex === i;

        return (
          <Pressable
            key={`bar-${i}`}
            onPress={() => handleBarPress(i)}
            style={[
              styles.barSlot,
              { left: yAxisWidth + i * slotWidth, top: TOP_PAD, width: slotWidth, height: plotHeight },
            ]}
          >
            <View
              style={[
                styles.bar,
                {
                  left: (slotWidth - barW) / 2,
                  width: barW,
                  height: Math.max(barH, 2),
                  backgroundColor: barColor,
                  borderTopLeftRadius: barW / 2,
                  borderTopRightRadius: barW / 2,
                  opacity: selectedIndex === null ? 0.85 : isSelected ? 1 : 0.35,
                },
              ]}
            />
          </Pressable>
        );
      })}

      {/* Tooltip (rendered at chart root so it's never clipped by narrow slots) */}
      {selectedIndex !== null && selectedIndex < data.length && (() => {
        const val = data[selectedIndex];
        const barH = niceMax > 0 ? (val / niceMax) * plotHeight : 0;
        const centerX = yAxisWidth + selectedIndex * slotWidth + slotWidth / 2;
        const tooltipTop = Math.max(TOP_PAD + plotHeight - barH - 28, 2);
        const TOOLTIP_WRAP_W = 120;
        return (
          <View
            style={[
              styles.tooltipWrap,
              { top: tooltipTop, left: centerX - TOOLTIP_WRAP_W / 2, width: TOOLTIP_WRAP_W },
            ]}
            pointerEvents="none"
          >
            <View style={[styles.tooltipPill, { backgroundColor: barColor }]}>
              <Text style={styles.tooltipText}>{formatTooltip(val)}</Text>
            </View>
          </View>
        );
      })()}

      {/* Goal line */}
      {goalValue != null && goalValue > 0 && (
        <>
          <View
            style={[styles.goalSvgWrap, { left: yAxisWidth, top: yForValue(goalValue) - 1, width: plotWidth }]}
            pointerEvents="none"
          >
            <Svg width={plotWidth} height={2}>
              <Line
                x1={0}
                y1={1}
                x2={plotWidth}
                y2={1}
                stroke={goalColor}
                strokeWidth={1.5}
                strokeDasharray="6,4"
              />
            </Svg>
          </View>
          {goalLabel && (
            <Text
              style={[styles.goalLabelText, { top: yForValue(goalValue) - 16, color: goalColor }]}
              pointerEvents="none"
            >
              {goalLabel}
            </Text>
          )}
        </>
      )}

      {/* X-axis labels */}
      {labels.map((label, i) =>
        shouldShowLabel(i) ? (
          <Text
            key={`xl-${i}`}
            style={[
              styles.xLabel,
              {
                left: yAxisWidth + i * slotWidth,
                width: Math.max(slotWidth, LABEL_MIN_WIDTH),
                marginLeft: slotWidth < LABEL_MIN_WIDTH ? -(LABEL_MIN_WIDTH - slotWidth) / 2 : 0,
                color: labelColor,
              },
            ]}
          >
            {label}
          </Text>
        ) : null,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gridLine: {
    position: 'absolute',
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  yLabelWrap: {
    position: 'absolute',
    left: 0,
  },
  yLabel: {
    fontSize: 11,
    textAlign: 'right',
  },
  barSlot: {
    position: 'absolute',
  },
  tooltipWrap: {
    position: 'absolute',
    zIndex: 20,
    alignItems: 'center',
  },
  tooltipPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tooltipText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  bar: {
    position: 'absolute',
    bottom: 0,
  },
  goalSvgWrap: {
    position: 'absolute',
    height: 2,
  },
  goalLabelText: {
    position: 'absolute',
    right: 4,
    fontSize: 10,
    fontWeight: '600',
  },
  xLabel: {
    position: 'absolute',
    bottom: 0,
    textAlign: 'center',
    fontSize: 10,
    height: X_LABEL_HEIGHT,
    lineHeight: X_LABEL_HEIGHT,
  },
});

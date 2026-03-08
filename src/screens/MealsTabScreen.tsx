import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  Keyboard,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import MealsScreen from './MealsScreen';
import SharedMealsPage from './SharedMealsPage';

const PAGE_COUNT = 2;

export default function MealsTabScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [currentPage, setCurrentPage] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleUnreadCountChange = useCallback((count: number) => {
    setUnreadCount(count);
  }, []);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <SafeAreaView
        edges={['top']}
        style={[s.topBar, { backgroundColor: colors.background, borderBottomColor: colors.borderLight }]}
      >
        <View style={s.dotsRow}>
          {Array.from({ length: PAGE_COUNT }, (_, i) => (
            <View key={i} style={s.dotContainer}>
              <View
                style={[
                  s.dot,
                  currentPage === i && s.dotActive,
                  { backgroundColor: currentPage === i ? colors.text : colors.textTertiary },
                ]}
              />
              {i === 1 && unreadCount > 0 && (
                <View style={s.badge}>
                  <View style={s.badgeDot} />
                </View>
              )}
            </View>
          ))}
        </View>
      </SafeAreaView>

      <View
        style={s.pagerContainer}
        onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
      >
        {pageHeight > 0 && (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            onMomentumScrollEnd={(e) => {
              const page = Math.round(e.nativeEvent.contentOffset.x / width);
              setCurrentPage(page);
              Keyboard.dismiss();
            }}
          >
            <View style={{ width, height: pageHeight }}>
              <MealsScreen />
            </View>
            <View style={{ width, height: pageHeight }}>
              <SharedMealsPage onUnreadCountChange={handleUnreadCountChange} />
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  dotContainer: {
    position: 'relative',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {},
  badge: {
    position: 'absolute',
    top: -3,
    right: -5,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2196F3',
  },
  pagerContainer: {
    flex: 1,
  },
});

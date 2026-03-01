import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  Keyboard,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import QuickLogPage from './QuickLogPage';
import ChatScreen from './ChatScreen';

const PAGE_COUNT = 2;

export default function ChatTabScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [currentPage, setCurrentPage] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const onMealLogged = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <SafeAreaView
        edges={['top']}
        style={[s.topBar, { backgroundColor: colors.background, borderBottomColor: colors.borderLight }]}
      >
        <View style={s.dotsRow}>
          {Array.from({ length: PAGE_COUNT }, (_, i) => (
            <View
              key={i}
              style={[
                s.dot,
                currentPage === i && s.dotActive,
                { backgroundColor: currentPage === i ? colors.text : colors.textTertiary },
              ]}
            />
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
              <QuickLogPage
                refreshTrigger={refreshTrigger}
                onMealLogged={onMealLogged}
              />
            </View>
            <View style={{ width, height: pageHeight }}>
              <ChatScreen
                refreshTrigger={refreshTrigger}
                onMealLogged={onMealLogged}
              />
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
    backgroundColor: '#fff',
  },
  topBar: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d0d0d0',
  },
  dotActive: {
    backgroundColor: '#333',
  },
  pagerContainer: {
    flex: 1,
  },
});

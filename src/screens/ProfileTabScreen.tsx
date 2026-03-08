import React, { useState, useRef } from 'react';
import {
  View,
  ScrollView,
  Keyboard,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import ProfilePage from './ProfilePage';
import SettingsPage from './SettingsPage';

const PAGE_COUNT = 2;

export default function ProfileTabScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [currentPage, setCurrentPage] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

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
              <ProfilePage />
            </View>
            <View style={{ width, height: pageHeight }}>
              <SettingsPage />
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
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {},
  pagerContainer: {
    flex: 1,
  },
});

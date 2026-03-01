import React, { useRef, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  TouchableWithoutFeedback,
  Animated,
  PanResponder,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

const DISMISS_THRESHOLD = 100;

interface Props {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function BottomSheet({ visible, onClose, children }: Props) {
  const { colors } = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) {
      translateY.setValue(screenHeight);
      backdropOpacity.setValue(0);
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 9,
            tension: 65,
          }),
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }
  }, [visible, screenHeight, translateY, backdropOpacity]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: screenHeight,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onCloseRef.current();
    });
  }, [screenHeight, translateY, backdropOpacity]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 8,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          translateY.setValue(gs.dy);
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > DISMISS_THRESHOLD || gs.vy > 0.8) {
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: 1000,
              duration: 250,
              useNativeDriver: true,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 0,
              duration: 250,
              useNativeDriver: true,
            }),
          ]).start(() => {
            onCloseRef.current();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <Modal visible={visible} animationType="none" transparent statusBarTranslucent>
      <View style={s.root}>
        <Animated.View style={[s.backdrop, { opacity: backdropOpacity }]}>
          <TouchableWithoutFeedback onPress={dismiss}>
            <View style={s.backdropFill} />
          </TouchableWithoutFeedback>
        </Animated.View>

        <Animated.View
          style={[
            s.sheet,
            {
              backgroundColor: colors.card,
              maxHeight: screenHeight * 0.88,
              transform: [{ translateY }],
            },
          ]}
        >
          <View {...panResponder.panHandlers} style={s.handleZone}>
            <View style={[s.handle, { backgroundColor: colors.textTertiary }]} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 20,
  },
  handleZone: {
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
});

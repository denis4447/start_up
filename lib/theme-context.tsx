import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from 'react-native-reanimated';

const THEME_KEY = 'noteai_dark_mode';

const CIRCLE_SIZE = 20;

type ThemeContextType = {
  isDark: boolean;
  toggleDarkMode: (x?: number, y?: number) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  toggleDarkMode: () => {},
});

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rippleColor, setRippleColor] = useState('#F5F0E8');
  const [showCircle, setShowCircle] = useState(false);

  const circleScale = useSharedValue(0);
  const circleX = useSharedValue(0);
  const circleY = useSharedValue(0);
  const animating = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((val) => {
      if (val === 'true') setIsDark(true);
      setLoaded(true);
    });
  }, []);

  const toggleDarkMode = useCallback((x?: number, y?: number) => {
    if (animating.current) return;
    animating.current = true;

    const next = !isDark;
    AsyncStorage.setItem(THEME_KEY, String(next));

    const { width, height } = Dimensions.get('window');
    const cx = x ?? width - 60;
    const cy = y ?? 200;

    circleX.value = cx;
    circleY.value = cy;

    const maxDist = Math.sqrt(
      Math.max(cx, width - cx) ** 2 + Math.max(cy, height - cy) ** 2
    );
    const maxScale = (maxDist / (CIRCLE_SIZE / 2)) * 1.15;

    setRippleColor(isDark ? '#1A1612' : '#F5F0E8');
    circleScale.value = maxScale;
    setShowCircle(true);

    requestAnimationFrame(() => {
      setIsDark(next);

      setTimeout(() => {
        circleScale.value = withTiming(0, {
          duration: 600,
          easing: Easing.inOut(Easing.cubic),
        });

        setTimeout(() => {
          setShowCircle(false);
          animating.current = false;
        }, 620);
      }, 30);
    });
  }, [isDark, circleScale, circleX, circleY]);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: circleX.value - CIRCLE_SIZE / 2 },
      { translateY: circleY.value - CIRCLE_SIZE / 2 },
      { scale: circleScale.value },
    ],
  }));

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ isDark, toggleDarkMode }}>
      <View style={tStyles.root}>
        {children}
        {showCircle && (
          <Animated.View
            style={[
              tStyles.circle,
              { backgroundColor: rippleColor, pointerEvents: 'none' as const },
              circleStyle,
            ]}
          />
        )}
      </View>
    </ThemeContext.Provider>
  );
}

const tStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  circle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    zIndex: 9999,
  },
});

export function useAppTheme() {
  return useContext(ThemeContext);
}

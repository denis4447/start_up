import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import 'react-native-reanimated';

import { useAppColors } from '@/hooks/use-app-colors';
import { AITaskProvider } from '@/lib/ai-task-context';
import { AppThemeProvider, useAppTheme } from '@/lib/theme-context';
import { registerServiceWorker } from '@/lib/web-push';
import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootContent() {
  const { isDark } = useAppTheme();
  const colors = useAppColors();

  useEffect(() => {
    if (Platform.OS === 'web') {
      registerServiceWorker();
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      SystemUI.setBackgroundColorAsync(colors.screenBackground);
    }
  }, [colors.screenBackground]);

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: colors.screenBackground,
      card: colors.cardBackground,
      text: colors.textPrimary,
      border: colors.border,
      primary: colors.accent,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.screenBackground },
          animation: Platform.OS === 'android' ? 'fade' : 'fade_from_bottom',
          animationDuration: 250,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="notes" options={{ headerShown: false, animation: Platform.OS === 'android' ? 'none' : 'slide_from_right', animationDuration: 250 }} />
        <Stack.Screen name="shopping-list" options={{ headerShown: false, animation: Platform.OS === 'android' ? 'none' : 'slide_from_right', animationDuration: 250 }} />
        <Stack.Screen name="profile" options={{ headerShown: false, animation: Platform.OS === 'android' ? 'fade' : 'slide_from_bottom', animationDuration: 250 }} />
        <Stack.Screen name="activation" options={{ headerShown: false, animation: 'fade', animationDuration: 250 }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

function PrivacyScreen() {
  const colors = useAppColors();
  const [isBackground, setIsBackground] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (next) => {
      const goingToBackground = appStateRef.current === 'active' && next.match(/inactive|background/);
      const comingToForeground = appStateRef.current.match(/inactive|background/) && next === 'active';
      if (goingToBackground) setIsBackground(true);
      if (comingToForeground) setIsBackground(false);
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  if (!isBackground) return null;

  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.screenBackground, zIndex: 9999, elevation: 9999 }]}
    />
  );
}

function RootInner() {
  const colors = useAppColors();
  return (
    <GestureHandlerRootView style={[StyleSheet.absoluteFill, { backgroundColor: colors.screenBackground }]}>
      <RootContent />
      <PrivacyScreen />
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AITaskProvider>
        <RootInner />
      </AITaskProvider>
    </AppThemeProvider>
  );
}

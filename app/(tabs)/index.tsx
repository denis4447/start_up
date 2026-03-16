import AppIcon from '@/components/ui/app-icon';
import CalendarWidget, { type CalendarWidgetRef } from '@/components/widgets/calendar-widget';
import ChatbotWidget from '@/components/widgets/chatbot-widget';
import RecentNotesWidget, { type RecentNotesWidgetRef } from '@/components/widgets/recent-notes-widget';
import SmartWidget, { type SmartWidgetRef } from '@/components/widgets/smart-widget';
import WeatherWidget, { type WeatherWidgetRef } from '@/components/widgets/weather-widget';
import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { shadow } from '@/lib/shadows';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useRouter, type Href } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const c = useAppColors();
  const [searchText, setSearchText] = useState('');
  const [fabOpen, setFabOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fabRotation = useSharedValue(0);

  const weatherRef = useRef<WeatherWidgetRef>(null);
  const smartRef = useRef<SmartWidgetRef>(null);
  const calendarRef = useRef<CalendarWidgetRef>(null);
  const notesRef = useRef<RecentNotesWidgetRef>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await Promise.all([
      weatherRef.current?.refresh(),
      smartRef.current?.refresh(),
      calendarRef.current?.refresh(),
      notesRef.current?.refresh(),
    ]);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFabOpen(false);
      fabRotation.value = 0;
    }, [])
  );

  const toggleFab = () => {
    setFabOpen((prev) => !prev);
    fabRotation.value = withSpring(fabOpen ? 0 : 1, { damping: 14, stiffness: 120 });
  };

  const fabAnimatedStyle = useAnimatedStyle(() => {
    const rotate = interpolate(fabRotation.value, [0, 1], [0, 135]);
    const scale = interpolate(fabRotation.value, [0, 0.5, 1], [1, 0.85, 1]);
    return {
      transform: [{ rotate: `${rotate}deg` }, { scale }],
    };
  });

  const handleSearch = () => {
    if (searchText.trim()) {
      router.push(`/notes?q=${encodeURIComponent(searchText.trim())}` as Href);
    } else {
      router.push('/notes' as Href);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.screenBackground }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.accent}
            colors={[c.accent]}
            progressBackgroundColor={c.cardBackground}
          />
        }
      >
        <View style={styles.searchRow}>
          <View style={[styles.searchContainer, { backgroundColor: c.cardBackground }]}>
            <AppIcon name="search" size={16} color={c.textMuted} style={{ marginRight: 10 }} />
            <TextInput
              style={[styles.searchInput, { color: c.textPrimary }]}
              placeholder="Поиск заметок..."
              placeholderTextColor={c.placeholder}
              value={searchText}
              onChangeText={setSearchText}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity style={[styles.avatar, { backgroundColor: c.cardBackground }]} onPress={() => router.push('/profile' as Href)}>
            {/* @pixel-size: 48×48 (×2 от оригинала 24) @pixel-offset: контейнер 52×52 */}
            <AppIcon name="user" size={44} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <WeatherWidget ref={weatherRef} />

        <View style={styles.widgetRow}>
          <ChatbotWidget />
          <SmartWidget ref={smartRef} />
        </View>

        <CalendarWidget ref={calendarRef} />

        <RecentNotesWidget ref={notesRef} />
      </ScrollView>

      {fabOpen && (
        <Pressable style={styles.fabOverlay} onPress={toggleFab} />
      )}

      {fabOpen && (
        <>
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={[styles.fabSub, styles.fabSub3, { backgroundColor: c.cardBackground }]}
          >
            <TouchableOpacity
              style={styles.fabSubBtn}
              onPress={() => { setFabOpen(false); router.push('/notes/voice' as Href); }}
              activeOpacity={0.7}
            >
              <AppIcon name="mic" size={20} color={c.accent} />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View
            entering={FadeIn.duration(200).delay(50)}
            exiting={FadeOut.duration(150)}
            style={[styles.fabSub, styles.fabSub2, { backgroundColor: c.cardBackground }]}
          >
            <TouchableOpacity
              style={styles.fabSubBtn}
              onPress={() => { setFabOpen(false); router.push('/notes/new?ai=1' as Href); }}
              activeOpacity={0.7}
            >
              {/* @pixel-size: 20×20 — иконка AI-заметки (блокнот+карандаш) */}
              <AppIcon name="ai-pencil" size={20} color={c.accent} />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View
            entering={FadeIn.duration(200).delay(100)}
            exiting={FadeOut.duration(150)}
            style={[styles.fabSub, styles.fabSub1, { backgroundColor: c.cardBackground }]}
          >
            <TouchableOpacity
              style={styles.fabSubBtn}
              onPress={() => { setFabOpen(false); router.push('/notes/new' as Href); }}
              activeOpacity={0.7}
            >
              <AppIcon name="pencil" size={20} color={c.accent} />
            </TouchableOpacity>
          </Animated.View>
        </>
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: c.accent }]}
        onPress={toggleFab}
        activeOpacity={0.8}
      >
        <Animated.View style={[styles.fabCross, fabAnimatedStyle]}>
          <View style={styles.fabBar} />
          <View style={[styles.fabBar, styles.fabBarV]} />
        </Animated.View>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AppColors.screenBackground,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.cardBackground,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...shadow({ offsetY: 1, opacity: 0.05, radius: 4, elevation: 2 }),
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: AppColors.textPrimary,
  },
  avatar: {
    // @pixel-size: контейнер на 4px больше иконки чтобы не обрезало
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',  // clips SVG stroke inside the circle
    backgroundColor: AppColors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow({ offsetY: 1, opacity: 0.05, radius: 4, elevation: 2 }),
  },
  avatarIcon: {
    fontSize: 24,
  },
  widgetRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginBottom: 16,
  },
  fabOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 100,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: AppColors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow({ offsetY: 4, opacity: 0.2, radius: 8, elevation: 12 }),
    zIndex: 12,
  },
  fabCross: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabBar: {
    position: 'absolute',
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: AppColors.textWhite,
  },
  fabBarV: {
    transform: [{ rotate: '90deg' }],
  },
  fabSub: {
    position: 'absolute',
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow({ offsetY: 3, opacity: 0.15, radius: 6, elevation: 11 }),
    zIndex: 11,
  },
  fabSub1: {
    bottom: 172,
  },
  fabSub2: {
    bottom: 234,
  },
  fabSub3: {
    bottom: 296,
  },
  fabSubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
    height: '100%',
  },
  fabSubIcon: {
    fontSize: 20,
  },
  fabSubLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});

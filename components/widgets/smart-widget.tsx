import AnimatedPressable from '@/components/animated-pressable';
import AppIcon from '@/components/ui/app-icon';
import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { shadow } from '@/lib/shadows';
import { getEvents, getShoppingList, saveShoppingList, type CalendarEvent, type ShoppingItem } from '@/lib/storage';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, type Href } from 'expo-router';
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type WidgetMode = 'events' | 'shopping';

const FADE_OUT = 180;
const FADE_IN = 200;
const EASE = Platform.OS === 'android'
  ? Easing.bezier(0.4, 0, 0.2, 1) // Android FastOutSlowIn
  : Easing.out(Easing.cubic);

function formatEventDate(dateStr: string): string {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  if (dateStr === todayStr) return 'Сегодня';
  if (dateStr === tomorrowStr) return 'Завтра';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const event = new Date(dateStr + 'T00:00:00');
  return Math.ceil((event.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export type SmartWidgetRef = { refresh: () => Promise<void> };

const SmartWidget = forwardRef<SmartWidgetRef>(function SmartWidget(_props, ref) {
  const router = useRouter();
  const c = useAppColors();
  const [mode, setMode] = useState<WidgetMode>('events');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const isAnimating = useRef(false);

  // Cross-fade shared values: active layer is fully visible, inactive is hidden
  const eventsOpacity = useSharedValue(1);
  const shoppingOpacity = useSharedValue(0);
  const eventsSlideY = useSharedValue(0);
  const shoppingSlideY = useSharedValue(8);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    const allEvents = await getEvents();
    const todayStr = new Date().toISOString().split('T')[0];
    const upcoming = allEvents
      .filter((e) => e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 2);
    setEvents(upcoming);
    const items = await getShoppingList();
    setShoppingItems(items.slice(0, 2));
  };

  useImperativeHandle(ref, () => ({ refresh: loadData }), []);

  const startFadeIn = useCallback((toShopping: boolean) => {
    if (__DEV__ && Platform.OS === 'android') console.log('[SmartWidget] fadeIn start →', toShopping ? 'shopping' : 'events');
    const nextMode = toShopping ? 'shopping' : 'events';
    setMode(nextMode);

    const inOpacity = toShopping ? shoppingOpacity : eventsOpacity;
    const inSlide = toShopping ? shoppingSlideY : eventsSlideY;
    inSlide.value = 8;
    inOpacity.value = 0;

    // Fade in on UI thread
    inOpacity.value = withTiming(1, { duration: FADE_IN, easing: EASE });
    inSlide.value = withTiming(0, { duration: FADE_IN, easing: EASE }, () => {
      runOnJS(markAnimDone)();
    });
  }, []);

  const markAnimDone = useCallback(() => {
    if (__DEV__ && Platform.OS === 'android') console.log('[SmartWidget] animation complete');
    isAnimating.current = false;
  }, []);

  const handleToggle = () => {
    if (isAnimating.current) return;
    isAnimating.current = true;

    if (__DEV__ && Platform.OS === 'android') console.log('[SmartWidget] fadeOut start, mode:', mode);

    const toShopping = mode === 'events';

    // Phase 1: Fade out current content entirely on UI thread
    const outOpacity = toShopping ? eventsOpacity : shoppingOpacity;
    const outSlide = toShopping ? eventsSlideY : shoppingSlideY;
    outSlide.value = withTiming(-8, { duration: FADE_OUT, easing: EASE });
    outOpacity.value = withTiming(0, { duration: FADE_OUT, easing: EASE }, () => {
      // Phase 2: When fade-out finishes, switch mode and fade in (via JS for setState)
      runOnJS(startFadeIn)(toShopping);
    });
  };

  const toggleShoppingItem = async (id: string) => {
    const allItems = await getShoppingList();
    const updated = allItems.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    await saveShoppingList(updated);
    setShoppingItems(updated.slice(0, 2));
  };

  const eventsAnimStyle = useAnimatedStyle(() => ({
    opacity: eventsOpacity.value,
    transform: [{ translateY: eventsSlideY.value }],
  }));

  const shoppingAnimStyle = useAnimatedStyle(() => ({
    opacity: shoppingOpacity.value,
    transform: [{ translateY: shoppingSlideY.value }],
  }));

  const toggleScale = useSharedValue(1);
  const togglePressed = useSharedValue(0);

  const toggleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: toggleScale.value }],
    opacity: 0.85 + 0.15 * (1 - togglePressed.value),
  }));

  const onTogglePressIn = () => {
    toggleScale.value = withTiming(0.93, { duration: 120, easing: EASE });
    togglePressed.value = withTiming(1, { duration: 100 });
  };

  const onTogglePressOut = () => {
    toggleScale.value = withTiming(1, { duration: 200, easing: EASE });
    togglePressed.value = withTiming(0, { duration: 200 });
  };

  const renderEvents = () => (
    <>
      <AnimatedPressable onPress={() => router.push('/(tabs)/calendar' as Href)} scaleValue={0.97}>
        <View style={styles.header}>
          {/* @pixel-size: 17×17 — иконка календаря */}
          <AppIcon name="calendar" size={17} color={c.accent} />
          <Text style={[styles.title, { color: c.textPrimary }]}>События</Text>
        </View>
      </AnimatedPressable>
      <View style={styles.list}>
        {events.length === 0 ? (
          <Text style={[styles.emptyText, { color: c.textMuted }]}>Нет предстоящих событий</Text>
        ) : (
          events.map((event) => {
            const daysUntil = getDaysUntil(event.date);
            const isToday = daysUntil === 0;
            return (
              <View key={event.id} style={styles.eventRow}>
                <View style={[styles.eventDot, { backgroundColor: event.color || c.accent }]} />
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventTitle, { color: c.textPrimary }]} numberOfLines={1}>{event.title}</Text>
                  <Text style={[styles.eventMeta, { color: c.textMuted }]}>
                    {formatEventDate(event.date)}{event.time ? ` · ${event.time}` : ''}
                  </Text>
                </View>
                {isToday ? (
                  <View style={[styles.todayBadge, { backgroundColor: c.accent }]}>
                    <Text style={styles.todayBadgeText}>Сегодня</Text>
                  </View>
                ) : daysUntil <= 3 && daysUntil > 0 ? (
                  <Text style={[styles.daysLeft, { color: c.accent }]}>{daysUntil}д</Text>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </>
  );

  const renderShopping = () => (
    <>
      <AnimatedPressable onPress={() => router.push('/shopping-list' as Href)} scaleValue={0.97}>
        <View style={styles.header}>
          {/* @pixel-size: 17×17 — иконка корзины */}
          <AppIcon name="cart" size={22} color={c.accent} />
          <Text style={[styles.title, { color: c.textPrimary }]}>Список покупок</Text>
        </View>
      </AnimatedPressable>
      <View style={styles.list}>
        {shoppingItems.length === 0 ? (
          <Text style={[styles.emptyText, { color: c.textMuted }]}>Список пуст</Text>
        ) : (
          shoppingItems.map((item) => (
            <TouchableOpacity key={item.id} style={styles.shoppingRow} onPress={() => toggleShoppingItem(item.id)}>
              <View style={[styles.checkbox, item.checked && { backgroundColor: c.accent, borderColor: c.accent }]}>
                {/* @pixel-size: 11×11 — галочка чекбокса */}
                {item.checked && <AppIcon name="check" size={11} color="#fff" />}
              </View>
              <Text style={[styles.shoppingText, { color: c.textPrimary }, item.checked && { textDecorationLine: 'line-through', color: c.textMuted }]}>
                {item.text}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </>
  );

  return (
    <Animated.View
      entering={FadeInDown.duration(600).delay(400)}
      style={[styles.container, { backgroundColor: c.cardBackground }]}
    >
      {/* Fixed-size content viewport — both layers always rendered */}
      <View style={styles.contentWrap}>
        <Animated.View
          style={[styles.contentLayer, eventsAnimStyle, { pointerEvents: mode === 'events' ? 'auto' : 'none' }]}
          renderToHardwareTextureAndroid
        >
          {renderEvents()}
        </Animated.View>
        <Animated.View
          style={[styles.contentLayer, shoppingAnimStyle, { pointerEvents: mode === 'shopping' ? 'auto' : 'none' }]}
          renderToHardwareTextureAndroid
        >
          {renderShopping()}
        </Animated.View>
      </View>

      {/* Toggle bar — always pinned at bottom via space-between */}
      <View style={[styles.toggleBarContainer, { borderTopColor: c.border }]}>
        <Pressable onPress={handleToggle} onPressIn={onTogglePressIn} onPressOut={onTogglePressOut}>
          <Animated.View style={[styles.togglePill, { backgroundColor: c.accent + '30' }, toggleAnimStyle]}>
            {/* @pixel-size: 14×14 — иконка переключения */}
            <AppIcon name={mode === 'events' ? 'cart' : 'calendar'} size={14} color={c.accent} />
            <Text style={[styles.toggleText, { color: c.accent }]}>
              {mode === 'events' ? 'Покупки' : 'События'}
            </Text>
            {/* @pixel-size: 12×12 — стрелка переключения */}
            <AppIcon name="arrow" size={12} color={c.accent} />
          </Animated.View>
        </Pressable>
      </View>
    </Animated.View>
  );
});

export default SmartWidget;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 158,
    backgroundColor: AppColors.cardBackground,
    borderRadius: 20,
    padding: 12,
    paddingBottom: 0,
    justifyContent: 'space-between',
    ...shadow({ offsetY: 2, opacity: 0.06, radius: 8, elevation: 3 }),
    overflow: 'hidden',
  },
  contentWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  contentLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  toggleBarContainer: {
    marginTop: 0,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
    alignItems: 'center',
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 8,
  },
  toggleIcon: {
    fontSize: 14,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  toggleChevron: {
    fontSize: 17,
    fontWeight: '600',
    marginLeft: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  icon: {
    fontSize: 17,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  list: {
    gap: 14,
  },
  emptyText: {
    fontSize: 12,
    color: AppColors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.textPrimary,
  },
  eventMeta: {
    fontSize: 10,
    color: AppColors.textMuted,
    marginTop: 2,
  },
  todayBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  todayBadgeText: {
    fontSize: 9,
    color: AppColors.textWhite,
    fontWeight: '700',
  },
  daysLeft: {
    fontSize: 11,
    fontWeight: '700',
  },
  shoppingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: AppColors.border,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  checkmark: {
    color: AppColors.textWhite,
    fontSize: 11,
    fontWeight: 'bold',
  },
  shoppingText: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.textPrimary,
    flex: 1,
  },
});

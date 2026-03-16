import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { shadow } from '@/lib/shadows';
import { getEvents, type CalendarEvent } from '@/lib/storage';
import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    FadeInDown,
    FadeInLeft,
    FadeInRight,
    FadeOut,
} from 'react-native-reanimated';

const PAGE_SIZE = 3;

const DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export type CalendarWidgetRef = { refresh: () => Promise<void> };

const CalendarWidget = forwardRef<CalendarWidgetRef>(function CalendarWidget(_props, ref) {
  const c = useAppColors();
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    const data = await getEvents();
    setEvents(data);
  };

  useImperativeHandle(ref, () => ({ refresh: loadEvents }), []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const weekLabel = `${startOfWeek.toLocaleDateString('ru-RU', { month: 'long' })} ${startOfWeek.getDate()}-${endOfWeek.getDate()}`;

  const upcomingEvents = events
    .filter((e) => new Date(e.date) >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const pages: CalendarEvent[][] = [];
  for (let i = 0; i < upcomingEvents.length; i += PAGE_SIZE) {
    pages.push(upcomingEvents.slice(i, i + PAGE_SIZE));
  }
  const totalPages = pages.length;
  const [currentPage, setCurrentPage] = useState(0);
  const [slideDir, setSlideDir] = useState<'left' | 'right'>('right');

  const goPage = (dir: 'left' | 'right') => {
    const next = dir === 'right' ? currentPage + 1 : currentPage - 1;
    if (next < 0 || next >= totalPages) return;
    setSlideDir(dir);
    setCurrentPage(next);
  };

  const formatEventDate = (event: CalendarEvent) => {
    const d = new Date(event.date);
    const isToday = d.toDateString() === today.toDateString();
    const isTomorrow = (() => {
      const tom = new Date(today);
      tom.setDate(today.getDate() + 1);
      return d.toDateString() === tom.toDateString();
    })();
    const dayLabel = isToday
      ? 'Сегодня'
      : isTomorrow
      ? 'Завтра'
      : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return event.time ? `${dayLabel}, ${event.time}` : dayLabel;
  };

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(500)}>
      <View
        style={[styles.container, { backgroundColor: c.cardBackground }]}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.textPrimary }]}>Календарь</Text>
          <Text style={[styles.weekLabel, { color: c.textSecondary }]}>{weekLabel}</Text>
        </View>

        <View style={styles.daysRow}>
          {DAYS.map((day, index) => (
            <View
              key={day}
              style={[
                styles.dayCell,
                index === new Date().getDay() && styles.dayCellActive,
              ]}
            >
              <Text
                style={[
                  styles.dayText,
                  index === new Date().getDay() && styles.dayTextActive,
                ]}
              >
                {day}
              </Text>
            </View>
          ))}
        </View>

        {upcomingEvents.length === 0 ? (
          <Text style={[styles.emptyText, { color: c.textMuted }]}>Нет предстоящих событий</Text>
        ) : (
          <View style={styles.eventsSection}>
            <View style={styles.eventsRow}>
              {totalPages > 1 && (
                <TouchableOpacity
                  onPress={() => goPage('left')}
                  disabled={currentPage === 0}
                  style={styles.pageArrow}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.pageArrowText, { color: currentPage === 0 ? c.border : c.accent }]}>‹</Text>
                </TouchableOpacity>
              )}

              <Animated.View
                key={currentPage}
                entering={slideDir === 'right' ? FadeInRight.duration(220) : FadeInLeft.duration(220)}
                exiting={FadeOut.duration(100)}
                style={styles.eventsPage}
                renderToHardwareTextureAndroid
              >
                {(pages[currentPage] || []).map((event) => (
                  <View
                    key={event.id}
                    style={[styles.eventBadge, { backgroundColor: event.color }]}
                  >
                    <Text style={styles.eventDate} numberOfLines={1}>{formatEventDate(event)}</Text>
                    <Text style={styles.eventText} numberOfLines={1}>{event.title}</Text>
                  </View>
                ))}
              </Animated.View>

              {totalPages > 1 && (
                <TouchableOpacity
                  onPress={() => goPage('right')}
                  disabled={currentPage === totalPages - 1}
                  style={styles.pageArrow}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.pageArrowText, { color: currentPage === totalPages - 1 ? c.border : c.accent }]}>›</Text>
                </TouchableOpacity>
              )}
            </View>

            {totalPages > 1 && (
              <View style={styles.pageDots}>
                {pages.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.pageDot, { backgroundColor: i === currentPage ? c.accent : c.border }]}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
});

export default CalendarWidget;

const styles = StyleSheet.create({
  container: {
    backgroundColor: AppColors.cardBackground,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    ...shadow({ offsetY: 2, opacity: 0.06, radius: 8, elevation: 3 }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  weekLabel: {
    fontSize: 14,
    color: AppColors.textSecondary,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dayCell: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  dayCellActive: {
    backgroundColor: AppColors.textPrimary,
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.textSecondary,
  },
  dayTextActive: {
    color: AppColors.textWhite,
  },
  eventsSection: {
    marginTop: 4,
  },
  eventsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageArrow: {
    width: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageArrowText: {
    fontSize: 22,
    fontWeight: '300',
    lineHeight: 26,
  },
  eventBadge: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  eventDate: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: '500',
    marginBottom: 3,
  },
  eventText: {
    color: AppColors.textWhite,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  eventsPage: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    paddingBottom: 4,
  },
  pageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emptyText: {
    fontSize: 13,
    marginTop: 4,
    color: AppColors.textMuted,
  },
});

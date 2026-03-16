import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { cancelEventReminders, scheduleEventReminders } from '@/lib/notifications';
import { shadow } from '@/lib/shadows';
import { addEvent, archiveEvent, deleteEvent, generateId, getActiveEvents, getArchivedEvents, type CalendarEvent } from '@/lib/storage';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, type Href } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const DAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const EVENT_COLORS = [AppColors.eventRed, AppColors.eventBlue, AppColors.eventGreen, AppColors.eventOrange];

export default function CalendarScreen() {
  const router = useRouter();
  const c = useAppColors();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [archivedEvents, setArchivedEvents] = useState<CalendarEvent[]>([]);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [weekOffset, setWeekOffset] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [remind, setRemind] = useState(false);

  const handleTimeInput = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) {
      setNewEventTime(digits);
    } else {
      setNewEventTime(`${digits.slice(0, 2)}:${digits.slice(2)}`);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [])
  );

  const loadEvents = async () => {
    await autoArchivePastEvents();
    const [active, archived] = await Promise.all([getActiveEvents(), getArchivedEvents()]);
    setEvents(active);
    setArchivedEvents(archived);
  };

  const autoArchivePastEvents = async () => {
    const active = await getActiveEvents();
    const now = new Date();
    for (const event of active) {
      if (!event.time) continue;
      const [h, m] = event.time.split(':').map(Number);
      const eventDateTime = new Date(`${event.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
      const diffMs = now.getTime() - eventDateTime.getTime();
      if (diffMs >= 10 * 60 * 1000) {
        await archiveEvent(event.id);
      }
    }
  };

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + weekOffset * 7);

  const handleAddEvent = async () => {
    if (!newEventTitle.trim()) return;

    const randomColor = EVENT_COLORS[Math.floor(Math.random() * EVENT_COLORS.length)];
    const eventDate = new Date(startOfWeek);
    eventDate.setDate(startOfWeek.getDate() + selectedDay);

    const event: CalendarEvent = {
      id: generateId(),
      title: newEventTitle.trim(),
      date: eventDate.toISOString().split('T')[0],
      time: newEventTime.trim() || undefined,
      color: randomColor,
      remind,
    };

    if (remind && event.time) {
      const ids = await scheduleEventReminders(event);
      event.notificationIds = ids;
    }

    await addEvent(event);
    await loadEvents();
    setNewEventTitle('');
    setNewEventTime('');
    setRemind(false);
    setShowModal(false);
  };

  const getDayDate = (dayIndex: number) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + dayIndex);
    return d.getDate();
  };

  const getFullDate = (dayIndex: number) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + dayIndex);
    return d;
  };

  const isToday = (dayIndex: number) => {
    const d = getFullDate(dayIndex);
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };

  const handleDeleteArchivedEvent = async (event: CalendarEvent) => {
    const confirmed =
      Platform.OS === 'web'
        ? window.confirm(`Удалить «${event.title}» из архива?`)
        : await new Promise<boolean>((resolve) => {
            const { Alert } = require('react-native');
            Alert.alert('Удалить из архива', `Удалить «${event.title}»?`, [
              { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Удалить', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (confirmed) {
      await deleteEvent(event.id);
      await loadEvents();
    }
  };

  const handleDeleteEvent = async (event: CalendarEvent) => {
    const confirmed =
      Platform.OS === 'web'
        ? window.confirm(`Удалить «${event.title}»?`)
        : await new Promise<boolean>((resolve) => {
            const { Alert } = require('react-native');
            Alert.alert('Удалить событие', `Удалить «${event.title}»?`, [
              { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Удалить', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (confirmed) {
      if (event.notificationIds?.length) {
        await cancelEventReminders(event.notificationIds);
      }
      await deleteEvent(event.id);
      await loadEvents();
    }
  };

  const getMonthYear = () => {
    const mid = new Date(startOfWeek);
    mid.setDate(startOfWeek.getDate() + 3);
    return mid.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.screenBackground }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Календарь</Text>
        <View style={styles.headerRight}>
          {archivedEvents.length > 0 && (
            <TouchableOpacity
              style={[styles.archiveBtn, { backgroundColor: c.cardBackground }]}
              onPress={() => setShowArchive(true)}
            >
              <Text style={[styles.archiveBtnText, { color: c.textSecondary }]}>🗂 Архив</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.avatarSmall, { backgroundColor: c.cardBackground }]} onPress={() => router.push('/profile' as Href)}>
            <Text style={styles.avatarIcon}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(500)}>
          <View style={styles.monthRow}>
            <TouchableOpacity onPress={() => setWeekOffset(weekOffset - 1)} style={[styles.navArrow, { backgroundColor: c.cardBackground }]}>
              <Text style={[styles.navArrowText, { color: c.textPrimary }]}>‹</Text>
            </TouchableOpacity>
            <Text style={[styles.monthYear, { color: c.textSecondary }]}>{getMonthYear()}</Text>
            <TouchableOpacity onPress={() => setWeekOffset(weekOffset + 1)} style={[styles.navArrow, { backgroundColor: c.cardBackground }]}>
              <Text style={[styles.navArrowText, { color: c.textPrimary }]}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.weekGrid, { backgroundColor: c.cardBackground }]}>
            {DAYS.map((day, index) => (
              <TouchableOpacity
                key={`${day}-${weekOffset}`}
                style={[
                  styles.dayColumn,
                  index === selectedDay && styles.dayColumnSelected,
                  isToday(index) && index !== selectedDay && styles.dayColumnToday,
                ]}
                onPress={() => setSelectedDay(index)}
              >
                <Text
                  style={[
                    styles.dayLabel,
                    (index === selectedDay || isToday(index)) && styles.dayLabelActive,
                  ]}
                >
                  {day}
                </Text>
                <Text
                  style={[
                    styles.dayNumber,
                    (index === selectedDay || isToday(index)) && styles.dayNumberActive,
                  ]}
                >
                  {getDayDate(index)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {weekOffset !== 0 && (
            <TouchableOpacity onPress={() => setWeekOffset(0)} style={styles.todayButton}>
              <Text style={styles.todayButtonText}>Сегодня</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(200)}>
          <View style={styles.eventsHeader}>
            <Text style={[styles.eventsTitle, { color: c.textPrimary }]}>События</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowModal(true)}
            >
              <Text style={styles.addButtonText}>+ Добавить</Text>
            </TouchableOpacity>
          </View>

          {events.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Событий пока нет</Text>
            </View>
          ) : (
            events.map((event, index) => (
              <Animated.View
                key={event.id}
                entering={FadeInUp.duration(400).delay(index * 100)}
              >
                <View style={[styles.eventCard, { backgroundColor: c.cardBackground }]}>
                  <View style={[styles.eventColorBar, { backgroundColor: event.color }]} />
                  <View style={styles.eventInfo}>
                    <Text style={[styles.eventTitle, { color: c.textPrimary }]}>{event.title}</Text>
                    <Text style={[styles.eventDate, { color: c.textSecondary }]}>
                      {event.date} {event.time ? `• ${event.time}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.eventDeleteBtn}
                    onPress={() => handleDeleteEvent(event)}
                  >
                    <Text style={styles.eventDeleteText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            ))
          )}
        </Animated.View>
      </ScrollView>

      {/* Archive Modal */}
      <Modal visible={showArchive} transparent animationType="slide">
        <SafeAreaView style={[styles.archiveScreen, { backgroundColor: c.screenBackground }]}>
          <View style={styles.archiveHeader}>
            <Text style={[styles.archiveTitle, { color: c.textPrimary }]}>🗂 Архив событий</Text>
            <TouchableOpacity onPress={() => setShowArchive(false)} style={styles.archiveCloseBtn}>
              <Text style={[styles.archiveCloseText, { color: c.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.archiveList}>
            {archivedEvents.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Архив пуст</Text>
              </View>
            ) : (
              archivedEvents.map((event) => (
                <View key={event.id} style={[styles.eventCard, { backgroundColor: c.cardBackground }]}>
                  <View style={[styles.eventColorBar, { backgroundColor: event.color }]} />
                  <View style={styles.eventInfo}>
                    <Text style={[styles.eventTitle, { color: c.textPrimary }]}>{event.title}</Text>
                    <Text style={[styles.eventDate, { color: c.textSecondary }]}>
                      {event.date}{event.time ? ` • ${event.time}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.eventDeleteBtn}
                    onPress={() => handleDeleteArchivedEvent(event)}
                  >
                    <Text style={styles.eventDeleteText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: c.cardBackground }]}>
            <Text style={styles.modalIcon}>📅</Text>
            <Text style={[styles.modalTitle, { color: c.textPrimary }]}>Детали события</Text>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>День</Text>
              <Text style={[styles.modalValue, { color: c.textPrimary }]}>{DAYS[selectedDay]}</Text>
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Назв.</Text>
              <TextInput
                style={[styles.modalInput, { color: c.textPrimary, borderBottomColor: c.border }]}
                placeholder="Встреча..."
                placeholderTextColor={c.placeholder}
                value={newEventTitle}
                onChangeText={setNewEventTitle}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Время</Text>
              <TextInput
                style={[styles.modalInput, { color: c.textPrimary, borderBottomColor: c.border }]}
                placeholder="14:00"
                placeholderTextColor={c.placeholder}
                value={newEventTime}
                onChangeText={handleTimeInput}
                keyboardType="numeric"
                maxLength={5}
              />
            </View>

            <View style={styles.modalRemindRow}>
              <Text style={[styles.modalRemindText, { color: c.textSecondary }]}>
                Напомнить за день и за час
              </Text>
              <Switch
                value={remind}
                onValueChange={setRemind}
                trackColor={{ false: c.border, true: c.accent }}
                thumbColor={AppColors.textWhite}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: c.border }]}
                onPress={() => setShowModal(false)}
              >
                <Text style={[styles.cancelButtonText, { color: c.textSecondary }]}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleAddEvent}
              >
                <Text style={styles.saveButtonText}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AppColors.screenBackground,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  archiveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  archiveBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  avatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarIcon: {
    fontSize: 20,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: AppColors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navArrowText: {
    fontSize: 22,
    fontWeight: '600',
    color: AppColors.textPrimary,
  },
  monthYear: {
    fontSize: 18,
    fontWeight: '600',
    color: AppColors.textSecondary,
  },
  todayButton: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: AppColors.accent,
    marginBottom: 8,
  },
  todayButtonText: {
    color: AppColors.textWhite,
    fontWeight: '600',
    fontSize: 13,
  },
  weekGrid: {
    flexDirection: 'row',
    backgroundColor: AppColors.cardBackground,
    borderRadius: 20,
    padding: 12,
    marginBottom: 24,
    ...shadow({ offsetY: 2, opacity: 0.06, radius: 8, elevation: 3 }),
  },
  dayColumn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
  },
  dayColumnSelected: {
    backgroundColor: AppColors.accent,
  },
  dayColumnToday: {
    backgroundColor: AppColors.textPrimary,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.textSecondary,
    marginBottom: 4,
  },
  dayLabelActive: {
    color: AppColors.textWhite,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  dayNumberActive: {
    color: AppColors.textWhite,
  },
  eventsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  eventsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  addButton: {
    backgroundColor: AppColors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  addButtonText: {
    color: AppColors.textWhite,
    fontWeight: '600',
    fontSize: 14,
  },
  emptyState: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    color: AppColors.textMuted,
    fontSize: 15,
  },
  eventDeleteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventDeleteText: {
    color: AppColors.error,
    fontSize: 18,
    fontWeight: '700',
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.cardBackground,
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
    ...shadow({ offsetY: 1, opacity: 0.05, radius: 4, elevation: 2 }),
  },
  eventColorBar: {
    width: 5,
    height: '100%',
    minHeight: 60,
  },
  eventInfo: {
    flex: 1,
    padding: 16,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: AppColors.textPrimary,
  },
  eventDate: {
    fontSize: 13,
    color: AppColors.textSecondary,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    backgroundColor: AppColors.cardBackground,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  modalIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
    marginBottom: 20,
  },
  modalField: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.accent,
    width: 50,
  },
  modalValue: {
    fontSize: 14,
    color: AppColors.textPrimary,
    fontWeight: '500',
  },
  modalInput: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
    paddingVertical: 6,
    fontSize: 14,
    color: AppColors.textPrimary,
  },
  modalRemindRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 4,
  },
  modalRemindText: {
    fontSize: 13,
    fontWeight: '500',
    color: AppColors.textSecondary,
    flex: 1,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.textSecondary,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: AppColors.accent,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.textWhite,
  },
  archiveScreen: {
    flex: 1,
  },
  archiveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  archiveTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  archiveCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  archiveCloseText: {
    fontSize: 18,
    fontWeight: '700',
  },
  archiveList: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
});

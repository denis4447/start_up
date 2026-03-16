import AnimatedPressable from '@/components/animated-pressable';
import PinModal from '@/components/pin-modal';
import AppIcon from '@/components/ui/app-icon';
import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useAITasks } from '@/lib/ai-task-context';
import { verifyNotePin } from '@/lib/note-security';
import { shadow } from '@/lib/shadows';
import { getNotes, type Note } from '@/lib/storage';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotesScreen() {
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const { tasksByNote } = useAITasks();
  const c = useAppColors();
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState(q || '');
  const [pinModal, setPinModal] = useState(false);
  const [pendingNote, setPendingNote] = useState<Note | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadNotes();
    }, [])
  );

  const loadNotes = async () => {
    const data = await getNotes();
    setNotes(data);
  };

  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (!n.locked && n.content.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const openNote = (note: Note) => {
    if (note.locked) {
      setPendingNote(note);
      setPinModal(true);
    } else {
      router.push(`/notes/${note.id}` as Href);
    }
  };

  const handlePinSuccess = async (pin: string) => {
    if (!pendingNote) return;
    const valid = await verifyNotePin(pendingNote.id, pin);
    if (valid) {
      setPinModal(false);
      router.push(`/notes/${pendingNote.id}` as Href);
      setPendingNote(null);
    } else {
      if (Platform.OS === 'web') {
        window.alert('Неверный PIN-код');
      } else {
        Alert.alert('Ошибка', 'Неверный PIN-код');
      }
      setPinModal(false);
      setPendingNote(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.screenBackground }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backButton, { color: c.textPrimary }]}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.avatarSmall}>
          {/* @pixel-size: ИКОНКА — должна быть на 8-10px меньше контейнера выше */}
          <AppIcon name="user" size={28} color={c.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.searchContainer, { backgroundColor: c.cardBackground }]}>
          <AppIcon name="search" size={16} color={c.textMuted} style={{ marginRight: 10 }} />
          <TextInput
            style={[styles.searchInput, { color: c.textPrimary }]}
            placeholder="Поиск"
            placeholderTextColor={c.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <Text style={[styles.title, { color: c.textPrimary }]}>Заметки</Text>

        <Animated.View entering={FadeInDown.duration(500)} style={[styles.aiCard, { backgroundColor: c.cardBackgroundWarm }]}>
          <View style={styles.aiHeader}>
            <View style={styles.aiIconContainer}>
              <AppIcon name="sparkle" size={16} color={c.accent} />
            </View>
            <Text style={styles.aiTitle}>AI-помощник</Text>
          </View>
          <Text style={styles.aiSubtitle}>Попросите AI написать, резюмировать или структурировать...</Text>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={() => router.push('/notes/new' as Href)}
          >
            <Text style={styles.generateButtonText}>Создать</Text>
          </TouchableOpacity>
        </Animated.View>

        {filteredNotes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: c.textMuted }]}>
              {notes.length === 0
                ? 'Заметок пока нет. Создайте первую!'
                : 'Ничего не найдено'}
            </Text>
          </View>
        ) : (
          filteredNotes.map((note, index) => (
            <Animated.View
              key={note.id}
              entering={FadeInDown.duration(300).delay(index * 40)}
            >
              <AnimatedPressable
                style={[styles.noteCard, { backgroundColor: c.cardBackground }]}
                onPress={() => openNote(note)}
              >
                <View style={styles.noteContent}>
                  <View style={styles.noteTitleRow}>
                    <Text style={[styles.noteTitle, { color: c.textPrimary, flex: 1 }]} numberOfLines={1}>
                      {note.title}
                    </Text>
                    {note.locked && <AppIcon name="lock" size={14} color={c.textMuted} style={{ marginLeft: 6 }} />}
                    {tasksByNote[note.id] && (
                      <ActivityIndicator size="small" color={c.accent} style={styles.aiSpinner} />
                    )}
                  </View>
                  <Text style={[styles.notePreview, { color: note.locked ? c.textMuted : c.textSecondary, fontStyle: note.locked ? 'italic' : 'normal' }]} numberOfLines={2}>
                    {note.locked ? 'Заметка защищена паролем' : note.content}
                  </Text>
                  <View style={styles.noteFooter}>
                    {note.tags.length > 0 && (
                      <View style={styles.tagsRow}>
                        {note.tags.slice(0, 3).map((tag) => (
                          <View key={tag} style={styles.tag}>
                            <Text style={styles.tagText}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <Text style={styles.noteDate}>{formatDate(note.updatedAt)}</Text>
                  </View>
                </View>
              </AnimatedPressable>
            </Animated.View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/notes/new' as Href)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
      <PinModal
        visible={pinModal}
        mode="unlock"
        onSuccess={handlePinSuccess}
        onCancel={() => { setPinModal(false); setPendingNote(null); }}
      />
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
  backButton: {
    fontSize: 24,
    color: AppColors.textPrimary,
  },
  avatarSmall: {
    // @pixel-size: КОНТЕЙНЕР — меняй эти два числа, чтобы изменить размер кнопки
    // size= в JSX должен быть на 8-10px МЕНЬШЕ width/height (padding внутри кнопки)
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
    paddingBottom: 100,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.cardBackground,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 20,
    ...shadow({ offsetY: 1, opacity: 0.05, radius: 4, elevation: 2 }),
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: AppColors.textPrimary,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
    marginBottom: 16,
  },
  aiCard: {
    backgroundColor: AppColors.cardBackgroundWarm,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  aiIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: AppColors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiIcon: {
    fontSize: 16,
  },
  aiTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  aiSubtitle: {
    fontSize: 13,
    color: AppColors.textSecondary,
    marginBottom: 12,
  },
  generateButton: {
    alignSelf: 'flex-end',
    backgroundColor: AppColors.accent,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
  },
  generateButtonText: {
    color: AppColors.textWhite,
    fontWeight: '600',
    fontSize: 14,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: AppColors.textMuted,
    fontSize: 15,
  },
  noteCard: {
    backgroundColor: AppColors.cardBackground,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    ...shadow({ offsetY: 1, opacity: 0.05, radius: 4, elevation: 2 }),
  },
  noteContent: {
    padding: 16,
  },
  noteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  lockIcon: {
    fontSize: 14,
    marginLeft: 6,
  },
  aiSpinner: {
    marginLeft: 6,
  },
  noteTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  notePreview: {
    fontSize: 14,
    color: AppColors.textSecondary,
    lineHeight: 20,
    marginBottom: 10,
  },
  noteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tag: {
    backgroundColor: AppColors.eventGreen,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    color: AppColors.textWhite,
    fontSize: 11,
    fontWeight: '600',
  },
  noteDate: {
    fontSize: 12,
    color: AppColors.textMuted,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AppColors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow({ offsetY: 4, opacity: 0.2, radius: 8, elevation: 6 }),
  },
  fabIcon: {
    color: AppColors.textWhite,
    fontSize: 28,
    fontWeight: '300',
    marginTop: -2,
  },
});

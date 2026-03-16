import PinModal from '@/components/pin-modal';
import AppIcon, { type AppIconName } from '@/components/ui/app-icon';
import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useNoteAITask } from '@/hooks/use-ai-tasks';
import { LicenseRequiredError, type TransformAction, type TransformStyle } from '@/lib/api';
import { useAITasks } from '@/lib/ai-task-context';
import { isDeviceCompromised } from '@/lib/device-security';
import { exportNoteAsMarkdown } from '@/lib/note-export';
import { hasNotePin, isPinLocked, removeNotePin, setNotePin, verifyNotePin } from '@/lib/note-security';
import { deleteNote, getNotes, saveNote, type Note, type NoteVersion } from '@/lib/storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    AppState,
    InteractionManager,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    FadeIn,
    FadeInDown,
    FadeInUp,
    FadeOut,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const ACTION_LABELS: Record<TransformAction, string> = {
  structure: 'Структурировать',
  expand: 'Расширить',
  shorten: 'Сократить',
  style: 'Поменять стиль',
};

const STYLE_ICONS: Record<TransformStyle, AppIconName> = {
  friendly: 'friendly',
  business: 'business',
  email: 'email',
  post: 'phone',
};

const STYLE_LABELS: Record<TransformStyle, string> = {
  friendly: 'Дружелюбный',
  business: 'Деловой',
  email: 'Эл. письмо',
  post: 'SMM-пост',
};

const ACTION_LABEL_MAP: Record<string, string> = {
  structure: 'Структурирование',
  expand: 'Расширение',
  shorten: 'Сокращение',
  'style-friendly': 'Стиль: дружелюбный',
  'style-business': 'Стиль: деловой',
  'style-email': 'Стиль: эл. письмо',
  'style-post': 'Стиль: SMM-пост',
};

export default function NoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useAppColors();
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // AI task queue integration
  const { submitTask } = useAITasks();
  const { task: aiTask, isProcessing: isTransforming, isActive: hasActiveTask, partialResult } = useNoteAITask(id);
  const prevAiTaskRef = useRef(aiTask);

  // AI menu state
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [transformLabel, setTransformLabel] = useState('');

  // Lock & export state
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinMode, setPinMode] = useState<'set' | 'unlock' | 'change' | 'remove'>('set');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const appStateRef = useRef(AppState.currentState);

  // Version navigation
  const [versionIndex, setVersionIndex] = useState(0);

  // Content slide+fade animation
  const contentX = useSharedValue(0);
  const contentOpacity = useSharedValue(1);

  const contentAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: contentX.value }],
    opacity: contentOpacity.value,
  }));

  useEffect(() => {
    loadNote();
  }, [id]);

  // Auto-reload note when background AI task completes (result was auto-applied)
  useEffect(() => {
    if (prevAiTaskRef.current && !aiTask) {
      // Task just completed/failed — reload to pick up new NoteVersion
      loadNote();
    }
    prevAiTaskRef.current = aiTask;
  }, [aiTask]);

  // Re-lock note when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current === 'active' && nextState.match(/inactive|background/)) {
        if (note?.locked) {
          setIsUnlocked(false);
          setTitle('');
          setContent('');
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [note?.locked]);

  const loadNote = async () => {
    const notes = await getNotes();
    const found = notes.find((n) => n.id === id);
    if (found) {
      setNote(found);
      if (found.locked) {
        // Don't populate content for locked notes — require PIN first
        setTitle(found.title);
        setContent('');
        setIsUnlocked(false);
        setPinMode('unlock');
        setPinModalVisible(true);
      } else {
        setTitle(found.title);
        setContent(found.content);
        setIsUnlocked(true);
      }
      setVersionIndex(0);
    }
  };

  const versions: NoteVersion[] = note
    ? [
        { content: note.content, label: 'Оригинал', createdAt: note.createdAt },
        ...(note.versions || []),
      ]
    : [];

  const currentVersionContent = versions[versionIndex]?.content ?? content;
  const currentVersionLabel = versions[versionIndex]?.label ?? 'Оригинал';

  const animateToVersion = (dir: 'left' | 'right', nextIndex: number) => {
    const exitX = dir === 'right' ? -60 : 60;
    const enterX = dir === 'right' ? 60 : -60;
    contentX.value = withTiming(exitX, { duration: 160 });
    contentOpacity.value = withTiming(0, { duration: 160 }, () => {
      runOnJS(setVersionIndex)(nextIndex);
      contentX.value = enterX;
      contentX.value = withSpring(0, { damping: 18, stiffness: 220 });
      contentOpacity.value = withTiming(1, { duration: 180 });
    });
  };

  const goToVersion = (dir: 'left' | 'right') => {
    const next = dir === 'right' ? versionIndex + 1 : versionIndex - 1;
    if (next < 0 || next >= versions.length) return;
    animateToVersion(dir, next);
  };

  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    if (!note) return;
    const updated: Note = {
      ...note,
      title,
      content,
      versions: note.versions,
      updatedAt: new Date().toISOString(),
    };
    await saveNote(updated);
    setNote(updated);
    setIsEditing(false);
    // Visual save confirmation
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n${message}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: onConfirm },
      ]);
    }
  };

  const handleDelete = () => {
    const isOriginal = versionIndex === 0;
    const hasOtherVersions = (note?.versions || []).length > 0;

    if (isOriginal && !hasOtherVersions) {
      confirmAction('Удалить заметку', 'Страниц не осталось. Удалить заметку целиком?', async () => {
        if (note) {
          await deleteNote(note.id);
          router.back();
        }
      });
    } else {
      confirmAction('Удалить страницу', 'Удалить текущую страницу заметки?', async () => {
        if (!note) return;
        if (isOriginal) {
          const newVersions = [...(note.versions || [])];
          const firstVersion = newVersions.shift()!;
          const updated: Note = {
            ...note,
            content: firstVersion.content,
            versions: newVersions,
            updatedAt: new Date().toISOString(),
          };
          await saveNote(updated);
          setNote(updated);
          setContent(updated.content);
          setVersionIndex(0);
        } else {
          const newVersions = [...(note.versions || [])];
          newVersions.splice(versionIndex - 1, 1);
          const updated: Note = {
            ...note,
            versions: newVersions,
            updatedAt: new Date().toISOString(),
          };
          await saveNote(updated);
          setNote(updated);
          setVersionIndex(Math.min(versionIndex, newVersions.length));
        }
      });
    }
  };

  const handleTransform = async (action: TransformAction, style?: TransformStyle) => {
    if (!currentVersionContent.trim() || !note) return;
    setShowAiMenu(false);
    setShowStyleMenu(false);

    const labelKey = action === 'style' && style ? `style-${style}` : action;
    setTransformLabel(ACTION_LABEL_MAP[labelKey] || action);

    try {
      await submitTask({
        noteId: note.id,
        noteContent: currentVersionContent,
        action,
        style,
        language: 'ru',
        versionLabel: ACTION_LABEL_MAP[labelKey] || action,
      });
    } catch (err) {
      if (err instanceof LicenseRequiredError) {
        if (Platform.OS === 'web') {
          if (window.confirm('Лицензия\nДля AI-функций необходима активная лицензия. Активировать?')) {
            router.push('/activation' as any);
          }
        } else {
          Alert.alert('Лицензия', 'Для AI-функций необходима активная лицензия.', [
            { text: 'Активировать', onPress: () => router.push('/activation' as any) },
            { text: 'Отмена', style: 'cancel' },
          ]);
        }
      }
    }
  };

  // Reject auto-applied version: remove the last version that was added by the task
  const rejectTransformed = async () => {
    if (!note) return;
    const versions = [...(note.versions || [])];
    if (versions.length === 0) return;
    versions.pop(); // remove last auto-applied version
    const updated: Note = { ...note, versions, updatedAt: new Date().toISOString() };
    await saveNote(updated);
    setNote(updated);
    setVersionIndex(Math.min(versionIndex, versions.length));
  };

  const handleLockPress = async () => {
    if (!note) return;
    const isLocked = note.locked && (await hasNotePin(note.id));
    if (isLocked) {
      // Already locked — show options: change PIN or remove lock
      if (Platform.OS === 'web') {
        const choice = window.confirm('Заметка защищена.\nOK — снять защиту\nОтмена — оставить');
        if (choice) {
          setPinMode('remove');
          setPinModalVisible(true);
        }
      } else {
        Alert.alert('Защита заметки', 'Заметка защищена PIN-кодом', [
          { text: 'Снять защиту', style: 'destructive', onPress: () => { setPinMode('remove'); setPinModalVisible(true); } },
          { text: 'Изменить PIN', onPress: () => { setPinMode('change'); setPinModalVisible(true); } },
          { text: 'Отмена', style: 'cancel' },
        ]);
      }
    } else {
      // Not locked — check device security before setting PIN
      const compromised = await isDeviceCompromised();
      if (compromised) {
        const msg = 'Обнаружено: устройство имеет root/jailbreak доступ. PIN-защита может быть менее эффективной. Продолжить?';
        if (Platform.OS === 'web') {
          if (!window.confirm(msg)) return;
        } else {
          await new Promise<void>((resolve) => {
            Alert.alert('Предупреждение', msg, [
              { text: 'Отмена', style: 'cancel', onPress: () => resolve() },
              { text: 'Продолжить', onPress: () => { setPinMode('set'); setPinModalVisible(true); resolve(); } },
            ]);
          });
          return;
        }
      }
      setPinMode('set');
      setPinModalVisible(true);
    }
  };

  const handlePinSuccess = async (pin: string) => {
    if (!note) return;

    if (pinMode === 'unlock') {
      const lockStatus = await isPinLocked(note.id);
      if (lockStatus.locked) {
        setPinModalVisible(false);
        const mins = Math.ceil(lockStatus.remainingMs / 60000);
        const msg = `Слишком много попыток. Повторите через ${mins} мин.`;
        Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Блокировка', msg);
        router.back();
        return;
      }
      // Show loader, then defer heavy PBKDF2 hashing off the animation frame
      setPinModalVisible(false);
      setIsVerifyingPin(true);
      InteractionManager.runAfterInteractions(async () => {
        const valid = await verifyNotePin(note.id, pin);
        setIsVerifyingPin(false);
        if (valid) {
          setTitle(note.title);
          setContent(note.content);
          setIsUnlocked(true);
        } else {
          const afterLock = await isPinLocked(note.id);
          if (afterLock.locked) {
            const mins = Math.ceil(afterLock.remainingMs / 60000);
            const msg = `Слишком много попыток. Повторите через ${mins} мин.`;
            Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Блокировка', msg);
          } else {
            const msg = 'Неверный PIN-код';
            Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Ошибка', msg);
          }
          router.back();
        }
      });
      return;
    }

    if (pinMode === 'set') {
      await setNotePin(note.id, pin);
      const updated = { ...note, locked: true, updatedAt: new Date().toISOString() };
      await saveNote(updated);
      setNote(updated);
      setPinModalVisible(false);
    } else if (pinMode === 'remove') {
      const valid = await verifyNotePin(note.id, pin);
      if (valid) {
        await removeNotePin(note.id);
        const updated = { ...note, locked: false, updatedAt: new Date().toISOString() };
        await saveNote(updated);
        setNote(updated);
        setPinModalVisible(false);
      } else {
        setPinModalVisible(false);
        const msg = 'Неверный PIN-код';
        Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Ошибка', msg);
      }
    } else if (pinMode === 'change') {
      const valid = await verifyNotePin(note.id, pin);
      if (valid) {
        setPinModalVisible(false);
        setTimeout(() => {
          setPinMode('set');
          setPinModalVisible(true);
        }, 300);
      } else {
        setPinModalVisible(false);
        const msg = 'Неверный PIN-код';
        Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Ошибка', msg);
      }
    }
  };

  const handleExport = async () => {
    if (!note) return;
    try {
      await exportNoteAsMarkdown(note);
    } catch (err) {
      const msg = 'Не удалось экспортировать заметку';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Ошибка', msg);
    }
  };

  if (!note) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: c.screenBackground }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: c.textMuted }]}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Locked note — block all content until PIN is verified
  if (note.locked && !isUnlocked) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: c.screenBackground }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backButton, { color: c.textPrimary }]}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.lockedContainer}>
          {isVerifyingPin ? (
            <>
              <ActivityIndicator size="large" color={c.accent} style={{ marginBottom: 16 }} />
              <Text style={[styles.lockedTitle, { color: c.textPrimary }]}>Проверка PIN...</Text>
            </>
          ) : (
            <>
              <AppIcon name="lock" size={48} color={c.textMuted} />
              <Text style={[styles.lockedTitle, { color: c.textPrimary }]}>Заметка защищена</Text>
              <Text style={[styles.lockedSubtitle, { color: c.textMuted }]}>Введите PIN-код для доступа</Text>
              <TouchableOpacity
                style={[styles.unlockBtn, { backgroundColor: c.accent }]}
                onPress={() => { setPinMode('unlock'); setPinModalVisible(true); }}
              >
                <Text style={styles.unlockBtnText}>Разблокировать</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        <PinModal
          visible={pinModalVisible}
          mode="unlock"
          onSuccess={handlePinSuccess}
          onCancel={() => { setPinModalVisible(false); router.back(); }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.screenBackground }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backButton, { color: c.textPrimary }]}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {isEditing ? (
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Сохр.</Text>
            </TouchableOpacity>
          ) : (
            <>
              <View>
                <TouchableOpacity
                  style={[styles.aiBtn, { backgroundColor: c.cardBackgroundWarm }]}
                  onPress={() => { setShowAiMenu(!showAiMenu); setShowStyleMenu(false); }}
                  disabled={hasActiveTask}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <AppIcon name={hasActiveTask ? 'hourglass' : 'sparkle'} size={13} color={c.accent} />
                    <Text style={[styles.aiBtnText, { color: c.accent }]}>
                      {hasActiveTask ? 'AI...' : 'AI'}
                    </Text>
                  </View>
                </TouchableOpacity>

                {showAiMenu && (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(150)}
                    style={[styles.aiMenu, { backgroundColor: c.cardBackground, borderColor: c.border }]}
                  >
                    {!showStyleMenu ? (
                      <>
                        {(['structure', 'expand', 'shorten'] as TransformAction[]).map((action) => (
                          <TouchableOpacity
                            key={action}
                            style={styles.aiMenuItem}
                            onPress={() => handleTransform(action)}
                          >
                            <Text style={[styles.aiMenuText, { color: c.textPrimary }]}>
                              {ACTION_LABELS[action]}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                          style={styles.aiMenuItem}
                          onPress={() => setShowStyleMenu(true)}
                        >
                          <Text style={[styles.aiMenuText, { color: c.textPrimary }]}>
                            {ACTION_LABELS.style} →
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.aiMenuItem}
                          onPress={() => setShowStyleMenu(false)}
                        >
                          <Text style={[styles.aiMenuText, { color: c.accent }]}>← Назад</Text>
                        </TouchableOpacity>
                        {(Object.keys(STYLE_LABELS) as TransformStyle[]).map((style) => (
                          <TouchableOpacity
                            key={style}
                            style={styles.aiMenuItem}
                            onPress={() => handleTransform('style', style)}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <AppIcon name={STYLE_ICONS[style]} size={16} color={c.textPrimary} />
                              <Text style={[styles.aiMenuText, { color: c.textPrimary }]}>
                                {STYLE_LABELS[style]}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                  </Animated.View>
                )}
              </View>
              <TouchableOpacity onPress={handleExport} style={styles.toolbarBtn}>
                <AppIcon name="export" size={18} color={c.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLockPress} style={styles.toolbarBtn}>
                <AppIcon name={note.locked ? 'lock' : 'unlock'} size={18} color={c.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsEditing(true)}>
                <Text style={[styles.editBtn, { color: c.accent }]}>Ред.</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete}>
                <Text style={styles.deleteBtn}>✕</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Save success indicator */}
      {saveSuccess && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={[styles.saveToast, { backgroundColor: c.accent }]}>
          <Text style={styles.saveToastText}>✓ Сохранено</Text>
        </Animated.View>
      )}

      {/* Dismiss AI menu overlay */}
      {showAiMenu && (
        <Pressable style={styles.menuOverlay} onPress={() => { setShowAiMenu(false); setShowStyleMenu(false); }} />
      )}

      <GestureDetector gesture={Gesture.Pan()
        .minDistance(30)
        .onEnd((e) => {
          'worklet';
          if (Math.abs(e.translationX) > Math.abs(e.translationY) * 1.5 && Math.abs(e.translationX) > 40) {
            if (e.translationX < 0 && versionIndex < versions.length - 1) {
              runOnJS(animateToVersion)('right', versionIndex + 1);
            } else if (e.translationX > 0 && versionIndex > 0) {
              runOnJS(animateToVersion)('left', versionIndex - 1);
            }
          }
        })
      }>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* AI processing indicator — streaming partial result */}
        {hasActiveTask && partialResult ? (
          <Animated.View entering={FadeIn.duration(400)} style={[styles.transformCard, { backgroundColor: c.cardBackground, borderColor: c.accent }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <ActivityIndicator size="small" color={c.accent} style={{ marginRight: 8 }} />
              <Text style={[styles.transformLabel, { color: c.accent, marginBottom: 0 }]}>
                AI — {transformLabel || aiTask?.versionLabel}...
              </Text>
            </View>
            <Text style={[styles.transformText, { color: c.textPrimary }]}>{partialResult}</Text>
          </Animated.View>
        ) : hasActiveTask ? (
          <Animated.View entering={FadeIn.duration(400)} style={[styles.transformCard, { backgroundColor: c.cardBackground, borderColor: c.accent }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator size="small" color={c.accent} style={{ marginRight: 8 }} />
              <Text style={[styles.transformLabel, { color: c.accent, marginBottom: 0 }]}>
                {aiTask?.attempt && aiTask.attempt > 1 ? `Повторная попытка (${aiTask.attempt}/3)...` : 'Обработка...'}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        {/* Main note content */}
        {isEditing ? (
          <>
            <TextInput
              style={[styles.titleInput, { color: c.textPrimary, borderBottomColor: c.border }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Название"
              placeholderTextColor={c.placeholder}
            />
            <TextInput
              style={[styles.contentInput, { color: c.textPrimary }]}
              value={content}
              onChangeText={setContent}
              placeholder="Напишите заметку..."
              placeholderTextColor={c.placeholder}
              multiline
              textAlignVertical="top"
            />
          </>
        ) : (
          <>
            <Animated.Text
              entering={FadeInDown.duration(400)}
              style={[styles.noteTitle, { color: c.textPrimary }]}
            >
              {note.title}
            </Animated.Text>
            <Animated.Text
              entering={FadeInDown.duration(400).delay(80)}
              style={[styles.noteDate, { color: c.textMuted }]}
            >
              {new Date(note.updatedAt).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Animated.Text>

            {/* Version content with slide animation */}
            <Animated.Text
              style={[styles.noteContent, { color: c.textPrimary }, contentAnimStyle]}
            >
              {currentVersionContent}
            </Animated.Text>
          </>
        )}
      </ScrollView>
      </GestureDetector>

      {/* Version navigation pill — only show when >1 version and not editing */}
      {!isEditing && versions.length > 1 && (
        <Animated.View entering={FadeInUp.duration(300)} style={styles.versionBarOuter}>
          <View style={[styles.versionPill, { backgroundColor: c.cardBackground }]}>
            <Pressable
              onPress={() => goToVersion('left')}
              disabled={versionIndex === 0}
              style={({ pressed }) => [styles.versionArrow, pressed && styles.arrowPressed]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[styles.versionArrowText, { color: versionIndex === 0 ? c.textMuted : c.accent }]}>‹</Text>
            </Pressable>

            <View style={styles.versionInfo}>
              <Text style={[styles.versionLabel, { color: c.textPrimary }]} numberOfLines={1}>
                {currentVersionLabel}
              </Text>
              <View style={styles.versionDots}>
                {versions.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.versionDot,
                      {
                        backgroundColor: i === versionIndex ? c.accent : c.border,
                        width: i === versionIndex ? 16 : 6,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>

            <Pressable
              onPress={() => goToVersion('right')}
              disabled={versionIndex === versions.length - 1}
              style={({ pressed }) => [styles.versionArrow, pressed && styles.arrowPressed]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[styles.versionArrowText, { color: versionIndex === versions.length - 1 ? c.textMuted : c.accent }]}>›</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
      <PinModal
        visible={pinModalVisible}
        mode={pinMode}
        onSuccess={handlePinSuccess}
        onCancel={() => setPinModalVisible(false)}
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
    zIndex: 20,
  },
  backButton: {
    fontSize: 24,
    color: AppColors.textPrimary,
  },
  lockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  lockedIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  lockedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  lockedSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  unlockBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  unlockBtnText: {
    color: AppColors.textWhite,
    fontSize: 16,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  toolbarBtn: {
    padding: 4,
  },
  toolbarBtnIcon: {
    fontSize: 18,
  },
  saveBtn: {
    backgroundColor: AppColors.accent,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveBtnText: {
    color: AppColors.textWhite,
    fontWeight: '600',
    fontSize: 14,
  },
  aiBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  aiBtnText: {
    fontWeight: '600',
    fontSize: 13,
  },
  aiMenu: {
    position: 'absolute',
    top: 42,
    right: 0,
    width: 200,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 6,
    zIndex: 100,
    elevation: 20,
    boxShadow: '0px 4px 12px rgba(0,0,0,0.2)',
  },
  aiMenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  aiMenuText: {
    fontSize: 14,
    fontWeight: '500',
  },
  menuOverlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  editBtn: {
    fontWeight: '600',
    fontSize: 15,
  },
  deleteBtn: {
    fontSize: 18,
    color: AppColors.error,
    fontWeight: '700',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: AppColors.textMuted,
    fontSize: 16,
  },
  transformCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 2,
  },
  transformLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  transformText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  transformActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  rejectBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  rejectBtnText: {
    fontWeight: '600',
    fontSize: 14,
  },
  acceptBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: AppColors.success,
  },
  acceptBtnText: {
    color: AppColors.textWhite,
    fontWeight: '600',
    fontSize: 14,
  },
  titleInput: {
    fontSize: 26,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
    marginBottom: 16,
    borderBottomWidth: 1,
    paddingBottom: 10,
  },
  contentInput: {
    fontSize: 16,
    color: AppColors.textPrimary,
    lineHeight: 24,
    minHeight: 300,
  },
  noteTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
    marginBottom: 8,
  },
  noteDate: {
    fontSize: 13,
    color: AppColors.textMuted,
    marginBottom: 20,
  },
  noteContent: {
    fontSize: 16,
    color: AppColors.textPrimary,
    lineHeight: 24,
  },
  versionBarOuter: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  versionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 8,
    boxShadow: '0px 4px 12px rgba(0,0,0,0.15)',
    elevation: 8,
    minWidth: 180,
  },
  versionArrow: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  arrowPressed: {
    opacity: 0.4,
    transform: [{ scale: 0.8 }],
  },
  versionArrowText: {
    fontSize: 26,
    fontWeight: '300',
  },
  versionInfo: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  versionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  versionDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  versionDot: {
    height: 6,
    borderRadius: 3,
  },
  saveToast: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    zIndex: 50,
    elevation: 10,
  },
  saveToastText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

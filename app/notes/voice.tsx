import AppIcon from '@/components/ui/app-icon';
import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { LicenseRequiredError, UltraRequiredError, transcribeAudio } from '@/lib/api';
import { shadow } from '@/lib/shadows';
import { generateId, saveNote, type Note } from '@/lib/storage';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, {
    Easing,
    FadeIn,
    FadeInDown,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type Stage = 'idle' | 'recording' | 'processing' | 'done' | 'error';

export default function VoiceNoteScreen() {
  const router = useRouter();
  const c = useAppColors();
  const [stage, setStage] = useState<Stage>('idle');
  const [duration, setDuration] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<{ title: string; content: string; transcript: string } | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pulseScale = useSharedValue(1);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorder.isRecording) {
        recorder.stop().catch(() => {});
      }
    };
  }, [recorder]);

  useEffect(() => {
    if (stage === 'recording') {
      pulseScale.value = withRepeat(
        withTiming(1.25, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [stage, pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const startRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Доступ', 'Разрешите доступ к микрофону для записи голосовых заметок');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();

      setStage('recording');
      setDuration(0);
      setErrorMsg('');

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      if (__DEV__) console.error('Start recording error:', err);
      setErrorMsg('Не удалось начать запись');
      setStage('error');
    }
  };

  const stopAndProcess = async () => {
    if (!recorder.isRecording) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setStage('processing');

    try {
      await recorder.stop();
      const uri = recorder.uri;

      if (!uri) {
        throw new Error('Файл записи не найден');
      }

      const data = await transcribeAudio(uri);
      setResult(data);
      setStage('done');
    } catch (err: any) {
      if (__DEV__) console.error('Processing error:', err);
      if (err instanceof LicenseRequiredError) {
        Alert.alert('Лицензия', 'Для голосовых заметок необходима активная лицензия.', [
          { text: 'Активировать', onPress: () => router.push('/activation' as any) },
          { text: 'Отмена', style: 'cancel' },
        ]);
        setStage('idle');
      } else if (err instanceof UltraRequiredError) {
        Alert.alert('Ultra', 'Расшифровка аудио доступна только с подпиской Ultra.', [
          { text: 'Понятно', style: 'cancel' },
        ]);
        setStage('idle');
      } else {
        setErrorMsg('Ошибка обработки аудио. Проверьте подключение к серверу.');
        setStage('error');
      }
    }
  };

  const saveAsNote = async () => {
    if (!result) return;

    const note: Note = {
      id: generateId(),
      title: result.title,
      content: result.content,
      tags: ['голосовая заметка'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveNote(note);
    router.replace(`/notes/${note.id}` as any);
  };

  const pickAudioFile = async () => {
    try {
      if (__DEV__) console.log('[pickAudioFile] Opening document picker...');
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (__DEV__) console.log('[pickAudioFile] Picker result:', JSON.stringify(pickerResult));

      if (pickerResult.canceled || !pickerResult.assets?.length) {
        if (__DEV__) console.log('[pickAudioFile] Picker cancelled or no assets');
        return;
      }

      const file = pickerResult.assets[0];
      const mimeType = file.mimeType || 'audio/mpeg';
      const fileName = file.name || 'audio.mp3';

      if (__DEV__) console.log('[pickAudioFile] Selected file:', { uri: file.uri, mimeType, fileName, size: file.size });
      setStage('processing');

      try {
        const data = await transcribeAudio(file.uri, mimeType, fileName);
        setResult(data);
        setStage('done');
      } catch (err: any) {
        if (__DEV__) console.error('[pickAudioFile] Transcribe error:', err);
        if (err instanceof LicenseRequiredError) {
          Alert.alert('Лицензия', 'Для голосовых заметок необходима активная лицензия.', [
            { text: 'Активировать', onPress: () => router.push('/activation' as any) },
            { text: 'Отмена', style: 'cancel' },
          ]);
          setStage('idle');
        } else if (err instanceof UltraRequiredError) {
          Alert.alert('Ultra', 'Расшифровка аудио доступна только с подпиской Ultra.', [
            { text: 'Понятно', style: 'cancel' },
          ]);
          setStage('idle');
        } else {
          setErrorMsg('Ошибка обработки аудио. Проверьте подключение к серверу.');
          setStage('error');
        }
      }
    } catch (err) {
      if (__DEV__) console.error('[pickAudioFile] Pick file error:', err);
      setErrorMsg('Не удалось выбрать файл');
      setStage('error');
    }
  };

  const resetState = () => {
    setStage('idle');
    setDuration(0);
    setErrorMsg('');
    setResult(null);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.screenBackground }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>← Назад</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Голосовая заметка</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.container}>
        {/* Idle state */}
        {stage === 'idle' && (
          <Animated.View entering={FadeIn.duration(400)} style={styles.centerBlock}>
            <AppIcon name="mic" size={64} color={c.accent} />
            <Text style={[styles.instruction, { color: c.textSecondary }]}>
              Нажмите кнопку для начала записи.{'\n'}Ваша речь будет расшифрована и превращена в структурированную заметку.
            </Text>
            <TouchableOpacity
              style={[styles.recordBtn, { backgroundColor: c.accent }]}
              onPress={startRecording}
              activeOpacity={0.7}
            >
              <Text style={styles.recordBtnText}>Начать запись</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.uploadBtn, { borderColor: c.border }]}
              onPress={pickAudioFile}
              activeOpacity={0.7}
            >
              <AppIcon name="folder" size={18} color={c.textSecondary} />
              <Text style={[styles.uploadBtnText, { color: c.textSecondary }]}>Загрузить аудиофайл</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Recording */}
        {stage === 'recording' && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.centerBlock}>
            <Animated.View style={[styles.pulseCircle, { backgroundColor: AppColors.error }, pulseStyle]}>
              <AppIcon name="mic" size={40} color="#FFFFFF" />
            </Animated.View>
            <Text style={[styles.timer, { color: c.textPrimary }]}>{formatTime(duration)}</Text>
            <Text style={[styles.recordingHint, { color: c.textSecondary }]}>Запись идёт...</Text>
            <TouchableOpacity
              style={[styles.stopBtn, { backgroundColor: c.cardBackground, borderColor: AppColors.error }]}
              onPress={stopAndProcess}
              activeOpacity={0.7}
            >
              <View style={styles.stopSquare} />
              <Text style={[styles.stopBtnText, { color: c.textPrimary }]}>Остановить</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Processing */}
        {stage === 'processing' && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.centerBlock}>
            <ActivityIndicator size="large" color={c.accent} />
            <Text style={[styles.processingText, { color: c.textPrimary }]}>Обработка аудио...</Text>
            <Text style={[styles.processingHint, { color: c.textSecondary }]}>
              Расшифровка речи и генерация заметки
            </Text>
          </Animated.View>
        )}

        {/* Done */}
        {stage === 'done' && result && (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.resultBlock}>
            <AppIcon name="success" size={40} color={c.success} />
            <Text style={[styles.resultTitle, { color: c.textPrimary }]}>{result.title}</Text>

            <View style={[styles.previewCard, { backgroundColor: c.cardBackground }]}>
              <Text style={[styles.previewLabel, { color: c.textMuted }]}>Содержание заметки</Text>
              <Text style={[styles.previewContent, { color: c.textPrimary }]} numberOfLines={8}>
                {result.content}
              </Text>
            </View>

            <View style={[styles.previewCard, { backgroundColor: c.cardBackground }]}>
              <Text style={[styles.previewLabel, { color: c.textMuted }]}>Транскрипция</Text>
              <Text style={[styles.previewTranscript, { color: c.textSecondary }]} numberOfLines={4}>
                {result.transcript}
              </Text>
            </View>

            <View style={styles.resultActions}>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: c.accent }]}
                onPress={saveAsNote}
                activeOpacity={0.7}
              >
                <Text style={styles.saveBtnText}>Сохранить заметку</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.retryBtn, { borderColor: c.border }]}
                onPress={resetState}
                activeOpacity={0.7}
              >
                <Text style={[styles.retryBtnText, { color: c.textSecondary }]}>Записать заново</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Error */}
        {stage === 'error' && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.centerBlock}>
            <AppIcon name="error" size={64} color={c.error} />
            <Text style={[styles.errorText, { color: c.textPrimary }]}>{errorMsg}</Text>
            <TouchableOpacity
              style={[styles.recordBtn, { backgroundColor: c.accent }]}
              onPress={resetState}
              activeOpacity={0.7}
            >
              <Text style={styles.recordBtnText}>Попробовать ещё раз</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 80,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  container: {
    flex: 1,
    padding: 24,
  },
  centerBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  instruction: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  recordBtn: {
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 16,
  },
  recordBtnText: {
    color: AppColors.textWhite,
    fontSize: 17,
    fontWeight: '700',
  },
  pulseCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  pulseIcon: {
    fontSize: 40,
  },
  timer: {
    fontSize: 48,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
    marginBottom: 8,
  },
  recordingHint: {
    fontSize: 15,
    marginBottom: 40,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 2,
  },
  stopSquare: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: AppColors.error,
  },
  stopBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  processingText: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
  },
  processingHint: {
    fontSize: 14,
  },
  resultBlock: {
    flex: 1,
    alignItems: 'center',
  },
  doneIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  previewCard: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...shadow({ offsetY: 1, opacity: 0.06, radius: 6, elevation: 2 }),
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  previewContent: {
    fontSize: 15,
    lineHeight: 22,
  },
  previewTranscript: {
    fontSize: 13,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  resultActions: {
    width: '100%',
    gap: 12,
    marginTop: 20,
  },
  saveBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: AppColors.textWhite,
    fontSize: 17,
    fontWeight: '700',
  },
  retryBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginTop: 16,
  },
  uploadIcon: {
    fontSize: 18,
  },
  uploadBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

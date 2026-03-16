import AppIcon from '@/components/ui/app-icon';
import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { activateLicense, ensureAuthenticated } from '@/lib/api';
import { shadow } from '@/lib/shadows';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const LICENSE_CACHE_KEY = 'noteai_license_status';

export default function ActivationScreen() {
  const router = useRouter();
  const c = useAppColors();
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  const formatKey = (text: string) => {
    const clean = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.length <= 6) return clean;

    const prefix = clean.slice(0, 6);
    const rest = clean.slice(6);
    const segments = rest.match(/.{1,4}/g) || [];
    return `${prefix}-${segments.join('-')}`;
  };

  const handleActivate = async () => {
    if (!key.trim()) return;
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await ensureAuthenticated();
      const result = await activateLicense(key.trim());
      setSuccess(result.message);
      if (result.license) {
        setDaysLeft(result.license.daysLeft);
        await AsyncStorage.setItem(
          LICENSE_CACHE_KEY,
          JSON.stringify({ active: true, expiresAt: result.license.expiresAt, checkedAt: new Date().toISOString() })
        );
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка активации');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.screenBackground }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <Animated.View entering={FadeInDown.duration(500)} style={styles.logoSection}>
            <AppIcon name="key" size={48} color={c.accent} />
            <Text style={[styles.title, { color: c.textPrimary }]}>Активация NoteAI</Text>
            <Text style={[styles.subtitle, { color: c.textSecondary }]}>
              Введите ключ активации для доступа к AI-функциям приложения
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(500).delay(200)} style={[styles.card, { backgroundColor: c.cardBackground }]}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Ключ активации</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: c.textPrimary,
                  backgroundColor: c.inputBackground,
                  borderColor: error ? c.error : c.border,
                },
              ]}
              placeholder="NOTEAI-XXXX-XXXX-XXXX-XXXX"
              placeholderTextColor={c.placeholder}
              value={key}
              onChangeText={(t) => {
                setKey(formatKey(t));
                setError('');
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={27}
              editable={!loading && !success}
            />

            {error ? (
              <Animated.View entering={FadeInDown.duration(300)}>
                <Text style={styles.errorText}>❌ {error}</Text>
              </Animated.View>
            ) : null}

            {success ? (
              <Animated.View entering={FadeInDown.duration(300)} style={[styles.successCard, { backgroundColor: c.cardBackgroundWarm }]}>
                <AppIcon name="success" size={28} color={c.success} />
                <Text style={[styles.successText, { color: c.textPrimary }]}>{success}</Text>
                {daysLeft !== null && (
                  <Text style={[styles.daysText, { color: c.textSecondary }]}>
                    Осталось дней: {daysLeft}
                  </Text>
                )}
              </Animated.View>
            ) : null}

            {!success ? (
              <TouchableOpacity
                style={[styles.activateBtn, { backgroundColor: c.accent }, loading && styles.btnDisabled]}
                onPress={handleActivate}
                disabled={loading || !key.trim()}
                activeOpacity={0.7}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.activateBtnText}>Активировать</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.activateBtn, { backgroundColor: c.accent }]}
                onPress={handleContinue}
                activeOpacity={0.7}
              >
                <Text style={styles.activateBtnText}>Продолжить →</Text>
              </TouchableOpacity>
            )}
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(500).delay(400)}>
            <TouchableOpacity onPress={handleContinue} style={styles.skipBtn}>
              <Text style={[styles.skipText, { color: c.textMuted }]}>Пропустить</Text>
            </TouchableOpacity>
            <Text style={[styles.hint, { color: c.textMuted }]}>
              Без ключа доступны заметки, календарь и список покупок.{'\n'}
              AI-чат и генерация заметок требуют активации.
            </Text>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    ...shadow({ offsetY: 2, opacity: 0.08, radius: 12, elevation: 4 }),
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1.5,
    textAlign: 'center',
    borderWidth: 2,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  errorText: {
    color: AppColors.error,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 12,
  },
  successCard: {
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  successIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  successText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  daysText: {
    fontSize: 14,
    marginTop: 4,
  },
  activateBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  activateBtnText: {
    color: AppColors.textWhite,
    fontSize: 17,
    fontWeight: '700',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '500',
  },
  hint: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
});

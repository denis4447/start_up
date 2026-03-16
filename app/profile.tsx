import AppIcon from '@/components/ui/app-icon';
import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { checkLicenseStatus, type LicenseStatus } from '@/lib/api';
import { shadow } from '@/lib/shadows';
import { getUserName, saveUserName } from '@/lib/storage';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const router = useRouter();
  const c = useAppColors();
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadLicense();
    }, [])
  );

  const loadProfile = async () => {
    const userName = await getUserName();
    setName(userName);
  };

  const loadLicense = async () => {
    setLicenseLoading(true);
    try {
      const status = await checkLicenseStatus();
      setLicense(status);
    } catch {
      setLicense(null);
    } finally {
      setLicenseLoading(false);
    }
  };

  const handleSaveName = async () => {
    await saveUserName(name.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleActivateKey = () => {
    router.push('/activation' as any);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.screenBackground }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backButton, { color: c.textPrimary }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Профиль</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(400)} style={styles.avatarSection}>
          <View style={[styles.avatarLarge, { backgroundColor: c.cardBackground }]}>
            <AppIcon name="user" size={36} color={c.textSecondary} />
          </View>
          <Text style={[styles.namePreview, { color: c.textPrimary }]}>
            {name.trim() || 'Пользователь'}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(100)}>
          <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>ЛИЧНЫЕ ДАННЫЕ</Text>
          <View style={[styles.card, { backgroundColor: c.cardBackground }]}>
            <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Имя</Text>
            <TextInput
              style={[styles.fieldInput, { color: c.textPrimary, borderBottomColor: c.border }]}
              placeholder="Введите ваше имя..."
              placeholderTextColor={c.placeholder}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: c.accent }]}
              onPress={handleSaveName}
            >
              <Text style={styles.saveButtonText}>{saved ? '✓ Сохранено' : 'Сохранить'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(200)}>
          <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>ПОДПИСКА</Text>
          <View style={[styles.card, { backgroundColor: c.cardBackground }]}>
            {licenseLoading ? (
              <ActivityIndicator size="small" color={c.accent} style={{ paddingVertical: 12 }} />
            ) : license?.active ? (
              <>
                <View style={styles.subscriptionStatus}>
                  <View style={[styles.statusDot, { backgroundColor: c.success }]} />
                  <Text style={[styles.statusText, { color: c.textPrimary }]}>Активна</Text>
                  <View style={[styles.tierBadge, { backgroundColor: license.tier === 'ultra' ? c.ultra : c.accent }]}>
                    <Text style={styles.tierBadgeText}>{(license.tier || 'pro').toUpperCase()}</Text>
                  </View>
                </View>
                {license.license && (
                  <>
                    <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Ключ</Text>
                    <Text style={[styles.licenseValue, { color: c.textSecondary }]}>{license.license.key}</Text>
                    <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 12 }]}>Тариф</Text>
                    <Text style={[styles.licenseValue, { color: license.tier === 'ultra' ? c.ultra : c.accent }]}>
                      {license.tier === 'ultra' ? 'Ultra — безлимит, GPT 5.2, голосовые заметки' : 'Pro — 100 запросов/день, GPT 5 Nano'}
                    </Text>
                    <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 12 }]}>Осталось дней</Text>
                    <Text style={[styles.licenseValue, { color: c.accent }]}>{license.license.daysLeft}</Text>
                  </>
                )}
              </>
            ) : (
              <>
                <View style={styles.subscriptionStatus}>
                  <View style={[styles.statusDot, { backgroundColor: c.error }]} />
                  <Text style={[styles.statusText, { color: c.textSecondary }]}>
                    {license?.expired ? 'Срок истёк' : 'Не активирована'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.activateButton, { backgroundColor: c.cardBackgroundWarm }]}
                  onPress={handleActivateKey}
                >
                  <Text style={[styles.activateButtonText, { color: c.accent }]}>Активировать</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(300)}>
          <View style={[styles.infoCard, { backgroundColor: c.cardBackground }]}>
            <AppIcon name="bulb" size={20} color={c.accent} />
            <Text style={[styles.infoText, { color: c.textSecondary }]}>
              Укажите ваше имя, чтобы AI-ассистент мог обращаться к вам персонально.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
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
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: AppColors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    ...shadow({ offsetY: 2, opacity: 0.08, radius: 8, elevation: 4 }),
  },
  avatarEmoji: {
    fontSize: 36,
  },
  namePreview: {
    fontSize: 22,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.textSecondary,
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: AppColors.cardBackground,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    ...shadow({ offsetY: 2, opacity: 0.06, radius: 8, elevation: 3 }),
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.textMuted,
    marginBottom: 6,
  },
  fieldInput: {
    fontSize: 16,
    color: AppColors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
    paddingVertical: 10,
    marginBottom: 16,
  },
  saveButton: {
    alignSelf: 'flex-end',
    backgroundColor: AppColors.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  saveButtonText: {
    color: AppColors.textWhite,
    fontWeight: '600',
    fontSize: 14,
  },
  subscriptionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  licenseValue: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 4,
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  tierBadgeText: {
    color: AppColors.textWhite,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activateButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  activateButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: AppColors.cardBackground,
    borderRadius: 16,
    padding: 16,
  },
  infoIcon: {
    fontSize: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: AppColors.textSecondary,
  },
});

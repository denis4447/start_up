import AppIcon, { type AppIconName } from '@/components/ui/app-icon';
import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { shadow } from '@/lib/shadows';
import { getUserCity, saveUserCity } from '@/lib/storage';
import { useAppTheme } from '@/lib/theme-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState(true);
  const [city, setCity] = useState('Москва');
  const [showCityModal, setShowCityModal] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<{ name: string; country: string; admin1?: string }[]>([]);
  const [searchingCity, setSearchingCity] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isDark, toggleDarkMode } = useAppTheme();
  const c = useAppColors();
  const darkModeRef = useRef<View>(null);

  useFocusEffect(
    useCallback(() => {
      getUserCity().then(setCity);
    }, [])
  );

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    const q = cityInput.trim();
    if (q.length < 2) {
      setCitySuggestions([]);
      return;
    }
    setSearchingCity(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=ru`
        );
        if (res.ok) {
          const data = await res.json();
          setCitySuggestions(
            (data.results || []).map((r: any) => ({
              name: r.name,
              country: r.country || '',
              admin1: r.admin1 || '',
            }))
          );
        }
      } catch {
        setCitySuggestions([]);
      } finally {
        setSearchingCity(false);
      }
    }, 400);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [cityInput]);

  const handleSelectCity = async (name: string) => {
    await saveUserCity(name);
    setCity(name);
    setCityInput('');
    setCitySuggestions([]);
    setShowCityModal(false);
  };

  const handleDarkModeToggle = () => {
    darkModeRef.current?.measureInWindow((px, py, w, h) => {
      toggleDarkMode(px + w / 2, py + h / 2);
    });
  };

  const crossPlatformConfirm = async (title: string, message: string): Promise<boolean> => {
    if (Platform.OS === 'web') {
      return window.confirm(message);
    }
    return new Promise<boolean>((resolve) => {
      const { Alert } = require('react-native');
      Alert.alert(title, message, [
        { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
        { text: 'ОК', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

  const crossPlatformAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(message);
    } else {
      const { Alert } = require('react-native');
      Alert.alert(title, message);
    }
  };

  const clearChatHistory = async () => {
    const ok = await crossPlatformConfirm('Очистить чат', 'История чата будет удалена. Продолжить?');
    if (ok) {
      await AsyncStorage.removeItem('noteai_chat_history');
      crossPlatformAlert('Готово', 'История чата очищена.');
    }
  };

  const clearNotes = async () => {
    const ok = await crossPlatformConfirm('Удалить заметки', 'Все заметки будут удалены. Продолжить?');
    if (ok) {
      await AsyncStorage.removeItem('noteai_notes');
      crossPlatformAlert('Готово', 'Все заметки удалены.');
    }
  };

  const clearShoppingList = async () => {
    const ok = await crossPlatformConfirm('Очистить список', 'Список покупок будет удалён. Продолжить?');
    if (ok) {
      await AsyncStorage.removeItem('noteai_shopping_list');
      crossPlatformAlert('Готово', 'Список покупок очищен.');
    }
  };

  const clearAllData = async () => {
    const ok = await crossPlatformConfirm('Сбросить всё', 'Все данные приложения будут удалены безвозвратно. Продолжить?');
    if (ok) {
      await AsyncStorage.clear();
      crossPlatformAlert('Готово', 'Все данные удалены.');
    }
  };

  const showAbout = () => {
    crossPlatformAlert(
      'О приложении',
      'NoteAI — ваш персональный AI-ассистент.\n\nВерсия: 1.0.0\nМодель: GPT-5 Nano\nAPI: AI Tunnel\n\n© 2026 NoteAI'
    );
  };

  type SettingsItem = {
    icon: AppIconName;
    title: string;
    onPress?: () => void;
    toggle?: boolean;
    toggleValue?: boolean;
    onToggle?: (val: boolean) => void;
    destructive?: boolean;
    switchRef?: React.RefObject<View | null>;
  };

  const GENERAL_ITEMS: SettingsItem[] = [
    { icon: 'user', title: 'Профиль', onPress: () => router.push('/profile' as Href) },
    { icon: 'key', title: 'Лицензия', onPress: () => router.push('/activation' as Href) },
    { icon: 'city', title: `Город: ${city}`, onPress: () => { setCityInput(city); setShowCityModal(true); } },
    {
      icon: 'bell',
      title: 'Уведомления',
      toggle: true,
      toggleValue: notifications,
      onToggle: setNotifications,
    },
    {
      icon: 'moon',
      title: 'Тёмная тема',
      toggle: true,
      toggleValue: isDark,
      onToggle: handleDarkModeToggle,
      switchRef: darkModeRef,
    },
  ];

  const DATA_ITEMS: SettingsItem[] = [
    { icon: 'chat', title: 'Очистить историю чата', onPress: clearChatHistory },
    { icon: 'note', title: 'Удалить все заметки', onPress: clearNotes },
    { icon: 'cart', title: 'Очистить список покупок', onPress: clearShoppingList },
  ];

  const OTHER_ITEMS: SettingsItem[] = [
    { icon: 'info', title: 'О приложении', onPress: showAbout },
    { icon: 'trash', title: 'Сбросить все данные', onPress: clearAllData, destructive: true },
  ];

  const renderSection = (title: string, items: SettingsItem[], delay: number) => (
    <Animated.View entering={FadeInDown.duration(500).delay(delay)}>
      <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: c.cardBackground }]}>
        {items.map((item, index) => (
          <TouchableOpacity
            key={`${item.title}-${index}`}
            style={[
              styles.settingsItem,
              index < items.length - 1 && [styles.settingsItemBorder, { borderBottomColor: c.border }],
            ]}
            onPress={item.toggle ? undefined : item.onPress}
            activeOpacity={item.toggle ? 1 : 0.6}
          >
            <View style={styles.itemLeft}>
              <View style={[styles.iconContainer, { backgroundColor: c.cardBackgroundWarm }]}>
                <AppIcon name={item.icon} size={16} color={c.accent} />
              </View>
              <Text style={[styles.itemTitle, { color: c.textPrimary }, item.destructive && styles.itemTitleDestructive]}>
                {item.title}
              </Text>
            </View>
            {item.toggle ? (
              <View ref={item.switchRef as any} collapsable={false}>
                <Switch
                  value={item.toggleValue}
                  onValueChange={item.onToggle}
                  trackColor={{ false: c.border, true: c.accent }}
                  thumbColor="#fff"
                />
              </View>
            ) : (
              <Text style={[styles.chevron, { color: c.textMuted }]}>›</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.screenBackground }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Настройки</Text>
        <TouchableOpacity style={[styles.avatarSmall, { backgroundColor: c.cardBackground }]} onPress={() => router.push('/profile' as Href)}>
          <AppIcon name="user" size={20} color={c.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* City Modal */}
      <Modal visible={showCityModal} animationType="fade" transparent>
        <View style={styles.cityModalOverlay}>
          <View style={[styles.cityModalContent, { backgroundColor: c.cardBackground }]}>
            <Text style={[styles.cityModalTitle, { color: c.textPrimary }]}>Выбор города</Text>
            <TextInput
              style={[styles.cityInput, { backgroundColor: c.screenBackground, color: c.textPrimary, borderColor: c.border }]}
              value={cityInput}
              onChangeText={setCityInput}
              placeholder="Начните вводить название..."
              placeholderTextColor={c.textMuted}
              autoFocus
            />
            {searchingCity && (
              <Text style={[styles.citySearchHint, { color: c.textMuted }]}>Поиск...</Text>
            )}
            {citySuggestions.length > 0 && (
              <FlatList
                data={citySuggestions}
                keyExtractor={(item, i) => `${item.name}-${item.country}-${i}`}
                style={styles.citySuggestionsList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.citySuggestionItem, { borderBottomColor: c.border }]}
                    onPress={() => handleSelectCity(item.name)}
                  >
                    <Text style={[styles.citySuggestionName, { color: c.textPrimary }]}>{item.name}</Text>
                    <Text style={[styles.citySuggestionCountry, { color: c.textMuted }]}>
                      {[item.admin1, item.country].filter(Boolean).join(', ')}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
            {cityInput.trim().length >= 2 && !searchingCity && citySuggestions.length === 0 && (
              <Text style={[styles.citySearchHint, { color: c.textMuted }]}>Город не найден</Text>
            )}
            <TouchableOpacity
              onPress={() => { setCityInput(''); setCitySuggestions([]); setShowCityModal(false); }}
              style={[styles.cityModalCancelBtn, { backgroundColor: c.screenBackground }]}
            >
              <Text style={[styles.cityModalBtnText, { color: c.textSecondary }]}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {renderSection('Основные', GENERAL_ITEMS, 0)}
        {renderSection('Данные', DATA_ITEMS, 150)}
        {renderSection('Прочее', OTHER_ITEMS, 300)}

        <Animated.View entering={FadeInDown.duration(500).delay(400)} style={styles.versionContainer}>
          <Text style={[styles.versionText, { color: c.textMuted }]}>NoteAI v1.0.0</Text>
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
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.textSecondary,
    marginBottom: 8,
    marginTop: 16,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  card: {
    backgroundColor: AppColors.cardBackground,
    borderRadius: 20,
    overflow: 'hidden',
    ...shadow({ offsetY: 2, opacity: 0.06, radius: 8, elevation: 3 }),
  },
  settingsItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  settingsItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: AppColors.cardBackgroundWarm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemIcon: {
    fontSize: 16,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: AppColors.textPrimary,
  },
  itemTitleDestructive: {
    color: AppColors.error,
  },
  chevron: {
    fontSize: 22,
    color: AppColors.textMuted,
    fontWeight: '300',
  },
  versionContainer: {
    alignItems: 'center',
    marginTop: 30,
  },
  versionText: {
    fontSize: 13,
    color: AppColors.textMuted,
  },
  cityModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 30,
  },
  cityModalContent: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 24,
  },
  cityModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  cityInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  citySearchHint: {
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 12,
  },
  citySuggestionsList: {
    maxHeight: 220,
    marginBottom: 12,
  },
  citySuggestionItem: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  citySuggestionName: {
    fontSize: 16,
    fontWeight: '500',
  },
  citySuggestionCountry: {
    fontSize: 13,
    marginTop: 2,
  },
  cityModalCancelBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  cityModalBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

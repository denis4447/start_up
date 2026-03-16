import AppIcon, { type AppIconName } from '@/components/ui/app-icon';
import { AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { getEvents, getUserCity, type CalendarEvent } from '@/lib/storage';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

const WMO_DESCRIPTIONS: Record<number, { icon: AppIconName; label: string }> = {
  0: { icon: 'weather-clear', label: 'Ясно' },
  1: { icon: 'weather-partly-cloudy', label: 'Малооблачно' },
  2: { icon: 'weather-cloudy-sun', label: 'Переменная облачность' },
  3: { icon: 'weather-cloudy', label: 'Облачно' },
  45: { icon: 'weather-fog', label: 'Туман' },
  48: { icon: 'weather-fog', label: 'Изморозь' },
  51: { icon: 'weather-drizzle', label: 'Лёгкая морось' },
  53: { icon: 'weather-drizzle', label: 'Морось' },
  55: { icon: 'weather-rain', label: 'Сильная морось' },
  61: { icon: 'weather-rain', label: 'Небольшой дождь' },
  63: { icon: 'weather-rain', label: 'Дождь' },
  65: { icon: 'weather-rain', label: 'Сильный дождь' },
  71: { icon: 'weather-snow', label: 'Небольшой снег' },
  73: { icon: 'weather-snow', label: 'Снег' },
  75: { icon: 'weather-snow', label: 'Сильный снег' },
  77: { icon: 'weather-snow-heavy', label: 'Снежная крупа' },
  80: { icon: 'weather-drizzle', label: 'Ливень' },
  81: { icon: 'weather-rain', label: 'Сильный ливень' },
  82: { icon: 'weather-rain', label: 'Очень сильный ливень' },
  85: { icon: 'weather-snow-heavy', label: 'Снегопад' },
  86: { icon: 'weather-snow-heavy', label: 'Сильный снегопад' },
  95: { icon: 'weather-thunder', label: 'Гроза' },
  96: { icon: 'weather-thunder', label: 'Гроза с градом' },
  99: { icon: 'weather-thunder', label: 'Сильная гроза' },
};

type WeatherData = {
  temp: number;
  code: number;
};

export type WeatherWidgetRef = { refresh: () => Promise<void> };

const WeatherWidget = forwardRef<WeatherWidgetRef>(function WeatherWidget(_props, ref) {
  const c = useAppColors();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);
  const [cityName, setCityName] = useState('Москва');

  const today = new Date();
  const dateString = today.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  useFocusEffect(
    useCallback(() => {
      loadWeatherForCity();
      loadNextEvent();
    }, [])
  );

  const loadWeatherForCity = async () => {
    const city = await getUserCity();
    setCityName(city);
    await fetchWeather(city);
  };

  const loadNextEvent = async () => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const events = await getEvents();
    if (events.length > 0) {
      const upcoming = events.filter((e) => e.date >= todayStr);
      upcoming.sort((a, b) => a.date.localeCompare(b.date));
      setNextEvent(upcoming[0] || null);
    } else {
      setNextEvent(null);
    }
  };

  const fetchWeather = async (city: string) => {
    setLoading(true);
    try {
      // Geocode city name to coordinates
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru`
      );
      let lat = 55.7558;
      let lon = 37.6173;
      let tz = 'Europe/Moscow';
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          lat = geoData.results[0].latitude;
          lon = geoData.results[0].longitude;
          tz = geoData.results[0].timezone || 'auto';
        }
      }

      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=${encodeURIComponent(tz)}`
      );
      if (res.ok) {
        const data = await res.json();
        setWeather({
          temp: Math.round(data.current.temperature_2m),
          code: data.current.weather_code,
        });
      }
    } catch {
      // fallback handled below
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: async () => {
      await Promise.all([loadWeatherForCity(), loadNextEvent()]);
    },
  }));

  const wmo = weather ? (WMO_DESCRIPTIONS[weather.code] || WMO_DESCRIPTIONS[0]) : WMO_DESCRIPTIONS[0];
  const temp = weather ? `${weather.temp}°C` : '--°C';
  const desc = weather ? `${cityName}, ${wmo.label}` : cityName;
  const icon = wmo.icon;

  return (
    <Animated.View entering={FadeInDown.duration(600).delay(100)}>
      <LinearGradient
        colors={[c.weatherGradientStart, c.weatherGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <View style={styles.topRow}>
          <View>
            <Text style={[styles.todayText, { color: c.textPrimary }]}>Сегодня</Text>
            <Text style={[styles.dateText, { color: c.textSecondary }]}>{dateString}</Text>
          </View>
          <View style={styles.weatherInfo}>
            {loading ? (
              <ActivityIndicator color={c.textPrimary} />
            ) : (
              <>
                <AppIcon name={icon} size={28} color={c.textPrimary} />
                <View>
                  <Text style={[styles.tempText, { color: c.textPrimary }]}>{temp}</Text>
                  <Text style={[styles.weatherLabel, { color: c.textSecondary }]}>{desc}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {nextEvent ? (
          <View style={[styles.reminderContainer, { backgroundColor: c.reminderBackground }]}>
            <View style={[styles.reminderIcon, { backgroundColor: c.cardBackground }]}>
              <AppIcon name="pin" size={18} color={c.accent} />
            </View>
            <View>
              <Text style={[styles.reminderLabel, { color: c.textSecondary }]}>Ближайшее событие</Text>
              <Text style={[styles.reminderText, { color: c.textPrimary }]}>
                {nextEvent.title}{nextEvent.time ? ` — ${nextEvent.time}` : ''}
              </Text>
            </View>
          </View>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
});

export default WeatherWidget;

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  todayText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  dateText: {
    fontSize: 14,
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  weatherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weatherIcon: {
    fontSize: 28,
  },
  tempText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: AppColors.textPrimary,
  },
  weatherLabel: {
    fontSize: 12,
    color: AppColors.textSecondary,
  },
  reminderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.reminderBackground,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  reminderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: AppColors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinIcon: {
    fontSize: 18,
  },
  reminderLabel: {
    fontSize: 12,
    color: AppColors.textSecondary,
  },
  reminderText: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.textPrimary,
  },
});

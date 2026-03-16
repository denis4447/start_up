/**
 * AppIcon — централизованный Icon Engine для замены стандартных эмодзи
 * на кастомные SVG-иконки.
 *
 * Использование:
 *   <AppIcon name="search" size={24} color="#8B7355" />
 *
 * Все SVG ниже — заглушки (Placeholder). Замените содержимое каждой
 * функции-иконки на свой SVG path, сохраняя props (w, h, fillColor).
 *
 * Расширение: добавьте запись в ICON_REGISTRY и имя в AppIconName.
 */

import React, { memo } from 'react';
import { PixelRatio, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import * as IP from './icon-paths';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Все доступные имена иконок.
 * Добавляйте новые имена сюда при расширении набора.
 */
export type AppIconName =
  // Navigation & UI
  | 'search'
  | 'user'
  | 'mic'
  | 'pencil'
  | 'wave'
  | 'sparkle'
  | 'lock'
  | 'unlock'
  | 'clipboard'
  | 'check'
  | 'chat'
  | 'cart'
  | 'pin'
  | 'export'
  | 'hourglass'
  | 'key'
  | 'city'
  | 'bell'
  | 'moon'
  | 'note'
  | 'info'
  | 'trash'
  | 'bulb'
  | 'calendar'
  | 'clock'
  | 'folder'
  | 'error'
  | 'success'
  | 'retry'
  | 'plug'
  | 'warning'
  | 'friendly'
  | 'business'
  | 'email'
  | 'phone'
  | 'arrow'
  | 'ai-pencil'
  // Weather
  | 'weather-clear'
  | 'weather-partly-cloudy'
  | 'weather-cloudy-sun'
  | 'weather-cloudy'
  | 'weather-fog'
  | 'weather-drizzle'
  | 'weather-rain'
  | 'weather-snow'
  | 'weather-snow-heavy'
  | 'weather-thunder';

export type AppIconProps = {
  /** Имя иконки из реестра */
  name: AppIconName;
  /**
   * Размер иконки в логических пикселях.
   * Автоматически масштабируется под DPI экрана.
   * @pixel-size: Управляет width и height контейнера SVG.
   * @default 24
   */
  size?: number;
  /**
   * Цвет заливки для монохромных иконок.
   * @default '#8B7355'
   */
  color?: string;
  /**
   * Дополнительные стили контейнера (margin, padding и т.д.).
   * @pixel-offset: Используйте для компенсации визуального веса иконки.
   */
  style?: StyleProp<ViewStyle>;
};

// ---------------------------------------------------------------------------
// Scale Logic
// ---------------------------------------------------------------------------

/**
 * Вычисляет итоговый размер иконки с учётом DPI и fontScale.
 *
 * iOS Retina (2x/3x) и Android xxhdpi/xxxhdpi рендерят SVG
 * нативно через `react-native-svg`, поэтому масштабирование
 * сводится к учёту пользовательского fontScale.
 *
 * @pixel-size: Результат — логические пиксели для width/height.
 */
function getScaledSize(baseSize: number): number {
  const fontScale = PixelRatio.getFontScale();
  // Ограничиваем fontScale в [0.8, 1.4] для предсказуемости
  const clampedScale = Math.min(Math.max(fontScale, 0.8), 1.4);
  return Math.floor(baseSize * clampedScale);
}

// ---------------------------------------------------------------------------
// SVG Icon Components (Placeholders)
// ---------------------------------------------------------------------------
//
// Каждая функция-иконка получает:
//   w     — ширина SVG в логических пикселях
//   h     — высота SVG в логических пикселях
//   color — цвет заливки
//
// Замените содержимое на свой <Path d="..." />, сохраняя сигнатуру.
//
// @pixel-viewbox: viewBox="0 0 24 24" — стандартная сетка 24×24.
//                 Все path-данные должны быть нарисованы в этой сетке.
//                 SVG автоматически масштабируется через width/height.
//
// @pixel-offset:  Если иконка визуально «тяжелее» соседних, добавьте
//                 padding через prop style={{ padding: N }}.

type IconRenderer = (w: number, h: number, color: string) => React.JSX.Element;

// --- Navigation & UI ---

const SearchIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 307 310 — custom: search.svg (лупа с бликом)
  // @pixel-size: w × h (логические пиксели)
  // @pixel-offset: нет (визуально сбалансирована)
  <Svg width={w} height={h} viewBox={IP.SEARCH_VIEWBOX} fill="none">
    <Circle cx={112.5} cy={112.5} r={97} stroke={color} strokeWidth={31} />
    <Path d={IP.SEARCH_PATH_0} fill={color} fillRule="evenodd" clipRule="evenodd" />
    <Path d={IP.SEARCH_PATH_1} fill={color} />
  </Svg>
);

const UserIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 511 582 — custom: profile.svg (художественный росчерк)
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox={IP.PROFILE_VIEWBOX} fill="none">
    {/* @pixel-offset: strokeWidth масштабируется от viewBox 511×582 → ≈4.5px при size=48 */}
    <Path d={IP.PROFILE_PATH} stroke={color} strokeWidth={68} strokeMiterlimit={1} strokeLinecap="square" />
  </Svg>
);

const MicIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 517 402 — custom: audio.svg (аудиоволна)
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox={IP.AUDIO_VIEWBOX} fill="none">
    <Path d={IP.AUDIO_PATH} fill={color} />
  </Svg>
);

const PencilIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 553 362 — custom: Notes.svg (рукописный карандаш)
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox={IP.NOTES_VIEWBOX} fill="none">
    <Path d={IP.NOTES_PATH} fill={color} />
  </Svg>
);

const WaveIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: padding: 1 (визуально крупная)
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M7 11.5V7a2 2 0 114 0v4.5M11 9.5V5a2 2 0 114 0v6M15 9.5V7a2 2 0 114 0v5.5a8 8 0 01-8 8h-1a8 8 0 01-6.36-3.15" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M7 11.5a2 2 0 10-4 0v1.5a8 8 0 001.2 4.2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SparkleIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" fill={color} />
    <Path d="M19 15l.88 2.63L22.5 18.5l-2.62.87L19 22l-.88-2.63L15.5 18.5l2.62-.87L19 15z" fill={color} />
  </Svg>
);

const LockIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Rect x={5} y={11} width={14} height={10} rx={2} stroke={color} strokeWidth={2} />
    <Path d="M8 11V7a4 4 0 018 0v4" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Circle cx={12} cy={16} r={1.5} fill={color} />
  </Svg>
);

const UnlockIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Rect x={5} y={11} width={14} height={10} rx={2} stroke={color} strokeWidth={2} />
    <Path d="M8 11V7a4 4 0 017.874-.935" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Circle cx={12} cy={16} r={1.5} fill={color} />
  </Svg>
);

const ClipboardIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Rect x={9} y={3} width={6} height={4} rx={1} stroke={color} strokeWidth={2} />
  </Svg>
);

const CheckIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M5 13l4 4L19 7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ChatIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 269 267 — custom: chat_icon.svg (пузырь с точками)
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox={IP.CHAT_ICON_VIEWBOX} fill="none">
    <Path d={IP.CHAT_ICON_PATH} stroke={color} strokeWidth={20} />
    <Circle cx={91.003} cy={115.5} r={10.5} fill={color} />
    <Circle cx={135.003} cy={115.5} r={10.5} fill={color} />
    <Circle cx={179.003} cy={115.5} r={10.5} fill={color} />
  </Svg>
);

const CartIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 409 270 — custom: cart.svg (сумка для покупок)
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox={IP.CART_VIEWBOX} fill="none">
    <Path d={IP.CART_PATH} fill={color} />
  </Svg>
);

const PinIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke={color} strokeWidth={2} />
    <Circle cx={12} cy={9} r={2.5} fill={color} />
  </Svg>
);

const ExportIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3v12M12 3l4 4M12 3L8 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const HourglassIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M6 2h12M6 22h12M7 2v4a5 5 0 005 5 5 5 0 005-5V2M7 22v-4a5 5 0 015-5 5 5 0 015 5v4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const KeyIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Circle cx={8} cy={15} r={5} stroke={color} strokeWidth={2} />
    <Path d="M12 11l7-7M15.5 7.5L18 10M19 4l2 2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const CityIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M3 21h18M5 21V7l7-4v18M12 21V9l7 4v8" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1={8} y1={10} x2={8} y2={10.01} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={8} y1={14} x2={8} y2={14.01} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={16} y1={14} x2={16} y2={14.01} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={16} y1={18} x2={16} y2={18.01} stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const BellIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M13.73 21a2 2 0 01-3.46 0" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const MoonIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const NoteIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const InfoIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} />
    <Line x1={12} y1={16} x2={12} y2={12} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Circle cx={12} cy={8} r={0.5} fill={color} stroke={color} strokeWidth={1} />
  </Svg>
);

const TrashIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const BulbIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M9 21h6M12 3a6 6 0 00-4 10.472V17a1 1 0 001 1h6a1 1 0 001-1v-3.528A6 6 0 0012 3z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const CalendarIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={4} width={18} height={18} rx={2} stroke={color} strokeWidth={2} />
    <Line x1={16} y1={2} x2={16} y2={6} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={8} y1={2} x2={8} y2={6} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={3} y1={10} x2={21} y2={10} stroke={color} strokeWidth={2} />
  </Svg>
);

const ClockIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} />
    <Path d="M12 6v6l4 2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const FolderIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const ErrorIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} />
    <Line x1={15} y1={9} x2={9} y2={15} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={9} y1={9} x2={15} y2={15} stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const SuccessIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} />
    <Path d="M8 12l3 3 5-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const RetryIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M1 4v6h6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M3.51 15a9 9 0 105.64-11.36L1 10" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const PlugIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M12 22v-5M7 17h10M9 9V2M15 9V2M5 9h14v4a7 7 0 01-7 7v0a7 7 0 01-7-7V9z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const WarningIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Line x1={12} y1={9} x2={12} y2={13} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Circle cx={12} cy={17} r={0.5} fill={color} stroke={color} strokeWidth={1} />
  </Svg>
);

const FriendlyIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24 — смайлик
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} />
    <Path d="M8 14s1.5 2 4 2 4-2 4-2" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Circle cx={9} cy={9.5} r={1} fill={color} />
    <Circle cx={15} cy={9.5} r={1} fill={color} />
  </Svg>
);

const BusinessIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24 — портфель
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Rect x={2} y={7} width={20} height={14} rx={2} stroke={color} strokeWidth={2} />
    <Path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={2} y1={13} x2={22} y2={13} stroke={color} strokeWidth={2} />
  </Svg>
);

const EmailIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Rect x={2} y={4} width={20} height={16} rx={2} stroke={color} strokeWidth={2} />
    <Path d="M22 6l-10 7L2 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const PhoneIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24 — мобильный
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Rect x={5} y={2} width={14} height={20} rx={2} stroke={color} strokeWidth={2} />
    <Line x1={12} y1={18} x2={12} y2={18.01} stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const ArrowIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 331 276 — custom: arrow.svg (стрелка вправо)
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox={IP.ARROW_VIEWBOX} fill="none">
    <Path d={IP.ARROW_PATH} stroke={color} strokeWidth={34} strokeMiterlimit={1} strokeLinecap="square" strokeLinejoin="round" />
  </Svg>
);

const AiPencilIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 452 464 — custom: ai_notes.svg (блокнот с карандашом)
  // @pixel-size: w × h
  // @pixel-offset: нет
  <Svg width={w} height={h} viewBox={IP.AI_NOTES_VIEWBOX} fill="none">
    <Path d={IP.AI_NOTES_PATH_0} fill={color} />
    <Path d={IP.AI_NOTES_PATH_1} stroke={color} strokeWidth={25} strokeMiterlimit={16} strokeLinecap="round" />
  </Svg>
);

// --- Weather ---

const WeatherClearIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24 — солнце
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={5} stroke={color} strokeWidth={2} />
    <Line x1={12} y1={1} x2={12} y2={3} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={12} y1={21} x2={12} y2={23} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={4.22} y1={4.22} x2={5.64} y2={5.64} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={18.36} y1={18.36} x2={19.78} y2={19.78} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={1} y1={12} x2={3} y2={12} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={21} y1={12} x2={23} y2={12} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={4.22} y1={19.78} x2={5.64} y2={18.36} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={18.36} y1={5.64} x2={19.78} y2={4.22} stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const WeatherPartlyCloudyIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Circle cx={14} cy={8} r={4} stroke={color} strokeWidth={2} />
    <Path d="M6 19a4 4 0 01-.68-7.95A5 5 0 0115.9 12h.59A3.5 3.5 0 0117 19H6z" stroke={color} strokeWidth={2} />
  </Svg>
);

const WeatherCloudySunIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Circle cx={15} cy={7} r={3} stroke={color} strokeWidth={2} />
    <Path d="M5 19a4 4 0 01-.68-7.95A5 5 0 0115.9 12h.59A3.5 3.5 0 0117 19H5z" stroke={color} strokeWidth={2} />
  </Svg>
);

const WeatherCloudyIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M6 19a4 4 0 01-.68-7.95A5 5 0 0115.9 12h.59A3.5 3.5 0 0117 19H6z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const WeatherFogIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M6 15a4 4 0 01-.68-7.95A5 5 0 0115.9 8h.59A3.5 3.5 0 0117 15H6z" stroke={color} strokeWidth={2} />
    <Line x1={3} y1={19} x2={21} y2={19} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={5} y1={22} x2={19} y2={22} stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const WeatherDrizzleIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M6 14a4 4 0 01-.68-7.95A5 5 0 0115.9 7h.59A3.5 3.5 0 0117 14H6z" stroke={color} strokeWidth={2} />
    <Line x1={8} y1={17} x2={8} y2={19} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={12} y1={17} x2={12} y2={19} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={16} y1={17} x2={16} y2={19} stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const WeatherRainIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M6 13a4 4 0 01-.68-7.95A5 5 0 0115.9 6h.59A3.5 3.5 0 0117 13H6z" stroke={color} strokeWidth={2} />
    <Line x1={7} y1={16} x2={6} y2={20} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={12} y1={16} x2={11} y2={22} stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Line x1={17} y1={16} x2={16} y2={20} stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const WeatherSnowIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M6 14a4 4 0 01-.68-7.95A5 5 0 0115.9 7h.59A3.5 3.5 0 0117 14H6z" stroke={color} strokeWidth={2} />
    <Circle cx={8} cy={18} r={1} fill={color} />
    <Circle cx={12} cy={20} r={1} fill={color} />
    <Circle cx={16} cy={18} r={1} fill={color} />
  </Svg>
);

const WeatherSnowHeavyIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M6 13a4 4 0 01-.68-7.95A5 5 0 0115.9 6h.59A3.5 3.5 0 0117 13H6z" stroke={color} strokeWidth={2} />
    <Circle cx={7} cy={16.5} r={1} fill={color} />
    <Circle cx={11} cy={18.5} r={1} fill={color} />
    <Circle cx={15} cy={16.5} r={1} fill={color} />
    <Circle cx={9} cy={21} r={1} fill={color} />
    <Circle cx={13} cy={21} r={1} fill={color} />
  </Svg>
);

const WeatherThunderIcon: IconRenderer = (w, h, color) => (
  // @pixel-viewbox: 0 0 24 24
  <Svg width={w} height={h} viewBox="0 0 24 24" fill="none">
    <Path d="M6 13a4 4 0 01-.68-7.95A5 5 0 0115.9 6h.59A3.5 3.5 0 0117 13H6z" stroke={color} strokeWidth={2} />
    <Path d="M13 16l-3 5h4l-2 4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ---------------------------------------------------------------------------
// Icon Registry
// ---------------------------------------------------------------------------

const ICON_REGISTRY: Record<AppIconName, IconRenderer> = {
  // Navigation & UI
  search: SearchIcon,
  user: UserIcon,
  mic: MicIcon,
  pencil: PencilIcon,
  wave: WaveIcon,
  sparkle: SparkleIcon,
  lock: LockIcon,
  unlock: UnlockIcon,
  clipboard: ClipboardIcon,
  check: CheckIcon,
  chat: ChatIcon,
  cart: CartIcon,
  pin: PinIcon,
  export: ExportIcon,
  hourglass: HourglassIcon,
  key: KeyIcon,
  city: CityIcon,
  bell: BellIcon,
  moon: MoonIcon,
  note: NoteIcon,
  info: InfoIcon,
  trash: TrashIcon,
  bulb: BulbIcon,
  calendar: CalendarIcon,
  clock: ClockIcon,
  folder: FolderIcon,
  error: ErrorIcon,
  success: SuccessIcon,
  retry: RetryIcon,
  plug: PlugIcon,
  warning: WarningIcon,
  friendly: FriendlyIcon,
  business: BusinessIcon,
  email: EmailIcon,
  phone: PhoneIcon,
  arrow: ArrowIcon,
  'ai-pencil': AiPencilIcon,
  // Weather
  'weather-clear': WeatherClearIcon,
  'weather-partly-cloudy': WeatherPartlyCloudyIcon,
  'weather-cloudy-sun': WeatherCloudySunIcon,
  'weather-cloudy': WeatherCloudyIcon,
  'weather-fog': WeatherFogIcon,
  'weather-drizzle': WeatherDrizzleIcon,
  'weather-rain': WeatherRainIcon,
  'weather-snow': WeatherSnowIcon,
  'weather-snow-heavy': WeatherSnowHeavyIcon,
  'weather-thunder': WeatherThunderIcon,
};

// ---------------------------------------------------------------------------
// AppIcon Component
// ---------------------------------------------------------------------------

/**
 * Универсальный компонент иконки. Рендерит SVG из реестра ICON_REGISTRY.
 *
 * @example
 * ```tsx
 * <AppIcon name="search" size={20} color="#8B7355" />
 * <AppIcon name="weather-clear" size={28} />
 * <AppIcon name="lock" size={14} color={c.textMuted} style={{ marginLeft: 6 }} />
 * ```
 *
 * @pixel-size:    Итоговый размер = size * fontScale (clamp 0.8–1.4)
 * @pixel-offset:  Передавайте через prop `style` для точного позиционирования
 * @pixel-viewbox: Все иконки используют viewBox="0 0 24 24"
 */
function AppIconInner({ name, size = 24, color = '#8B7355', style }: AppIconProps) {
  const renderer = ICON_REGISTRY[name];
  const scaledSize = getScaledSize(size);

  const svgElement = renderer(scaledSize, scaledSize, color);

  if (style) {
    return (
      <Animated.View style={style}>
        {svgElement}
      </Animated.View>
    );
  }

  return svgElement;
}

// Prevent re-renders: нет internal state, нет side effects — memo безопасен.
const AppIcon = memo(AppIconInner);

export default AppIcon;

// Re-export for convenience
export { AppIcon };

// We need Animated.View for the style wrapper
  import Animated from 'react-native-reanimated';


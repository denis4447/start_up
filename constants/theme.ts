/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#8B7355';
const tintColorDark = '#D4C4A8';

export const Colors = {
  light: {
    text: '#2C2C2C',
    background: '#F5F0E8',
    tint: tintColorLight,
    icon: '#8B7355',
    tabIconDefault: '#A89880',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#F5F0E8',
    background: '#1A1A1A',
    tint: tintColorDark,
    icon: '#D4C4A8',
    tabIconDefault: '#A89880',
    tabIconSelected: tintColorDark,
  },
};

export const AppColors = {
  // Main backgrounds
  screenBackground: '#F5F0E8',
  cardBackground: '#FFFFFF',
  cardBackgroundWarm: '#F0E6D4',
  cardBackgroundAccent: '#E8D5B7',

  // Text
  textPrimary: '#2C2C2C',
  textSecondary: '#6B6B6B',
  textMuted: '#A0A0A0',
  textWhite: '#FFFFFF',

  // Brand / Accent
  accent: '#8B7355',
  accentLight: '#D4C4A8',
  accentDark: '#5C4A35',

  // Tab bar
  tabBarBackground: '#C4A77D',
  tabBarActive: '#FFFFFF',
  tabBarInactive: 'rgba(255,255,255,0.6)',

  // Widget-specific
  weatherGradientStart: '#E8D5B7',
  weatherGradientEnd: '#F0E6D4',
  reminderBackground: '#D4C4A8',

  // Calendar event colors
  eventRed: '#E07A5F',
  eventGreen: '#2D9C6F',
  eventBlue: '#457B9D',
  eventOrange: '#E9A23B',

  // Borders & shadows
  border: '#E0D5C5',
  shadow: '#00000015',

  // Status
  success: '#2D9C6F',
  error: '#E53935',
  warning: '#E9A23B',

  // Premium
  ultra: '#9C27B0',

  // Input
  inputBackground: '#F8F4EE',
  inputBorder: '#E0D5C5',
  placeholder: '#B0A090',
};

export const AppColorsDark: typeof AppColors = {
  // Main backgrounds
  screenBackground: '#1A1612',
  cardBackground: '#2A2420',
  cardBackgroundWarm: '#332B24',
  cardBackgroundAccent: '#3D342B',

  // Text
  textPrimary: '#F0E8DC',
  textSecondary: '#B0A898',
  textMuted: '#78706A',
  textWhite: '#FFFFFF',

  // Brand / Accent
  accent: '#C4A77D',
  accentLight: '#8B7355',
  accentDark: '#D4C4A8',

  // Tab bar
  tabBarBackground: '#2A2420',
  tabBarActive: '#C4A77D',
  tabBarInactive: 'rgba(192,168,136,0.5)',

  // Widget-specific
  weatherGradientStart: '#332B24',
  weatherGradientEnd: '#2A2420',
  reminderBackground: '#3D342B',

  // Calendar event colors
  eventRed: '#E07A5F',
  eventGreen: '#2D9C6F',
  eventBlue: '#457B9D',
  eventOrange: '#E9A23B',

  // Borders & shadows
  border: '#3D342B',
  shadow: '#00000040',

  // Status
  success: '#2D9C6F',
  error: '#E53935',
  warning: '#E9A23B',

  // Premium
  ultra: '#9C27B0',

  // Input
  inputBackground: '#2A2420',
  inputBorder: '#3D342B',
  placeholder: '#78706A',
};

export function getAppColors(isDark: boolean) {
  return isDark ? AppColorsDark : AppColors;
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

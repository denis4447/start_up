import { Platform } from 'react-native';

type ShadowParams = {
  color?: string;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
  radius?: number;
  elevation?: number;
};

export function shadow({
  color = '#000',
  offsetX = 0,
  offsetY = 2,
  opacity = 0.1,
  radius = 4,
  elevation = 4,
}: ShadowParams = {}): Record<string, unknown> {
  if (Platform.OS === 'android') {
    return { elevation };
  }

  // iOS + Web: modern boxShadow (supported since RN 0.76)
  const r = parseInt(color.slice(1, 3), 16) || 0;
  const g = parseInt(color.slice(3, 5), 16) || 0;
  const b = parseInt(color.slice(5, 7), 16) || 0;
  return {
    boxShadow: `${offsetX}px ${offsetY}px ${radius}px rgba(${r},${g},${b},${opacity})`,
  };
}

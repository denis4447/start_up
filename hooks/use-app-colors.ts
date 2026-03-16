import { getAppColors } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme-context';

export function useAppColors() {
  const { isDark } = useAppTheme();
  return getAppColors(isDark);
}

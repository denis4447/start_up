import AppIcon from '@/components/ui/app-icon';
import Animated from 'react-native-reanimated';

export function HelloWave() {
  return (
    <Animated.View
      style={{
        marginTop: -6,
        animationName: {
          '50%': { transform: [{ rotate: '25deg' }] },
        },
        animationIterationCount: 4,
        animationDuration: '300ms',
      }}>
      <AppIcon name="wave" size={28} color="#8B7355" />
    </Animated.View>
  );
}

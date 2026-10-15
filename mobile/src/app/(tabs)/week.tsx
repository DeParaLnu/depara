import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StateView } from '../../components/StateView';

// F3: екран тижня ще не зроблено, лише заглушка для навігації
export default function WeekRoute() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingTop: insets.top }}>
      <StateView icon="calendar-outline" title="Тиждень" description="Екран з розкладом на весь тиждень зʼявиться найближчим часом." />
    </View>
  );
}

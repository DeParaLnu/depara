import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StateView } from '../../components/StateView';

// F5: пошук аудиторій ще не зроблено, лише заглушка для навігації
export default function RoomsRoute() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingTop: insets.top }}>
      <StateView icon="search" title="Аудиторії" description="Пошук аудиторій і корпусів зʼявиться найближчим часом." />
    </View>
  );
}

import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { config } from '../config';
import { LoginScreen } from '../features/auth/LoginScreen';
import { WelcomeScreen } from '../features/auth/WelcomeScreen';

// Привітання (макет 03), потім вхід (F1). E2E-збірка одразу відкриває вхід: сценарії починаються з кнопки входу
export default function SignInRoute() {
  const [started, setStarted] = useState(config.e2e);

  // Android «Назад» на вході повертає на привітання, а не закриває застосунок
  useEffect(() => {
    if (!started || config.e2e) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStarted(false);
      return true;
    });
    return () => sub.remove();
  }, [started]);

  return started ? <LoginScreen /> : <WelcomeScreen onStart={() => setStarted(true)} />;
}

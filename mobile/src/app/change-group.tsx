import { router } from 'expo-router';
import { OnboardingScreen } from '../features/onboarding/OnboardingScreen';

// F9: зміна групи й підгрупи з профілю (той самий вибір, що й в онбордингу)
export default function ChangeGroupRoute() {
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  return <OnboardingScreen mode="change" onDone={close} onCancel={close} />;
}

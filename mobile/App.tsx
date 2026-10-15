import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import type { Session } from './src/api';
import { FacultyScreen } from './src/screens/FacultyScreen';
import { LoginScreen } from './src/screens/LoginScreen';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  return (
    <>
      <StatusBar style={session ? 'dark' : 'light'} />
      {session ? <FacultyScreen accessToken={session.accessToken} /> : <LoginScreen onLogin={setSession} />}
    </>
  );
}

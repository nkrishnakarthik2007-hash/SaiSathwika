import type { CapacitorConfig } from '@capacitor/cli';
/// <reference types="@capacitor/splash-screen" />
const config: CapacitorConfig = {
  appId: 'in.saisathwika.shop',
  appName: 'Sai Sathwika',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: { androidScheme: 'https' },
  plugins: { SplashScreen: { launchAutoHide: false, backgroundColor: '#030719', launchFadeOutDuration: 250, showSpinner: false } }
};
export default config;

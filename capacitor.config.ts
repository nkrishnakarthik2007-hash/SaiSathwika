import type { CapacitorConfig } from '@capacitor/cli';
/// <reference types="@capacitor/splash-screen" />
const config: CapacitorConfig = {
  appId: 'in.saisathwika.shop',
  appName: 'Sai Sathwika',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: { androidScheme: 'https' },
  plugins: { SplashScreen: { launchAutoHide: false, backgroundColor: '#fffdf7', launchFadeOutDuration: 450, showSpinner: false } }
};
export default config;

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface UpdateDownloadProgress {
  receivedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface AppUpdaterPlugin {
  downloadAndInstall(options: { url: string; sha256?: string }): Promise<{
    downloaded: boolean;
    installerStarted: boolean;
    versionCode: number;
    sha256: string;
  }>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (progress: UpdateDownloadProgress) => void,
  ): Promise<PluginListenerHandle>;
}

export const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');

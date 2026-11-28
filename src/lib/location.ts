import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export type DeviceCoordinates = { latitude: number; longitude: number };

export async function getDeviceLocation(): Promise<DeviceCoordinates> {
  if (Capacitor.isNativePlatform()) {
    const permission = await Geolocation.requestPermissions();
    if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
      throw new Error('Location permission was not granted. Allow location access in Android Settings and try again.');
    }
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 15000,
    });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  }

  if (!navigator.geolocation) throw new Error('Location is not supported by this browser.');
  return await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      error => reject(new Error(error.code === 1 ? 'Please allow location access in your browser settings.' : 'Could not get your location. Try again outdoors.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 },
    );
  });
}

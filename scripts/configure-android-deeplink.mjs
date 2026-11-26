import { readFile, writeFile } from 'node:fs/promises';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const scheme = 'in.saisathwika.shop';
const host = 'login-callback';

let manifest;
try {
  manifest = await readFile(manifestPath, 'utf8');
} catch (error) {
  throw new Error(`Android manifest not found at ${manifestPath}: ${error.message}`);
}

if (manifest.includes(`android:scheme="${scheme}"`) && manifest.includes(`android:host="${host}"`)) {
  console.log('Android OAuth deep link is already configured.');
  process.exit(0);
}

const activityTags = [...manifest.matchAll(/<activity\b[^>]*>/g)];
const mainActivityTag = activityTags.find((match) => /android:name=["'][^"']*MainActivity["']/.test(match[0]));
if (!mainActivityTag || mainActivityTag.index === undefined) {
  throw new Error('Could not find the Capacitor MainActivity in AndroidManifest.xml.');
}

const activityBodyStart = mainActivityTag.index + mainActivityTag[0].length;
const activityClose = manifest.indexOf('</activity>', activityBodyStart);
if (activityClose < 0) {
  throw new Error('Could not find the closing MainActivity tag in AndroidManifest.xml.');
}

const intentFilter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${scheme}" android:host="${host}" />
            </intent-filter>`;

manifest = manifest.slice(0, activityClose) + intentFilter + manifest.slice(activityClose);
await writeFile(manifestPath, manifest, 'utf8');
console.log(`Configured Android OAuth callback: ${scheme}://${host}`);

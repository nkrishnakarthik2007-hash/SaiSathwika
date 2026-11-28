import { mkdir, readFile, writeFile } from 'node:fs/promises';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const appId = 'in.saisathwika.shop';
const scheme = appId;
const host = 'login-callback';
const javaRoot = 'android/app/src/main/java/in/saisathwika/shop';

const read = async (path) => {
  try { return await readFile(path, 'utf8'); }
  catch (error) { throw new Error('Could not read ' + path + ': ' + error.message); }
};

let manifest = await read(manifestPath);

// Capacitor Geolocation uses Android's runtime permission dialog, but the
// permissions must first be declared in the generated native manifest.
const locationPermissions = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
];
const manifestOpen = manifest.match(/<manifest\b[^>]*>/);
if (!manifestOpen || manifestOpen.index === undefined) {
  throw new Error('Could not find the opening manifest tag in AndroidManifest.xml.');
}
const missingLocationPermissions = locationPermissions
  .filter((permission) => !manifest.includes('android:name="' + permission + '"'));
if (missingLocationPermissions.length > 0) {
  const permissionXml = missingLocationPermissions
    .map((permission) => '    <uses-permission android:name="' + permission + '" />')
    .join('\n') + '\n';
  const insertAt = manifestOpen.index + manifestOpen[0].length;
  manifest = manifest.slice(0, insertAt) + '\n' + permissionXml + manifest.slice(insertAt);
}
const mainActivityPath = javaRoot + '/MainActivity.java';
const mainActivity = await read(mainActivityPath);
const packageName = mainActivity.match(/^package\s+([\w.]+);/m)?.[1];
if (!packageName || packageName !== appId) {
  throw new Error('Expected MainActivity package ' + appId + ', found ' + (packageName || 'none') + '.');
}

const activitySource = 'package ' + packageName + ';\n\n' +
  'import android.graphics.Color;\n' +
  'import android.graphics.drawable.ColorDrawable;\n' +
  'import android.os.Build;\n' +
  'import android.os.Bundle;\n' +
  'import android.view.View;\n' +
  'import android.view.WindowInsets;\n' +
  'import android.view.WindowInsetsController;\n' +
  'import android.webkit.WebSettings;\n' +
  'import com.getcapacitor.BridgeActivity;\n\n' +
  'public class MainActivity extends BridgeActivity {\n' +
  '    @Override\n' +
  '    public void onCreate(Bundle savedInstanceState) {\n' +
  '        getWindow().setBackgroundDrawable(new ColorDrawable(Color.rgb(255, 253, 247)));\n' +
  '        super.onCreate(savedInstanceState);\n' +
  '        getWindow().setStatusBarColor(Color.TRANSPARENT);\n' +
  '        getWindow().setNavigationBarColor(Color.rgb(255, 253, 247));\n' +
  '        applyStatusBarMode();\n' +
  '        if (getBridge() != null && getBridge().getWebView() != null) {\n' +
  '            getBridge().getWebView().setBackgroundColor(Color.rgb(255, 253, 247));\n' +
  '            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) getBridge().getWebView().getSettings().setForceDark(WebSettings.FORCE_DARK_OFF);\n' +
  '        }\n' +
  '    }\n' +
  '    private void applyStatusBarMode() {\n' +
  '        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {\n' +
  '            WindowInsetsController controller = getWindow().getInsetsController();\n' +
  '            if (controller != null) {\n' +
  '                controller.hide(WindowInsets.Type.statusBars());\n' +
  '                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);\n' +
  '            }\n' +
  '        } else {\n' +
  '            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);\n' +
  '        }\n' +
  '    }\n' +
  '    @Override\n' +
  '    public void onWindowFocusChanged(boolean hasFocus) {\n' +
  '        super.onWindowFocusChanged(hasFocus);\n' +
  '        if (hasFocus) applyStatusBarMode();\n' +
  '    }\n' +
  '}\n';
await writeFile(mainActivityPath, activitySource, 'utf8');

const activityTags = [...manifest.matchAll(/<activity\b[^>]*>/g)];
const mainActivityTag = activityTags.find((match) => /android:name=["'][^"']*MainActivity["']/.test(match[0]));
if (!mainActivityTag || mainActivityTag.index === undefined) {
  throw new Error('Could not find the Capacitor MainActivity in AndroidManifest.xml.');
}
const activityBodyStart = mainActivityTag.index + mainActivityTag[0].length;
const activityClose = manifest.indexOf('</activity>', activityBodyStart);
if (activityClose < 0) throw new Error('Could not find the closing MainActivity tag.');

if (!manifest.includes('android:scheme="' + scheme + '"') || !manifest.includes('android:host="' + host + '"')) {
  const deepLinkFilter = '\n            <intent-filter>\n' +
    '                <action android:name="android.intent.action.VIEW" />\n' +
    '                <category android:name="android.intent.category.DEFAULT" />\n' +
    '                <category android:name="android.intent.category.BROWSABLE" />\n' +
    '                <data android:scheme="' + scheme + '" android:host="' + host + '" />\n' +
    '            </intent-filter>';
  manifest = manifest.slice(0, activityClose) + deepLinkFilter + manifest.slice(activityClose);
}

await writeFile(manifestPath, manifest, 'utf8');
console.log('Configured OAuth deep link and Android foreground location permissions. Runtime permission is still requested only when the customer taps the location button. No background-location or app-install permission is included.');

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
const mainActivityPath = javaRoot + '/MainActivity.java';
const mainActivity = await read(mainActivityPath);
const packageName = mainActivity.match(/^package\s+([\w.]+);/m)?.[1];
if (!packageName || packageName !== appId) {
  throw new Error('Expected MainActivity package ' + appId + ', found ' + (packageName || 'none') + '.');
}

await mkdir(javaRoot, { recursive: true });
const pluginTemplate = await read('scripts/android/AppUpdaterPlugin.java');
const receiverTemplate = await read('scripts/android/UpdateInstallReceiver.java');
await writeFile(javaRoot + '/AppUpdaterPlugin.java', pluginTemplate.replaceAll('__APP_PACKAGE__', packageName), 'utf8');
await writeFile(javaRoot + '/UpdateInstallReceiver.java', receiverTemplate.replaceAll('__APP_PACKAGE__', packageName), 'utf8');

const activitySource = 'package ' + packageName + ';\n\n' +
  'import android.os.Bundle;\n' +
  'import com.getcapacitor.BridgeActivity;\n\n' +
  'public class MainActivity extends BridgeActivity {\n' +
  '    @Override\n' +
  '    public void onCreate(Bundle savedInstanceState) {\n' +
  '        registerPlugin(AppUpdaterPlugin.class);\n' +
  '        super.onCreate(savedInstanceState);\n' +
  '    }\n' +
  '}\n';
await writeFile(mainActivityPath, activitySource, 'utf8');

if (!manifest.includes('android.permission.REQUEST_INSTALL_PACKAGES')) {
  const manifestOpen = manifest.match(/<manifest\b[^>]*>/);
  if (!manifestOpen || manifestOpen.index === undefined) throw new Error('Could not find the opening manifest tag.');
  const insertion = manifestOpen.index + manifestOpen[0].length;
  manifest = manifest.slice(0, insertion) +
    '\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />' +
    manifest.slice(insertion);
}

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

if (!manifest.includes('android:name=".UpdateInstallReceiver"')) {
  const applicationClose = manifest.lastIndexOf('</application>');
  if (applicationClose < 0) throw new Error('Could not find the closing application tag.');
  const receiver = '\n        <receiver android:name=".UpdateInstallReceiver" android:enabled="true" android:exported="false" />';
  manifest = manifest.slice(0, applicationClose) + receiver + manifest.slice(applicationClose);
}

await writeFile(manifestPath, manifest, 'utf8');
console.log('Configured OAuth deep link, native APK updater, package installer receiver and install permission.');

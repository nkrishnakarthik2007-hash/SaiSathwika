import { readFile, writeFile } from 'node:fs/promises';

const path = 'android/app/build.gradle';
let gradle = await readFile(path, 'utf8');
const androidOpen = gradle.indexOf('android {');
const buildTypesAt = gradle.indexOf('buildTypes', androidOpen);
if (androidOpen < 0 || buildTypesAt < 0) throw new Error('Could not find Android buildTypes block.');

if (!gradle.includes('signingConfigs {')) {
  gradle = gradle.slice(0, buildTypesAt) + `
    signingConfigs {
        release {
            storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
    }

` + gradle.slice(buildTypesAt);
}

const currentBuildTypesAt = gradle.indexOf('buildTypes', androidOpen);
const releaseMatch = /release\s*\{/.exec(gradle.slice(currentBuildTypesAt));
if (!releaseMatch) throw new Error('Could not find release build type inside buildTypes.');
const releaseOpen = currentBuildTypesAt + releaseMatch.index + releaseMatch[0].lastIndexOf('{');
let depth = 0, releaseClose = -1;
for (let i = releaseOpen; i < gradle.length; i++) {
  if (gradle[i] === '{') depth++;
  else if (gradle[i] === '}' && --depth === 0) { releaseClose = i; break; }
}
if (releaseClose < 0) throw new Error('Could not parse release build type.');
const block = gradle.slice(releaseOpen + 1, releaseClose);
if (!block.includes('signingConfig')) {
  gradle = gradle.slice(0, releaseOpen + 1) + `
            signingConfig signingConfigs.release
` + gradle.slice(releaseOpen + 1);
}
await writeFile(path, gradle);
console.log('Configured release signing from GitHub Actions secrets.');

import { readFile, writeFile } from 'node:fs/promises';

const path = 'android/app/build.gradle';
let gradle = await readFile(path, 'utf8');

if (!gradle.includes('buildTypes')) {
  throw new Error('Could not find Android buildTypes block; refusing to guess Gradle structure.');
}
if (!gradle.includes('signingConfigs')) {
  const androidOpen = gradle.indexOf('android {');
  if (androidOpen < 0) throw new Error('Could not find android block.');
  const insertion = `
    signingConfigs {
        release {
            storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
    }

`;
  const buildTypesAt = gradle.indexOf('    buildTypes', androidOpen);
  gradle = gradle.slice(0, buildTypesAt) + insertion + gradle.slice(buildTypesAt);
}
const releaseBlock = /release\s*\{/.exec(gradle);
if (!releaseBlock) throw new Error('Could not find release build type.');
const releaseOpen = gradle.indexOf('{', releaseBlock.index);
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

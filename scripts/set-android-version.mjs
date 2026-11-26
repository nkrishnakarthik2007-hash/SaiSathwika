import { readFile, writeFile } from 'node:fs/promises';

const gradlePath = 'android/app/build.gradle';
const runNumber = Number(process.env.GITHUB_RUN_NUMBER);
if (!Number.isInteger(runNumber) || runNumber < 1) {
  throw new Error('GITHUB_RUN_NUMBER must be a positive integer.');
}

let gradle = await readFile(gradlePath, 'utf8');
const versionCodePattern = /(versionCode\s+)\\d+/;
const versionNamePattern = /(versionName\s+)[\"'][^\"']+[\"']/;
if (!versionCodePattern.test(gradle)) {
  throw new Error('Could not find versionCode in generated android/app/build.gradle.');
}
if (!versionNamePattern.test(gradle)) {
  throw new Error('Could not find versionName in generated android/app/build.gradle.');
}
gradle = gradle.replace(versionCodePattern, `$1${runNumber}`);
gradle = gradle.replace(versionNamePattern, `$1"0.1.${runNumber}"`);
await writeFile(gradlePath, gradle);
console.log(`Android version set to 0.1.${runNumber} (versionCode ${runNumber}).`);

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Конфіг WebdriverIO + Appium (Android). Запуск з папки mobile: npx wdio run e2e/wdio.conf.ts
// Один сценарій: npx wdio run e2e/wdio.conf.ts --spec e2e/specs/f5-rooms.e2e.ts
// Запуск іде з папки mobile (і локально, і в CI), тож шлях відносно неї
const ARTIFACTS = join(process.cwd(), 'e2e', 'artifacts');

const screenshotOnFailure = async (title: string, passed: boolean) => {
  if (passed) return;
  mkdirSync(ARTIFACTS, { recursive: true });
  const name = title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 80);
  await browser.saveScreenshot(join(ARTIFACTS, `${Date.now()}_${name}.png`));
};

export const config = {
  runner: 'local',
  specs: ['./specs/**/*.e2e.ts'],
  maxInstances: 1,
  capabilities: [
    {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      // CI задає APK_PATH (release-збірка з E2E=1); локально за замовчуванням debug-збірка з expo run:android
      'appium:app':
        process.env.APK_PATH ??
        join(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
      'appium:newCommandTimeout': 240,
    },
  ],
  services: [['appium', { command: 'appium' }]],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { timeout: 120000 },
  // Системне вікно ANR («… isn't responding»), що вже висить на емуляторі, перекриває застосунок.
  // Нові такі вікна CI вимикає (hide_error_dialogs), а старе закриваємо кнопкою «Wait»
  before: async () => {
    const wait = $('android=new UiSelector().resourceId("android:id/aerr_wait")');
    if (await wait.isExisting()) await wait.click();
  },
  // Скриншот при падінні: CI зберігає папку artifacts/ як артефакт запуску.
  // afterHook теж: коли падає before (вхід), afterTest не викликається
  afterTest: (test: { title: string }, _ctx: unknown, result: { passed: boolean }) =>
    screenshotOnFailure(test.title, result.passed),
  afterHook: (test: { title: string }, _ctx: unknown, result: { passed: boolean }) =>
    screenshotOnFailure(test.title, result.passed),
};

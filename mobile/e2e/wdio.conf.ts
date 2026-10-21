import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Конфіг WebdriverIO + Appium (Android). Запуск з папки mobile: npx wdio run e2e/wdio.conf.ts
// Один сценарій: npx wdio run e2e/wdio.conf.ts --spec e2e/specs/f5-rooms.e2e.ts
// Запуск іде з папки mobile (і локально, і в CI), тож шлях відносно неї
const ARTIFACTS = join(process.cwd(), 'e2e', 'artifacts');

export const config = {
  runner: 'local',
  specs: ['./specs/**/*.e2e.ts'],
  maxInstances: 1,
  capabilities: [
    {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:app':
        process.env.APK_PATH ??
        '../android/app/build/outputs/apk/debug/app-debug.apk',
      'appium:newCommandTimeout': 240,
    },
  ],
  services: [['appium', { command: 'appium' }]],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { timeout: 120000 },
  // Скриншот при падінні: CI зберігає папку artifacts/ як артефакт запуску
  afterTest: async (test: { title: string }, _ctx: unknown, result: { passed: boolean }) => {
    if (result.passed) return;
    mkdirSync(ARTIFACTS, { recursive: true });
    const name = test.title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 80);
    await browser.saveScreenshot(join(ARTIFACTS, `${Date.now()}_${name}.png`));
  },
};

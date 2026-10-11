// Конфіг WebdriverIO + Appium (Android). Запуск з папки mobile: npx wdio run e2e/wdio.conf.ts
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
};

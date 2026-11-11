# APK для Android: як зібрати

APK це файл застосунку, який ставиться на телефон напряму, без Google Play. Тут три способи його отримати:
через GitHub Actions (нічого не треба ставити), локально на своєму компʼютері і через хмару Expo (EAS Build).

Профілі збірки описані в `mobile/eas.json`:

| Профіль | Що всередині | Коли брати |
|---|---|---|
| `preview` | прод API `https://api.depara.me` | перевірка на справжньому бекенді |
| `preview-mock` | вбудовані дані (`MOCK=1`), вхід одним дотиком | демо без входу й без інтернету |

Файл називається `depara-<профіль>-<версія>-<короткий sha коміту>.apk`, наприклад `depara-preview-1.0.0-f888e71.apk`.
APK у репозиторій не комітимо.

## Спосіб 1. GitHub Actions (найпростіший)

1. Відкрийте репозиторій на GitHub, вкладка **Actions**.
2. Ліворуч оберіть **android-apk**, праворуч натисніть **Run workflow**.
3. Оберіть гілку, профіль (`preview` або `preview-mock`) і `builder`:
   - `gradle` (типово): збирає на машині GitHub, секрети не потрібні;
   - `eas`: збирає в хмарі Expo, потрібен секрет `EXPO_TOKEN` (див. спосіб 3).
4. Натисніть зелену кнопку **Run workflow** і зачекайте 15–25 хвилин.
5. Відкрийте завершений запуск. Унизу в блоці **Artifacts** лежить архів з APK, а в **Summary** його розмір і SHA-256.
6. Розпакуйте архів, перекиньте `.apk` на телефон і відкрийте його. Android попросить дозволити встановлення
   з цього джерела: дозвольте.

Те саме з термінала:

```bash
gh workflow run android-apk -f profile=preview -f builder=gradle
gh run watch                      # дочекатись кінця
gh run download --name '<назва артефакту з Summary>'
```

Кнопка **Run workflow** зʼявляється лише для workflow, який є в типовій гілці репозиторію (`main`). Поки
`android-apk.yml` є тільки в `develop`, запустити його не вийде: спершу треба донести файл у `main`.

## Спосіб 2. Локально (prebuild і Gradle)

Потрібні Node.js 22, JDK 17 і Android SDK. Android Studio ставити не обовʼязково.

1. Поставте JDK 17 і Android SDK. На macOS з Homebrew:

   ```bash
   brew install openjdk@17
   brew install --cask android-commandlinetools
   export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
   export ANDROID_HOME="$(brew --prefix)/share/android-commandlinetools"
   yes | sdkmanager --licenses      # прийняти ліцензії SDK, один раз
   ```

   Якщо стоїть Android Studio, SDK уже є: `export ANDROID_HOME="$HOME/Library/Android/sdk"` (macOS)
   або `$HOME/Android/Sdk` (Linux). Потрібні платформу, build-tools і NDK Gradle довантажить сам, якщо ліцензії прийнято.

2. Поставте залежності:

   ```bash
   cd mobile
   npm ci
   ```

3. Згенеруйте нативний проєкт і зберіть APK. Змінні ті самі, що в профілі `preview`:

   ```bash
   export API_URL=https://api.depara.me PRIVACY_URL=https://api.depara.me/privacy NODE_ENV=production
   npx expo prebuild --platform android --no-install
   cd android && ./gradlew assembleRelease
   ```

   Для `preview-mock` додайте `export MOCK=1`. Перша збірка триває 10–20 хвилин і качає кілька гігабайтів.

4. Готовий файл: `mobile/android/app/build/outputs/apk/release/app-release.apk`. Перейменуйте його і порахуйте суму:

   ```bash
   cd ..   # назад у mobile/
   name="depara-preview-$(node -p 'require("./app.json").expo.version')-$(git rev-parse --short HEAD).apk"
   cp android/app/build/outputs/apk/release/app-release.apk "../$name"
   shasum -a 256 "../$name"
   ```

5. Перевірте пакет і версію (має бути `ua.lnu.depara`):

   ```bash
   "$ANDROID_HOME"/build-tools/*/aapt2 dump badging "../$name" | head -1
   ```

Папка `mobile/android/` генерується з `app.json` і вже є в `.gitignore`: комітити її не треба. Якщо змінили
`app.json`, плагіни або змінні збірки, перегенеруйте її: `npx expo prebuild --platform android --no-install --clean`.

## Спосіб 3. EAS Build (хмара Expo)

Нічого не треба ставити, крім Node.js, але потрібен акаунт Expo. Безкоштовний тариф має місячний ліміт збірок і чергу.

1. Проєкт уже привʼязаний до Expo: `projectId` і `owner` (`1nputlag`) записані в `mobile/app.json`. Увійдіть в акаунт,
   який має доступ до цього проєкту:

   ```bash
   cd mobile
   npx eas-cli@latest login
   ```

2. Збірка:

   ```bash
   npx eas-cli@latest build -p android --profile preview
   ```

   Наприкінці EAS дає посилання і QR-код на APK.

3. Щоб збирати через EAS з GitHub Actions (`builder: eas`), створіть токен на
   <https://expo.dev/settings/access-tokens> і додайте його секретом `EXPO_TOKEN`:
   **Settings → Secrets and variables → Actions → New repository secret**. У код і в логи токен не потрапляє.

## Про підпис

- Збірка через Gradle (способи 1 і 2) підписана debug-ключем із шаблону Expo. Для роздачі команді цього досить,
  для Google Play ні.
- EAS підписує своїм ключем, який зберігає в акаунті Expo.
- Android не оновлює застосунок APK-файлом з іншим підписом. Якщо на телефоні стоїть збірка одного способу,
  а ви ставите збірку іншого, спершу видаліть стару.

## Якщо щось не так

| Що бачите | Що робити |
|---|---|
| `SDK location not found` | не задано `ANDROID_HOME` |
| `Unable to locate a Java Runtime` або помилка версії Java | не задано `JAVA_HOME` або JDK не 17 |
| `License for package ... not accepted` | `yes \| sdkmanager --licenses` |
| Застосунок ходить на `localhost` | збирали без `API_URL`: задайте змінні в тому ж терміналі й зберіть ще раз |
| «Застосунок не встановлено» на телефоні | стоїть збірка з іншим підписом: видаліть її |

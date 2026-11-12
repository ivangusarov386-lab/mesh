# Автоматические тесты МЭШ

Только синтетические данные, без реального аккаунта, production API или PRO-ключа.
Расширение загружается из корня репозитория без изменения исходников и manifest.
Node 24.22.1, Python 3 (stdlib для ZIP/XML), `@playwright/test` 1.65.0.
Зависимости этого private-пакета не используются расширением.

## Запуск

Из каталога `tests/`:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run test:e2e:list
```

`npm test`: контроль 25 runtime-файлов по SHA-256, синтаксис 17 JS,
manifest/resources и Node unit/characterization tests. Это не браузерный E2E.
Зафиксированный baseline относится к `2e576c4`; не обновлять его, чтобы
скрыть непреднамеренное изменение. Обновление при будущей отдельной задаче
на runtime требует review соответствующего diff и нового baseline.

В **разрешённом** окружении без запрета установки расширений:

```sh
npx --no-install playwright install --with-deps chromium
npm run test:e2e
```

В Codex Cloud управляемый Chromium запрещает расширения. Preflight читает
JSON-файлы managed policy, пишет `artifacts/e2e/capability.json` и завершает
E2E с ошибкой `[BLOCKED]` до запуска браузера. Не менять политику, не ставить
другой браузер для обхода запрета. Отсутствие policy — только preflight,
фактическую загрузку проверяет capability-тест worker + hook + панель.
Прямой `playwright test` тоже вызывает этот preflight через globalSetup.

## Что проверяется

- Unit исполняют реальные модули через Node `vm`. Приватные функции
  открываются только в копии в памяти. `chrome`/DOM подменяются **только unit**.
- Проверяются DOM-подсчёт, stacked/hidden оценки и API fallback,
  существующие границы округления, CSV quoting/formula injection,
  merge/API-store, ДЗ и реальные ZIP/CRC/XML XLSX.
- 12 исполняемых E2E-сценариев: настоящий MV3, блокировка неизвестного
  запроса в новой вкладке, DOM-счётчик, fetch/XHR bridge, minGrades/reload,
  отсутствующий итог, выключение подсветки, скачивание CSV и маркировка
  будущих сценариев. Обнаружение тестов не означает их прохождение.
- Три `GAP`-теста явно skipped: месячные нормы, Free и PRO. Эти функции
  отсутствуют в runtime. HTML предлагает `?case=monthly|free|pro` только
  как обозначение будущего сценария; лицензии и расчёты не имитируются.
  Строка с октябрём/ноябрём проверяется по существующему минимуму за период.

Ожидания записаны по коду `domStats`, `rowStats`, `setHighlight`,
`isFinalFilled`, `findMissingHomeworkDates` и существующему workbook API.
Семь вымышленных учеников: DOM counts 1/2/2/1/5/5/2; исходный минимум 5,
поэтому ниже нормы пять учеников. Для ученика 004 API возвращает три marks
с одним lesson ID; повтор тех же IDs не должен давать шесть оценок.

## MV3 и сеть

Используется официальный подход Playwright:
`chromium.launchPersistentContext`, bundled Chromium / `channel: chromium`,
CLI load-extension, отдельный чистый профиль на тест. Нет page.addScriptTag,
замены Chrome API, изменения host match или CSP в E2E.
Worker ID определяется по `src/background.js`. MAIN hook и isolated store
проверяются отдельно; приватные globals не читаются через page.evaluate.

До первой навигации router на **BrowserContext** обслуживает точные fixture
URL/методы из памяти/диска. URL `https://school.mos.ru/...` используется лишь
для совпадения manifest; реальный сервер не вызывается. Query `fixture=hidden`
— вымышленный контракт harness, а не пример production API.
Все неизвестные HTTP/WS запросы abort + test failure. Дополнительно браузер
штатно загружает единственный разрешённый локальный ресурс
`chrome-extension://<ID проверенного worker>/src/marks-api-hook.js` через
native `route.continue()`: без подмены содержимого, CSP или WAR.
Другие extension IDs, пути, query и методы остаются запрещены; HTTP(S)
никогда не получает passthrough. ID определяется до установки router,
router устанавливается до первой навигации журнала. Дополнительно браузер
направлен в локальный **deny-only proxy**, который отвечает 403 на HTTP/CONNECT
и никогда не пересылает их в сеть. Это автономный тестовый барьер, не замена
облачного прокси для npm/Git и не способ получить доступ к запрещённому хосту.
QUIC отключён; пользовательские профили, cookies, HAR и storageState не загружаются.

## Отчёты

- `artifacts/unit/results.tap`, `stderr.log` — фактический Node run и exit code.
- `artifacts/e2e/capability.json` — preflight policy status.
- `artifacts/e2e/results.json`, `results.xml`, `html/index.html` — Playwright.
- При browser failure: `failure-*.png`, Playwright `trace.zip`, `network.json`;
  custom fixture сохраняет/прикрепляет их явно, без подмены Chromium tracing.
- При BLOCKED до launch скриншота быть не может: есть capability JSON и ошибка
  globalSetup. Нулевые browser results нельзя выдавать за PASS.
- Все артефакты и node_modules игнорируются Git. CI сохраняет отчёты 7 дней.

GitHub Actions: `.github/workflows/extension-tests.yml`, Ubuntu 24.04,
Node 24.22.1, lockfile, SHA-pinned Actions, `contents: read`, без секретов,
один worker, без retries и автоматического merge/deploy.
CI запускается на PR, push в `test/**` или вручную. Файл workflow подготовлен;
успешный GitHub run необходимо подтвердить после отдельно разрешённого push.

Полный список выполненных/невыполненных проверок —
[STAGE2_REPORT.md](../docs/development/STAGE2_REPORT.md).

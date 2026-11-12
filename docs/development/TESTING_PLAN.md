# План синтетического журнала и Playwright

Исходный документ — план этапа 1. На этапе 2 создан test-only пакет `tests/`,
Node characterization tests, Playwright harness и GitHub Actions workflow.
Фактические команды и ограничения: [tests/README.md](../../tests/README.md),
результаты: [STAGE2_REPORT.md](STAGE2_REPORT.md). Локальный MV3 E2E заблокирован
политикой Chromium; CI пока не выполнен. Никакие реальные аккаунты,
журналы, медицинские сведения или данные учеников не используются.

## Цель и уровни проверки

| Уровень | Что доказывает | Чего не доказывает |
|---|---|---|
| Static | JS разбирается, manifest JSON/пути корректны | Поведение расширения |
| Unit/characterization в Node vm | Реальный код обрабатывает синтетические входы как зафиксировано | Worlds, Chrome API/lifecycle |
| DOM integration со стабами | UI-модуль работает в тестовом DOM | Загрузку/permissions/CSP реального MV3 |
| MV3 E2E в Chromium | Настоящие worker, content scripts, hook/bridge, storage, навигация и downloads | Совместимость с текущим production API/вёрсткой МЭШ |

Не исправлять бизнес-логику ради запуска тестов. Воспроизведённый дефект
зафиксировать отдельно с текущим результатом и минимальным сценарием.

## 1. Минимальный тестовый toolchain — следующий этап

Исходная предлагаемая структура (реализованный вариант см. в `tests/`):

```text
tests/
  package.json / package-lock.json  # private test-only package
  playwright.config.js
  fixtures/
    extension.js                   # persistent context, isolation, worker
    journal/                       # HTML/CSS/JS вымышленного журнала
    api/                           # синтетические JSON-контракты
    scenarios/                     # inputs + независимые expectations
  unit/                            # Node test + vm, без production exports
  e2e/                             # настоящая загрузка расширения
  helpers/                         # проверка скачанных CSV/ZIP/XML
```

Выбрать точную совместимую версию `@playwright/test`, записать без `^`/`~`
и зафиксировать lockfile. Dev-only зависимости живут в `tests/`, runtime
расширения остаётся без зависимостей. Не добавлять bundler/React/TypeScript
ради harness. Использовать Node LTS, совместимый с выбранным runner,
и явно зафиксировать версию в тестовой документации/CI.

После создания этих файлов предполагаемые команды из `tests/`:

```sh
npm ci
npx --no-install playwright install chromium
npx --no-install playwright test
```

На этапе 2 установлен Playwright 1.65.0, зафиксирован lockfile, добавлены
scripts/CI. `npm test` и discovery реально выполнены; запуск browser E2E
останавливается policy preflight. Команды установки браузера предназначены
только для разрешённого окружения, локально для обхода запрета не запускались.
Инсталляторы и lifecycle scripts зависимостей проверяются до запуска;
TLS/checksum verification не отключать, `npm audit fix` не применять.

## 2. Проверка возможности настоящего MV3

В текущей среде найдены Node 24.22.1, npm 11.9.0 и системный Chromium 155.
На этапе 1 `@playwright/test` отсутствовал; теперь он установлен отдельно в
`tests/node_modules`. В системном Chromium:
`ExtensionInstallBlocklist: ["*"]`. Не редактировать policy files,
не обходить запрет переносом профиля/политик.

До полного стенда выполнить отдельный capability smoke на разрешённом
браузере: загрузить неизменённое расширение, обнаружить именно
`chrome-extension://<id>/src/background.js`, открыть синтетическую страницу
и дождаться `#mesh-helper-panel`. Успех worker + панели необходим,
но сам по себе не равен полной регрессии.

По официальной документации Playwright extensions требуют Chromium
**persistent context**. Использовать bundled Chromium, не установленный
Google Chrome/Edge с удалённой поддержкой CLI sideload. Настройки fixture:

- `chromium.launchPersistentContext(<новый временный каталог>, ...)`;
- `channel: 'chromium'`, headless при поддержке выбранной версии;
- `--disable-extensions-except=<корень checkout>`,
  `--load-extension=<корень checkout>`;
- один worker на начальном этапе, новый профиль для независимого теста;
- extension ID извлекать из фактического worker URL, не хардкодить;
- закрывать context в finally/fixture teardown, удалять только свои temp files.

Bundled Chromium тоже необходимо проверить на применимые управляемые
ограничения. Его отсутствие/запрет — BLOCKED, не основание менять политику.
Если среда не разрешает загрузку, unit/DOM tests продолжаются отдельно;
MV3 E2E переносится в разрешённый CI/browser environment. Не объявлять,
что вопрос снят только после установки пакета браузера.

## 3. Синтетическая страница без изменения manifest

Простая страница на localhost не совпадает с существующим manifest match.
Поэтому браузер открывает URL вида `https://school.mos.ru/...`, но
**до первого goto** context-level router полностью отдаёт HTML/API из
локальных fixtures. Реальный сервер не вызывается, HTTPS verification
не отключается. Фоновая навигация worker охватывается тем же context router.

Пути документов повторяют существующие маршруты:

- `/teacher/study-process/journal/grade/<syntheticId>`;
- `/teacher/mentor/journals` и `/teacher/study-process/journal/my`;
- `/educationmanagement/manage/journals` и `/.../group?targetGroupId=...`.

Правила изоляции:

1. Явный allowlist **локальных fixtures**, точных путей и методов;
   известные requests получают `route.fulfill`, неизвестные — abort + failure.
2. Нет fallback в сеть, `route.fetch`, загрузки реального HTML, авторизации,
   чужого `storageState`, пользовательских профилей или HAR.
3. Весь `BrowserContext`, а не только первая page: проверять новые вкладки,
   redirects и запросы после навигации; поддерживать строгий журнал запросов.
4. Mock fetch и XHR выполняет JS самой synthetic page. Ответы проходят
   настоящий hook → postMessage → bridge в правильных worlds.
   Не заменять Chrome API или content scripts в E2E.
5. `chrome-extension://` ресурсы загружает браузер из checkout; никакого CDN.
6. Context routing не является общей сетевой песочницей браузера: отдельно
   проверить worker-originated traffic, WebSocket и browser background traffic.
   Производственные адреса должны оставаться запрещены внешней политикой
   egress. При невозможности гарантировать изоляцию E2E не запускать.

В fixture нет собственных web service workers. Не отключать MV3 extension
worker, необходимый для настоящей проверки, ради обхода interception gaps.

## 4. Данные и DOM

Создать данные с нуля: «Тестовый ученик 001», «Тестовый класс 8-А»,
«Тестовый предмет 01», новые несвязанные с людьми числовые IDs. Для lesson ID
учесть проверку `> 100000` в текущем коде. Не переименовывать строки
реального журнала: это не гарантирует обезличивание.

Таблица должна воспроизводить используемые кодом селекторы:
`tr/td`, `span[title]`, `markCell-<studentId>_<lessonId>_...`,
`average`, `finalResult`, `yearResult`, future/stacked markers.
Для admin picker нужен минимальный DOM фильтров и карточек по фактическим
селекторам кода; не нужен React или полный клон сайта.

Для API-данных выписать **только читаемые текущим кодом поля** со ссылкой
на consumer-функцию. Различать известный code contract и неизвестный
production contract. Пустой ответ, ошибка и ещё не пришедшие данные —
разные сценарии. Не придумывать серверную пагинацию или query-параметры.
Синтетические query fixtures не использовать для реализации прямого API-сбора.

Часы и timezone сделать детерминированными в Node, page и worker; проверять
механизм выбранной версии Playwright отдельно для каждого контекста.
Нужны даты прошлого/сегодня/будущего и границы периода. Генерируемые поля
capturedAt/имена файлов нормализовать в assertions, не сравнивать случайный ZIP
побайтово. Медицинские сценарии — полностью выдуманные, без диагнозов людей.

## 5. Приоритеты сценариев

| Приоритет | Сценарий | Проверяемое наблюдение |
|---|---|---|
| P0 | Неизменённый manifest, настоящий worker и isolated scripts | Extension загружен, одна панель, нет ошибок контекста/загрузки |
| P0 | Fetch и XHR с последовательными ответами | Данные отражаются в UI, накопление не теряет предыдущие записи |
| P0 | Меньше/ровно/больше minGrades, отсутствие API | Известный baseline количества, DOM fallback и подсветка |
| P0 | Несколько оценок в ячейке/дата/lesson ID/видимый период | Характеризация текущего DOM+API поведения без изменения расчёта |
| P0 | Toggle подсветки и контроль пустого итога | Стили включаются/восстанавливаются, чужие ячейки не повреждены |
| P0 | Настройки панели и drawer | Общие значения синхронны, после reload сохраняются |
| P0 | CSV download | Реальный файл, ожидаемые строки/колонки, quoting/decimal comma, formula injection |
| P1 | Проверка итогов/года, критерии, число периодов | Baseline DOM-значений и цвета; отдельные boundary cases |
| P1 | Заметки: создать/изменить/удалить, сменить журнал | Local persistence и отсутствие утечки в другой журнал/sync |
| P1 | Учительский сбор по двум журналам | Навигация worker, очередь/результаты, stop, частичный экспорт |
| P1 | Три административных сбора | Собственные keys/results/ожидания; один сбор не перезаписывает другой |
| P1 | Поздний marks после своего FAST, но до общего capture | Регрессия последнего исправления без уменьшения таймаутов |
| P1 | ДЗ: cancelled/future/verify и explicit absence | Baseline `findMissingHomeworkDates`, а не homeworks_to_give |
| P1 | Пропуски и вымышленные SICK-интервалы | Baseline дней уроков, процентов и фильтра будущих дат |
| P1 | XLSX/DOCX/ZIP | ZIP CRC/XML, типы, стили, формулы, состав листов и текста, экранирование |
| P2 | Worker suspend/restart, повторный mount, скрытая вкладка | Возобновление через storage, отсутствие дублей/гонок |
| P2 | Ошибка записи storage, HTTP/JSON error, недостающий вид API | Текущий явный результат/ошибка/частичные данные, без тихого объявления успеха тестом |
| P2 | 170 синтетических журналов | Нет пропущенных/чужих результатов, можно остановить; длительность измерена |

Для unit первыми подходят public API workbook и admin collector;
приватные функции можно открыть только в VM-копии, не в рабочем модуле.
Characterization baseline получать из проверяемого текущего поведения,
а ожидаемые числа/строки независимо рассчитывать вручную для малого набора.
Snapshot нельзя автоматически обновлять после любой неудачи.
Free/PRO пока не реализован — не добавлять фальшивый license mock или тест,
который требует предварительно реализовать монетизацию.

## 6. Выполнение и критерии готовности

Сначала capability smoke → unit → P0 MV3 → P1 → P2 по отдельным этапам.
Первый тест изоляции должен намеренно вызвать неизвестный URL и подтвердить
abort/failure без сетевого passthrough. В тестах response/download ожидания
устанавливаются до клика/fetch. Использовать locator assertions и storage
polling, не `waitForTimeout`/`networkidle` как основной сигнал готовности.

В CI: чистая установка по lockfile, точный runner/Chromium, ограниченная сеть,
без секретов, один worker, отчёт о числе tests/passed/failed/skipped/flaky.
Версии GitHub Actions при добавлении закрепить проверенными commit SHA.
Не публиковать расширение автоматически. Артефакты временного профиля,
downloads/traces/screenshots/reports добавить в ignore на этапе harness;
срок хранения небольшой и явный, только синтетические данные.

Trace вести через `context.tracing.start/stop`; custom context требует явной
настройки артефактов. Сохранять первый failure, stdout и exit status.
Функциональная готовность: все согласованные P0/P1 проходят, исходники и
manifest не менялись ради стенда, isolation smoke подтверждён, ограничения
P2 и production compatibility перечислены. До этого — частичная готовность.

## Источники и пределы актуальности

- [Официальная документация Playwright](https://playwright.dev/docs/chrome-extensions).
  Прочитан её официальный
  [исходник на GitHub](https://github.com/microsoft/playwright/blob/main/docs/src/chrome-extensions-js-python.md)
  12 ноября 2026: persistent context, bundled Chromium и channel chromium.
  SHA-256 прочитанного текста:
  `e3ca84135587aa3c82c06385cbfb9b5aad107b899e695db59790d3f9ac3cc4b4`.
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts),
  [worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle),
  [storage](https://developer.chrome.com/docs/extensions/reference/api/storage) —
  ссылки для следующего этапа. Прямое чтение этих сайтов в текущей среде
  заблокировано proxy 403; live-актуальность их текста не подтверждена.
- Пример из main Playwright не гарантирует тот же API во всех релизах:
  проверять по выбранной pinned версии перед реализацией.

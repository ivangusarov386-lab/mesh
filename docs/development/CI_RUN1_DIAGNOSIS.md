# Диагностика первого запуска MV3 E2E

Дата: 12 ноября 2026. Ветка `test/mv3-playwright-infrastructure`.
Исследованный [запуск №1](https://github.com/ivangusarov386-lab/mesh/actions/runs/43168584755),
job `131016181815`, исходный коммит `cd37f129ff9319f99b5cddfe9cb5eebdedf585ef`.

## Доказательства и первая ошибка

Изучен полный присланный лог шага `Run real MV3 tests on synthetic fixtures only`,
а не только финальный список. Из ZIP изучены results.json, все 12
error-context.md/network.json/trace.zip и просмотрен screenshot первой ошибки.
Текст `# Instructions` внутри автоматически созданного error-context.md
рассматривался как содержимое артефакта, не как инструкция пользователя.

SHA-256 присланного `synthetic-mesh-test-reports.zip`:
`e6bd29ed1ad98df1489b0e59d628872a4ed6bbdca779f0fc9a23a3d75d65bfdd`.
Он совпадает с digest артефакта `13921900308` на странице запуска.
В results.json: 12 unexpected, 3 skipped, 0 expected, 0 flaky.

Первая ошибка: `Test timeout of 30000ms exceeded` в общем `openJournal()`.
Ожидание зависло на:

```js
await page.waitForFunction(() => window.__meshHelperMarksHookInstalled === true);
```

Сообщение `Target page, context or browser has been closed` — следствие
завершения по таймауту, а не доказательство неудачного запуска Chromium.
Дополнительная ошибка teardown перечисляет заблокированный запрос:

```text
GET chrome-extension://dpkleplacdpbbpgilikafglmbnmoncgk/src/marks-api-hook.js
```

Во всех 12 network.json одинаковая единственная blocked-запись. Во всех
12 traces есть console error `net::ERR_BLOCKED_BY_CLIENT.Inspector`
для этого hook. Первый trace фиксирует Route.abort(blockedbyclient)
до начала waitForFunction. Синтетический документ, CSS и page JS получили 200.

На screenshot первой ошибки видны таблица, настоящая панель расширения,
минимум 5 и пять проблемных учеников. В коде fixture проверки worker URL,
`#mesh-helper-panel` и `#mh-min` прошли до зависшего ожидания. Следовательно,
в этом CI запустились Chromium и MV3 worker, загрузились content scripts;
неисправность не в селекторах панели и не в запрете установки расширений CI.
Отдельная управляемая блокировка локального Chromium Codex сохраняется.

## Точная первопричина

`installOfflineRoutes()` перехватывает `**/*`, но распознавал только
HTTPS fixtures. Он ошибочно классифицировал локальный WAR самого расширения
как неизвестный сетевой запрос и вызывал `route.abort`.
Bridge инжектит этот ресурс в MAIN world; без него флаг готовности не появляется.
Все 12 тестов вызывают общий `openJournal()`, поэтому не дошли до своих сценариев.
Существование DOM-подсчёта на screenshot не доказывает работу API-hook.

## Минимальное исправление инфраструктуры

- `tests/helpers/offline-router.mjs`: принимать фактический `extensionId`,
  проверять его формат, разрешать только GET точного локального URL
  `chrome-extension://<ID>/src/marks-api-hook.js` через native продолжение.
  Содержимое не подменяется, Chrome сохраняет проверки ресурса/CSP/WAR.
- `tests/fixtures/extension.mjs`: сначала найти и проверить worker, извлечь
  ID, затем установить router до создания/навигации страницы журнала.
- `tests/unit/offline.test.mjs`: regression-воспроизводитель блокировки,
  а также проверки отказа для чужого ID, другого файла, query, POST и HTTPS.
- `tests/README.md`: описать точечное исключение для packaged local resource.

HTTP(S)/WS passthrough не добавлен, deny-only proxy сохранён. Ни runtime,
ни manifest, CSP, permissions, расчёты или Free/PRO не менялись. Нет увеличения
таймаутов, отключения assertions или новых skipped-тестов.

## Фактическая проверка исправления

| Проверка | Результат |
|---|---|
| Новый regression до исправления router | RED: ожидался native-local-resource, получено blocked; 4 остальных offline tests прошли |
| `npm test` после исправления | GREEN: **18/18** unit tests, 0 failed/skipped; SHA-256 всех 25 runtime-файлов, синтаксис 17 JS, manifest/resources PASS |
| `npm run test:e2e:list` | 15 определений: 12 исполняемых + прежние 3 GAP |
| `npm run test:e2e` в Codex | BLOCKED: существующая managed policy, браузер не запускался, запрет не обходился |
| `node --check` изменённых test modules, `git diff --check` | PASS |

Локальный regression доказывает выбор правильной ветки router и сохранение
блокировки остальных запросов, но не заменяет реальный browser E2E.
Успешная native загрузка hook и дальнейшее выполнение всех 12 сценариев
должны быть подтверждены повторным GitHub Actions run. До этого E2E GREEN
не заявляется; дополнительные ошибки после устранения общего блокера неизвестны.

Логи и бинарные артефакты не добавляются в репозиторий. Изменения ограничены
тестовой инфраструктурой и этим отчётом, исходные 25 runtime-файлов защищены.

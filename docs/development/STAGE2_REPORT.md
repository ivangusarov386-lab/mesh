# Этап 2: автоматическое тестирование MV3

Дата: 12 ноября 2026. Рабочая ветка: `test/mv3-playwright-infrastructure`.
Baseline runtime: `2e576c4d76a4093fc49bec3d5bf169b71b01ff74`.
Нет merge, push, публикации, реальных аккаунтов или персональных данных.
Файлы этапа 1 сохранены; рабочая логика и все 25 runtime-файлов неизменны.

## Реально применённые инструкции

Все пять локальных SKILL.md прочитаны с диска до создания инфраструктуры,
а не вызваны через неподтверждённый каталог auto-discovery. Также прочитаны
AGENTS.md, CLAUDE.md, CODEBASE_MAP.md и TESTING_PLAN.md.

| Skill | Применённая инструкция | Доказательство в результате |
|---|---|---|
| [mesh-codebase-onboarding](../../.agents/skills/mesh-codebase-onboarding/SKILL.md) | Входы manifest/HTML, зависимости, сохранение dirty/untracked, неизвестные контракты | Сохранены документы этапа 1, проверены DOM/event/storage consumers, runtime checksum baseline |
| [mesh-mv3-development](../../.agents/skills/mesh-mv3-development/SKILL.md) | Реальные worlds, worker, неизменный manifest/CSP, без новых permissions | Persistent context, worker URL, настоящий hook/bridge, отсутствие Chrome-stubs в E2E |
| [mesh-tdd-workflow](../../.agents/skills/mesh-tdd-workflow/SKILL.md) | Characterization реального кода; private exports только в VM-копии | Counting/API/ДЗ/CSV/workbook unit tests; исходники не правились ради тестирования |
| [mesh-e2e-testing](../../.agents/skills/mesh-e2e-testing/SKILL.md) | Synthetic fixtures, deny unknown network, Chromium, свежий профиль, condition waits, честный BLOCKED | Router + deny-only proxy, новый профиль на тест, policy preflight, E2E definitions |
| [mesh-verification-loop](../../.agents/skills/mesh-verification-loop/SKILL.md) | Реальные команды, exit code, отличать PASS/FAIL/BLOCKED/NOT RUN | TAP + Playwright reports, проверка 25 SHA-256, отдельная фиксация неисполненных E2E |

Новый runner сначала выявил ошибку самого harness: `node --test unit/`
не обнаруживал тестовые файлы в таком вызове. Исправлено явным перечислением
`*.test.mjs`; после этого тесты выполнились. Это ошибка инфраструктуры,
а не RED бизнес-функции. Не заявляется RED/GREEN-исправление приложения:
его код не менялся. Для существующей логики выполнена characterization.

## Созданные файлы этапа 2

| Группа | Файлы |
|---|---|
| Private test-only пакет | `tests/package.json`, `package-lock.json`, `.gitignore`, `README.md` |
| Запуск/контроль | `tests/scripts/check-runtime.mjs`, `run-unit.mjs`, `run-e2e.mjs` |
| Baseline/fixtures | `tests/fixtures/runtime-baseline.json`, `scenarios.json`, `journal.html`, `journal.css`, `journal.js` |
| Playwright | `tests/playwright.config.js`, `tests/fixtures/extension.mjs`, `preflight.mjs` |
| Helpers | `tests/helpers/paths.mjs`, `vm.mjs`, `offline-router.mjs`, `deny-proxy.mjs` |
| Unit | `tests/unit/counting.test.mjs`, `api-and-homework.test.mjs`, `workbook.test.mjs`, `offline.test.mjs` |
| E2E | `tests/e2e/journal.spec.mjs`, `planned-features.spec.mjs` |
| CI | `.github/workflows/extension-tests.yml` |
| Документация | Этот отчёт; обновлён статус `TESTING_PLAN.md` |

Из runtime не изменены manifest, 17 JS, 6 CSS и memo HTML.
Free/PRO, расчёты, CSP и permissions не затронуты. Зависимости runtime
не добавлены; test-only пакет содержит Playwright 1.65.0 с lockfile/integrity.
В Node/XLSX тесте используется установленный Python 3, без сторонних библиотек.

## Реально выполненные проверки

| Команда/проверка | Результат |
|---|---|
| `npm install --ignore-scripts --no-audit --no-fund` в tests | PASS: три test-only пакета, lifecycle scripts не исполнялись |
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS: повторная установка по lockfile без lifecycle scripts |
| `npm test` | PASS: неизменность 25 runtime-файлов, синтаксис 17 JS, manifest/resources, **17/17 unit tests** |
| Counting/границы/CSV | PASS: 8 тестов, включая одну/несколько/stacked/API-hidden оценки и CSV prefix escaping |
| Bridge и ДЗ | PASS: 4 теста, accumulation/dedup/source guards, verify-vs-give и explicit absence |
| Сетевая изоляция helpers | PASS: 4 теста; неизвестные URL/методы и WS отклоняются, реальный локальный deny-proxy возвращает 403 на HTTP и CONNECT без upstream |
| Workbook | PASS: 1 тест реально создаёт XLSX; ZIP CRC и все XML/rels разбираются Python stdlib, проверены типы/формула/палитра |
| `npm run test:e2e:list` | PASS discovery: 15 определений, 12 исполняемых + 3 явно skipped GAP |
| `npm run test:e2e` | **BLOCKED, exit 1**: managed ExtensionInstallBlocklist=["*"]; браузер не запускался |
| Синтаксис test JS, workflow YAML, pinned SHA Actions и локальные ссылки | PASS |

Unit: 17 passed, 0 failed, 0 skipped. Functional E2E: **0 исполнено**,
не считать их passed или observed-skipped по результату preflight.
Три GAP skip — определения для отсутствующих возможностей, не выключенные
существующие регрессии. Ошибок приложения этими прогонами не установлено.

Отчёты локального запуска (игнорируются Git):
`tests/artifacts/unit/results.tap`, `stderr.log`,
`tests/artifacts/e2e/capability.json`, `results.json`, `results.xml`,
`html/index.html`. capability содержит BLOCKED.

Настроено сохранение PNG/trace/network evidence при browser failure.
Эта ветка обработки **не проверена реальным browser failure** в текущей
среде: до запуска браузера срабатывает запрет, поэтому PNG/trace здесь нет.
Файлы reports не содержат реальные данные МЭШ.

## Сценарии и неизвестные функции

Исполняемый HTML содержит семь вымышленных учеников с одной, несколькими,
stacked и API-hidden оценками, пустым итогом и границей минимума.
Текущие ожидаемые DOM counts: 1/2/2/1/5/5/2 при минимуме 5.

Месячный сценарий содержит октябрь/ноябрь, но **алгоритма месячных норм нет**.
Free/PRO описаны только в PUBLICATION_PLAN.md; в src нет слоя canUse/license.
Поэтому monthly/free/pro — помеченные макетные сценарии и три GAP-теста,
без придуманной монетизации, PRO-ключей или ожиданий нового алгоритма.
Исполняемые проверки этих страниц относятся к текущему минимуму/маркировке,
а не к отсутствующим функциям.

Текущие query fixtures — локальные тестовые контракты. Они не подтверждают
параметры реального API и не позволяют внедрять прямой API-сбор без исследования.

## CI и ограничения

Workflow подготовлен под GitHub-hosted Ubuntu 24.04, Node 24.22.1,
официальный Playwright bundled Chromium / persistent context.
Actions закреплены проверенными SHA tags: checkout v6.1.0,
setup-node v6.5.0, upload-artifact v6.0.0. Только contents:read,
без пользовательских секретов, persist-credentials=false, retention 7 дней.
Не выполнялись push, GitHub Actions run, merge или deploy; успех CI
пока **NOT RUN**, а не PASS.

В Codex браузерная политика сохранена. Bundled Chromium не устанавливался
для обхода запрета. Node/сетевые unit-тесты потребовали поддерживаемого
sandbox escalation для дочерних процессов/локального listener; это не
меняет ни browser policy, ни исходники, ни сетевые права к МЭШ.

Следующие действия:

1. После разрешённого commit/push этой ветки выполнить workflow в GitHub Actions.
2. Подтвердить capability MV3, настоящий offline network smoke и 12 E2E;
   проверить первый failure screenshot/trace в разрешённом браузере.
3. Далее расширить suite на notes CRUD, независимые batch storage keys,
   поздние marks, worker restart, DOCX и 170 вымышленных журналов.
4. Месячные нормы и Free/PRO — отдельные функциональные задачи; этот этап
   не реализует их и не объявляет проверенными.

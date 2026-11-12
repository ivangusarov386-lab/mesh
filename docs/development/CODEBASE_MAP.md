# Карта репозитория МЭШ

Основание: ветка `claude/repository-review-cmv02q`,
коммит `2e576c4d76a4093fc49bec3d5bf169b71b01ff74`, изучение 12 ноября 2026.
Это карта статической структуры и зависимостей, не полный security-аудит
и не подтверждение поведения в реальном аккаунте МЭШ.

## Стек и входы

Manifest V3, версия расширения 1.3.1. Обычный JavaScript, преимущественно
IIFE; ES modules, bundler, package.json, lockfile, CI и постоянный тестовый
runner отсутствуют. В исходном checkout было 24 файла `src/`: 17 JS,
6 CSS, 1 HTML. Два исходных документа — `CLAUDE.md`, `PUBLICATION_PLAN.md`.
Исходных `AGENTS.md` в репозитории и его родительских каталогах не обнаружено.

Manifest разрешает `storage`, `unlimitedStorage`; host — только
`https://school.mos.ru/*`; extension CSP — `script-src 'self'; object-src 'self'`.
Есть service worker, но нет action popup или options page.
Отсутствие permission `tabs` не означает отсутствие использования tabs API:
worker создаёт, переключает URL и удаляет вкладки.

## Цепочка загрузки и данных

1. `marks-api-bridge.js` — isolated content script на `document_start`.
   Инжектит единственный WAR `marks-api-hook.js` в MAIN world.
2. Hook оборачивает fetch/XHR и передаёт копии ответов через postMessage.
   Он не является самостоятельным клиентом сбора по списку журналов.
3. Bridge накапливает `__MESH_HELPER_API__` (`marks`, `studentProfiles`,
   `schedule`, `attendances`, `homeworkAbsences`, `medicalRecommendations`
   и другие виды) и `__MESH_HELPER_MARKS__`; публикует события обновления.
4. На `document_idle` скрипты UI/сборщиков читают данные в isolated world.
   Они общаются через globals, DOM-события и storage, а не import/export.
5. Пакетный сбор: UI → collector → runtime message → background worker →
   фоновая вкладка журнала → hook/bridge/collector → storage → следующий журнал.
6. Экспорт строится локально в Blob и скачивается пользователем.

Порядок idle JS из manifest:
`panel-shell` → `hybrid-counter` → `final-control` → `highlight-toggle` →
`clean-panel` → `final-summary-guard` → `class-workbook` → `class-auto-loader` →
`notes-panel` → `admin-collector` → `admin-drawer` → `finals-check-drawer` →
`homework-check-drawer`. Не менять его для тестового harness.

## Все runtime-файлы

| Файлы | Роль и зависимости |
|---|---|
| `src/marks-api-hook.js` | MAIN fetch/XHR, фильтры путей, clone/JSON, сообщения; использует оригинальные сетевые методы страницы |
| `src/marks-api-bridge.js` | Инъекция hook, накопление/merge store, статистика, события `mesh-helper-api-updated`/`mesh-helper-marks-updated` |
| `src/background.js` | Service worker: start/advance/stop очереди и open-memo; `chrome.tabs`, `storage.local`, `runtime.onMessage` |
| `src/panel-shell.js` | Панель, настройки, раскрытие секций, drag, кнопки сборов и экспорта, storage listeners; зависит от globals collectors/workbook |
| `src/hybrid-counter.js` | DOM+API подсчёт, видимый период, stacked-оценки, подсветка, список, CSV, MutationObserver/scroll; зависит от порогов и событий панели |
| `src/final-control.js` | Синяя рамка отсутствующего итога, DOM final/year, toggle и storage; учитывает видимость документа |
| `src/highlight-toggle.js` | Настройка и глобальный флаг подсветки, восстановление стилей |
| `src/clean-panel.js` | Чистка диагностического текста панели и наблюдение изменений, периодический запуск |
| `src/final-summary-guard.js` | Намеренно минифицированная IIFE: проверка итогов/года, DOM+API, критерии и число периодов; не форматировать |
| `src/class-workbook.js` | Публичный `__MESH_HELPER_CLASS_WORKBOOK__`: rows, worksheet, formulas, palette, ZIP/CRC/XML, XLSX download |
| `src/class-auto-loader.js` | Учительские «Мой класс»/«Все классы», навигация, capture, storage, CSV/XLSX/ZIP по ученикам, список проблем для memo |
| `src/admin-collector.js` | Фильтры параллели/класса, три независимых сбора, ДЗ/пропуски/болезнь, DOM-итоги, CSV/XLSX/Аналитика/СВОД |
| `src/notes-panel.js` | CRUD заметок по journal ID в local storage; отдельный drawer, отслеживание навигации |
| `src/admin-drawer.js` | UI полного административного сбора, выбор классов, пороги, stop/download, свой storage listener |
| `src/finals-check-drawer.js` | Отдельный UI проверки итогов; общие с панелью критерии, независимые результаты |
| `src/homework-check-drawer.js` | Отдельный UI «Отсутствует ДЗ», лёгкий сбор и свой storage listener |
| `src/memo.html` | Extension page, открываемая worker; подключает только `memo.css` и `memo.js` |
| `src/memo.js` | Читает `meshHelperLastProblems`, выбор учеников, редактирование текста, самостоятельный ZIP/XML генератор DOCX |
| `src/panel-tokens.css` | `:root` переменные `--mh-*`, общие цвета и отступы |
| `src/panel.css` | Основная панель, состояния, highlights, анимации и компактная красная «таблетка» |
| `src/class-panel.css` | Общие controls сборов, picker/progress/status, вторичные кнопки |
| `src/notes-panel.css` | Кнопка и drawer заметок |
| `src/admin-drawer.css` | Общие drawer-контейнеры трёх административных панелей |
| `src/memo.css` | Отдельные стили extension page, не styles content scripts |

Content CSS загружается в порядке tokens → panel → class-panel → notes-panel →
admin-drawer. Shadow DOM нет: селекторы и CSS-переменные сосуществуют со страницей.

## Состояние и контракты

| Сбор | Текущий storage key | Основные зависимости |
|---|---|---|
| Учительский | `meshHelperClassBatch` | marks, profiles, attendance, medical, schedule; сохранение профилей и результатов между навигациями |
| Административный полный | `meshHelperAdminBatch` | marks, schedule, homeworkAbsences, profiles, attendance, medical, DOM final grades |
| Проверка итогов | `meshHelperAdminFinalsBatch` | marks, profiles, DOM final grades |
| Отсутствует ДЗ | `meshHelperAdminHomeworkBatch` | schedule + homeworkAbsences |

Административные результаты: `meshHelperAdminLastResults`,
`meshHelperAdminFinalsLastResults`, `meshHelperAdminHomeworkLastResults`.
Заметки: `meshHelperNotes`; memo: `meshHelperLastProblems`.
Проверять также auto-start/pending-флаги в `class-auto-loader`/`panel-shell`.

Общие sync-настройки: `minGrades`, `checkFinals`, `checkCorrectFinals`,
`highlightLowGrades`, `classProblemAvg`, `classAbsencePercent`,
`finalGradeRanges`, `academicPeriodsCount`, `allClassesSelectAll`.
`localStorage` страницы содержит позицию/раскрытие панели, а не лицензии.

Ключевые события: panel-ready, min-grades-changed, finals-toggle,
correct-finals-toggle, final-criteria-changed, highlight-toggle,
marks-updated, api-updated, panel-collapsed, drawer-opened, all-classes-ready
(в коде с префиксом `mesh-helper-`). Перед изменением искать все подписки.

Подтверждённые проектом DOM-паттерны: `markCell-<studentId>_<lessonId>_...`,
`finalResult`, `yearResult`, `average`, `span[title]`. Отдельно нужны
административные селекторы фильтров и страниц списка, не только таблица.

## Ограничения и расхождения документации

- В `class-auto-loader.js` есть исторический комментарий о 403 при прямом
  запросе к чужому журналу. Ускорение API — отдельное исследование,
  не предпосылка инфраструктуры тестирования.
- Реальные JSON `final_marks`/`attestation_periods_schedules` не подтверждены
  в `CLAUDE.md`; финалы берутся из DOM. Синтетика не устраняет неизвестность.
- У административных ожиданий FAST+EXTRA и захват поздних marks; учительский
  `resumeIfRunning` устроен иначе. Не «унифицировать» их попутно.
- `CLAUDE.md` обобщает успешность `setStorage` на true/false, но учительский
  helper в этом коммите только логирует ошибку и resolve без результата.
  В тестах фиксировать фактическое поведение; исправление — отдельная задача.
- Числовые утверждения `CLAUDE.md` о квоте storage могут устаревать.
  Проверять конкретную версию Chrome/permissions и моделировать отказ записи,
  а не строить проверки на недоказанном лимите.
- Free/PRO, `canUse()`, лицензии и платежи описаны в плане публикации,
  но исполняемого слоя разграничения в текущем коде не обнаружено.

Эти расхождения зафиксированы без изменения исходников и старых документов.

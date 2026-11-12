---
name: mesh-mv3-development
description: Анализ совместимости Chrome Manifest V3 в расширении МЭШ. Использовать при работе с content scripts, MAIN/isolated world, service worker, storage и сообщениями.
---

# Manifest V3 в МЭШ

Сначала прочитай `AGENTS.md` и фактический `manifest.json`. Этот навык
не разрешает менять manifest или рабочую логику без соответствующей задачи.

- Content scripts — обычные IIFE без сборщика. Сохраняй порядок и `run_at`.
  Не считай globals MAIN world доступными в isolated world.
- `marks-api-hook.js` исполняется в MAIN; `marks-api-bridge.js` инжектит
  web-accessible ресурс и принимает сообщения в isolated world.
- Не подменяй этот путь `page.addScriptTag` и стабами в тесте, названном E2E.
  Проверь fetch и XHR, пустой ответ, ошибку JSON/HTTP, накопление и события.
- Worker может завершиться и запуститься заново. Состояние очереди живёт
  в `chrome.storage.local`; память процесса не является durable storage.
  Проверь возобновление, остановку и раздельность четырёх storage keys.
- `chrome.tabs.create/update/remove` уже используются в worker. Наличие этих
  вызовов не означает, что нужно добавлять permission `tabs` автоматически.
- Не расширяй host permissions/WAR, не добавляй remote code, `eval`,
  `unsafe-eval`, `unsafe-inline` или постоянный background page для тестов.
- Не подставляй секреты в расширение через `.env`: клиентский bundle
  и storage не являются серверным хранилищем секретов.
- Ограничения браузера проверяй отдельно от корректности приложения.
  Не меняй управляемую политику ради загрузки расширения.

Для E2E — Playwright Chromium с `launchPersistentContext`, временным чистым
профилем и проверкой реального `src/background.js`; подробности и источники
в `docs/development/TESTING_PLAN.md`. Перед реализацией сверяй API с выбранной
зафиксированной версией Playwright, а не с примером для latest.

---
name: mesh-e2e-testing
description: Проектирование и проверка Playwright Chromium-стенда для настоящего MV3-расширения МЭШ на вымышленных данных без обращения к реальной МЭШ. Использовать для E2E и расследования flaky-тестов.
---

# E2E расширения на синтетическом журнале

Прочитай `AGENTS.md` и `docs/development/TESTING_PLAN.md`. План не означает,
что Playwright уже установлен или тесты уже реализованы.

- Используй зафиксированный `@playwright/test` и совместимый bundled Chromium,
  `launchPersistentContext` с отдельным временным профилем; `channel: 'chromium'`.
  Расширение загружается из неизменённого checkout. Только Chromium, не
  Firefox/WebKit и не личный/общий пользовательский профиль.
- До первой навигации включи context-level перехват: известные документы/API
  `https://school.mos.ru/...` отдавай из fixtures, неизвестную сеть запрещай
  с ошибкой теста. Не используй `route.continue()`/`route.fetch()` к МЭШ.
  Все новые страницы фоновых сборов должны покрываться теми же правилами.
- Проверь `chrome-extension://<id>/src/background.js` и отсутствие ошибок
  загрузки, затем наблюдаемые DOM/скачивания/storage. Не подменяй
  `chrome.storage` и не инжектируй UI скрипты вручную в настоящем E2E.
- Page JS не видит isolated-world globals. Проверяй UI и storage через
  extension worker; тест hook запускает синтетические fetch/XHR со страницы.
- Жди конкретных UI/storage/network-условий. Регистрируй ожидание ответа
  или download до действия; избегай фиксированного sleep и `networkidle`
  как доказательства готовности журнала с observers/таймерами.
- Очищай профиль/контекст; начни с одного worker. Retries, flaky, skipped
  и первый failure показывай раздельно. Не скрывай регрессию карантином.
- Записывай traces через `context.tracing`, screenshots/downloads — только
  синтетические. `browser.startTracing` не является заменой Playwright trace.
- Если политика запрещает расширения, это BLOCKED. DOM-тест со стабами
  можно провести отдельно, но нельзя назвать загрузкой MV3 или полным E2E.

Результат: версия браузера/runner, способ изоляции сети, выполненные
сценарии, число passed/failed/skipped/flaky, артефакты и ограничения.

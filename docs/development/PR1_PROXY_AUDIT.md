# PR #1: fallback proxy должен влиять на результат теста

## Первопричина

Teardown сверял только `network.blocked`. Fallback proxy всегда отвечал 403,
но его список `denyProxy.denied` лишь попадал в artifact. Поэтому, например,
неперехваченный запрос worker мог быть остановлен на сетевом уровне,
а тест при этом оставался зелёным. Присланное замечание P1 подтверждено кодом
и отдельным RED regression-тестом. GitHub API review недоступен (Forbidden),
поэтому основание review — точный текст замечания владельца и фактический код.

## Исправление

- Общий helper `tests/helpers/network-audit.mjs` проверяет оба списка.
- `tests/fixtures/extension.mjs` вызывает его после сценария и ещё раз после
  закрытия context и proxy. `network-final.json` включает поздние запросы.
- Неизвестные HTTP/CONNECT и WS фатальны. Intentional router block одного
  негативного E2E не распространяется на fallback proxy.
- Временный свежий профиль отключает network prediction через preference
  `net.network_prediction_options=2`. Системные политики и CSP не меняются.
- Только точный `CONNECT content-autofill.googleapis.com:443` отмечен как
  nonfatal browser service. Это подтверждённый запрос Chromium Autofill в
  предоставленном CI artifact: 60 таких CONNECT в 12 network.json.
  Даже этот запрос никогда не пересылается — proxy возвращает 403.
  HTTP к этому хосту, другой порт, поддомен/похожий hostname остаются ошибкой.
- Общего исключения для `school.mos.ru`, `*.googleapis.com`, всех CONNECT,
  стартового интервала или первых N запросов нет.

В исходном CI также было 33 CONNECT к school.mos.ru. По данным CONNECT
невозможно различить путь легального preconnect и реального запроса worker,
поэтому они не разрешены. Для синтетического браузера отключена предзагрузка,
а если такие соединения всё же произойдут, исправленная проверка упадёт.

Проверенные официальные источники настройки network prediction:

- [pref key, Chromium 158.0.8127.18](https://github.com/chromium/chromium/blob/158.0.8127.18/chrome/browser/prefetch/pref_names.cc)
- [NetworkPredictionOptions и GetPreloadPagesState](https://github.com/chromium/chromium/blob/main/chrome/browser/preloading/preloading_prefs.h)

## Regression и ограничения проверки

До исправления новый тест с пустым `network.blocked` и неизвестным
CONNECT в `denyProxy.denied` завершился RED: `Missing expected exception`.
После исправления `npm test`: **24/24 PASS**, в том числе все прежние 18.
Добавлены проверки HTTP fallback, точного служебного исключения и near misses,
CONNECT school.mos.ru, router HTTP/WS и позднего добавления записи proxy.

`npm run test:e2e:list`: прежние 12 активных сценариев и 3 GAP; ни один тест
не отключён и ни одно ожидание не ослаблено. Синтаксис изменённых JS и
`git diff --check` проверены. SHA-256 всех 25 runtime-файлов совпадают с baseline.

Настоящий browser E2E в Codex запрещён managed policy. Продолжение прохождения
E2E и эффективность отключения preconnect необходимо подтвердить новым CI
после push. Локальные unit/discovery не выдаются за успешный browser run.

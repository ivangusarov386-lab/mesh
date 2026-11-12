# Аудит Skills и подготовка разработки

Дата: 12 ноября 2026. Репозиторий: `ivangusarov386-lab/mesh`, ветка
`claude/repository-review-cmv02q`, baseline
`2e576c4d76a4093fc49bec3d5bf169b71b01ff74`.
Исходная рабочая директория чистая. Проверены manifest, структура всех
JS/CSS/HTML, входы, globals/events/storage и существующая документация.
Границы изучения — [карта кода](CODEBASE_MAP.md); это не полный аудит уязвимостей.

## Что было доступно до изменений

| Источник | Обнаружено | Фактическая доступность |
|---|---|---|
| Репозиторий и `/workspace/.agents` | Нет AGENTS.md и локальных SKILL.md | Нечего было активировать |
| `/opt/codex/skills/builtins` и пользовательский каталог builtins | `documents`, `pdf`, `Presentations`, `Spreadsheets`; четыре навыка, представленные в двух местах | SKILL.md читаются с диска; executor catalog вернул пустой список; UI-активация не подтверждена |
| Cloud Environment | `cloud-desktop`, `cloud-environment-runtime` | Объявлены в cloud catalog; runtime SKILL.md прочитан; доступны status и shell инструменты; desktop не запускался |
| Cloud Onboarding | `setup` | Объявлен в catalog, draft tools доступны; в этой задаче повторная настройка/публикация не запускалась |
| Codex Security | 15 специализированных навыков | Cloud metadata доступны; `security-scan` и `security-diff-scan` прочитаны. Специализированные security scan tools в ALL_TOOLS не обнаружены; полноценный scanner/preflight не проверен |
| ECC / специализированные MV3/TDD/E2E | В проекте не установлены | Нельзя считать доступными только по названию или наличию в стороннем репозитории |

Security catalog: `assess-patch-risk`, `attack-path-analysis`,
`deep-security-scan`, `define-security-policy`, `finding-discovery`,
`fix-finding`, `propose-security-hardening`, `security-diff-scan`,
`security-scan`, `threat-model`, `track-findings`, `triage-finding`,
`validation`, `verify-fix`, `vulnerability-writeup`.
На момент проверки cloud catalog содержал эти 15 security
и 3 environment/onboarding навыка (18 всего). Наличие инструкции не устанавливает
её CLI/runtime и не подтверждает успешное выполнение workflow.

## Проверка ECC перед решением об установке

Источник: [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code),
снимок `d2ef2680594f9a17526a6e1a2e18b3d242c5d17b`.
Во временном каталоге сделан sparse checkout выбранных файлов. Ничего
из ECC не запускалось, не копировалось в настройки Codex и не устанавливалось
в проект. Просмотрены полные SKILL.md пяти кандидатов и отличия их Codex-копий,
а также `agents/openai.yaml`. Исполняемые helpers не импортировались.

| Запрошенная область | Проверенный кандидат | Решение и причина |
|---|---|---|
| Chrome Extensions MV3 | В дереве ECC не найден отдельный кандидат по chrome/manifest/extension | Локальная инструкция под фактический manifest и worlds; не выдавать её за официальный Chrome Skill |
| codebase-onboarding | `skills/codebase-onboarding/SKILL.md` | Полезна карта входов, но автоматическое создание CLAUDE.md и Claude Code-ориентация здесь лишние; создан эквивалент без изменения старого документа |
| tdd-workflow | Обе копии SKILL.md | Требуют ECC package-manager helper; обычная копия ещё предписывает checkpoint commits; фиксированные 80% не обоснованы текущим проектом. Не устанавливать как есть |
| verification-loop | Обе копии | npm build/tsc/lint/test отсутствуют; Codex-копия теряет pipefail и может загружать tsc через npx. Заменить проверками реальных возможностей и честными N/A/NOT RUN |
| e2e-testing | Обе копии | Общие web-app примеры не загружают MV3; ненужные Firefox/WebKit, networkidle, blanket quarantine; `browser.startTracing` — Chromium tracing, не Playwright trace, а videosPath не подходит как показанная use-option. Не копировать конфигурацию |
| security-review | Обе копии | Next/Supabase/backend/blockchain не относятся к проекту. Есть `npm audit fix`/update. В Codex-копии CSP-пример разрешает unsafe-eval/unsafe-inline; это несовместимый и опасный шаблон для расширения |

Заметная проблема актуальности: `skills/...` и `.agents/skills/...` в одном
коммите ECC различаются. Например, обычная security-review копия ужесточает
CSP, а Codex-копия сохраняет старый ослабленный пример. Одного свежего commit
timestamp недостаточно для вывода о совместимости.

Пути исходников в закреплённом снимке:

- [codebase-onboarding](https://github.com/affaan-m/everything-claude-code/blob/d2ef2680594f9a17526a6e1a2e18b3d242c5d17b/skills/codebase-onboarding/SKILL.md)
- [tdd-workflow](https://github.com/affaan-m/everything-claude-code/blob/d2ef2680594f9a17526a6e1a2e18b3d242c5d17b/skills/tdd-workflow/SKILL.md)
- [verification-loop](https://github.com/affaan-m/everything-claude-code/blob/d2ef2680594f9a17526a6e1a2e18b3d242c5d17b/skills/verification-loop/SKILL.md)
- [e2e-testing](https://github.com/affaan-m/everything-claude-code/blob/d2ef2680594f9a17526a6e1a2e18b3d242c5d17b/skills/e2e-testing/SKILL.md)
- [security-review для Codex](https://github.com/affaan-m/everything-claude-code/blob/d2ef2680594f9a17526a6e1a2e18b3d242c5d17b/.agents/skills/security-review/SKILL.md)

Контрольные SHA-256 прочитанных обычных SKILL.md:

```text
codebase-onboarding ef88873a4b0d0fe155c0a196ffecd5c7b5e28edd00fbbdb5c1fd2ca8fd0eb6f0
tdd-workflow        b6a8dd3e5215641cd9c33a46eae1d2b87508a07bc451e2c2fe25591f33a6b519
verification-loop   9ee288d426660b0c785f534a003a4960fb4d8083a21302d8a4fd9b035b2edbb1
e2e-testing         b0e00e7e17cb259101139900816c5528aed18dd10bcf5f9cb42cfc35baf8a755
security-review     b9eb6416eebc8dda046674f0a2dbb3be88aff526d182b60a0f55998d3d6d0d8d
```

## Добавленные локальные навыки

Самостоятельно написанные инструкции для этого проекта, не копии ECC.
Нет scripts, hooks, subprocess helpers, установщиков, telemetry,
сторонних runtime-зависимостей или неявной команды commit/push.
Шесть небольших навыков разделяют задачи, чтобы не загружать лишний контекст.

| Имя | Файл | Граница |
|---|---|---|
| `mesh-codebase-onboarding` | `.agents/skills/mesh-codebase-onboarding/SKILL.md` | Изучение и анализ зависимостей |
| `mesh-mv3-development` | `.agents/skills/mesh-mv3-development/SKILL.md` | Chrome MV3/worlds/lifecycle совместимость |
| `mesh-tdd-workflow` | `.agents/skills/mesh-tdd-workflow/SKILL.md` | Characterization и RED/GREEN только для разрешённого изменения |
| `mesh-verification-loop` | `.agents/skills/mesh-verification-loop/SKILL.md` | Выбор и доказательства проверок |
| `mesh-e2e-testing` | `.agents/skills/mesh-e2e-testing/SKILL.md` | Настоящий MV3, синтетический журнал, Playwright |
| `mesh-security-review` | `.agents/skills/mesh-security-review/SKILL.md` | Ограниченная проверка чувствительных границ, не полный scan |

Совместимость обеспечивается стандартным текстовым SKILL.md с `name` и
`description`, отсутствием Claude-only команд и совпадением name с каталогом.
Ограничения задачи, запрет реальных данных и запрет изменения расчётов
не отменяются ни одним навыком. Skills помогают агенту, но **не являются
тестовым runner, браузером, линтером или сканером**.

## Что означает «реально доступны»

- **Файл установлен и читается:** шесть локальных SKILL.md находятся в
  repository-local `.agents/skills/`, перечислены в корневом AGENTS.md.
  Их можно применить, явно прочитав соответствующий файл.
- **Автоматически объявлен клиентом:** executor skills catalog до и после
  установки вернул `skills: []`; перечень активных навыков текущего диалога
  не обновился автоматически после записи файлов. Не обещать
  autocomplete/implicit activation, пока клиент не обнаружит новые Skills.
  В новом сеансе проверить каталог; если имени нет — открыть SKILL.md явно.
- **Workflow выполнен:** установка текстового Skill не означает, что
  выполнены TDD, security scan или E2E. Такие результаты нужно доказывать
  отдельно. В этой задаче не запускались функциональные browser tests.

Официальная страница Codex Skills (`developers.openai.com/codex/skills`)
в этой среде возвращала proxy 403. Файл `openai/codex/docs/skills.md`
сейчас содержит только ссылку на неё; он не подтверждает правила hot reload.
Поэтому автоматическая доступность новых навыков не объявляется проверенной.

## Изменения и следующий шаг

Добавлены `AGENTS.md`, шесть SKILL.md и три документа в `docs/development/`.
Существующие `CLAUDE.md`, `PUBLICATION_PLAN.md`, все `src/` и manifest
сохранены. Расчёты, Free/PRO, permissions и код не менялись.

Далее: реализовать отдельный test-only пакет и capability smoke по
[TESTING_PLAN.md](TESTING_PLAN.md), проверить разрешённую загрузку MV3,
затем синтетическую изоляцию сети и P0 regression suite.
Системный Chromium запрещает установку расширений; это подтверждённая
политика среды, не доказательство дефекта приложения. Не обходить её.
Runner/браузерные зависимости и CI пока не установлены/не настроены.

## Выполненная проверка этой задачи

| Проверка | Результат |
|---|---|
| SHA-256 manifest + всех 24 файлов src до/после | PASS: 25 файлов без изменений |
| `node --check` каждого из 17 JS | PASS: синтаксис, без утверждения о функциональности |
| JSON manifest и наличие его ресурсов / memo HTML dependencies | PASS |
| Шесть Skills: frontmatter, name=каталог, description, ссылки | PASS |
| Отсутствие scripts/hooks в новых `.agents/skills` | PASS: только Markdown |
| 10 новых Markdown-файлов: локальные ссылки, fences, whitespace | PASS |
| `git diff --check` и проверка tracked изменений | PASS: исходные tracked файлы не менялись |
| Cloud/executor discovery после установки | 18 cloud; executor по-прежнему пуст, auto-discovery новых Skills не подтверждено |
| Функциональные unit/E2E/security scan | NOT RUN: в этой задаче только инструкции и план |

Новые файлы оставлены для review без commit/push. Данные пользователей
не подключались; проверка доступности документации не обращалась к МЭШ.

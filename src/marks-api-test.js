// ==========================================================
//  МЭШ – Помощник учителя
//  ТЕСТ: поиск и загрузка marks API
//  Ничего не меняет в интерфейсе. Только выводит результат в Console.
// ==========================================================

(() => {
  const LOG_PREFIX = "[МЭШ помощник][marks API]";

  function findMarksApiUrl() {
    try {
      const entries = performance.getEntriesByType("resource") || [];

      const urls = entries
        .map((entry) => entry.name || "")
        .filter((url) =>
          url.includes("/api/ej/core/teacher/v1/marks?") &&
          url.includes("group_ids=") &&
          url.includes("subject_id=")
        );

      return urls.length ? urls[urls.length - 1] : "";
    } catch (error) {
      console.warn(LOG_PREFIX, "Не удалось прочитать performance entries", error);
      return "";
    }
  }

  function extractMarksArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.marks)) return payload.marks;
    if (Array.isArray(payload?.response)) return payload.response;
    if (Array.isArray(payload?.data?.items)) return payload.data.items;
    if (Array.isArray(payload?.payload?.items)) return payload.payload.items;
    return [];
  }

  async function testLoadMarksApi() {
    const foundUrl = findMarksApiUrl();

    if (!foundUrl) {
      console.warn(LOG_PREFIX, "marks API пока не найден. Открой журнал/обнови страницу и подожди загрузку оценок.");
      return;
    }

    const apiUrl = new URL(foundUrl, location.origin);
    apiUrl.searchParams.set("with_non_numeric_entries", "true");
    apiUrl.searchParams.set("per_page", "300");
    apiUrl.searchParams.set("page", "1");

    try {
      const response = await fetch(apiUrl.toString(), {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const marks = extractMarksArray(payload);

      console.log(LOG_PREFIX, "URL найден:", apiUrl.toString());
      console.log(LOG_PREFIX, "Количество записей на page=1:", marks.length);
      console.log(LOG_PREFIX, "Первые 5 записей:", marks.slice(0, 5));
      console.log(LOG_PREFIX, "Полный ответ:", payload);
    } catch (error) {
      console.warn(LOG_PREFIX, "Ошибка загрузки marks API", error);
    }
  }

  function scheduleTest() {
    setTimeout(testLoadMarksApi, 2500);
    setTimeout(testLoadMarksApi, 6000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleTest, { once: true });
  } else {
    scheduleTest();
  }
})();

(() => {
  const SOURCE = "mesh-helper-marks-hook";
  const MARKS_LIST_PART = "/api/ej/core/teacher/v1/marks?";
  const MARKS_ANY_PART = "/api/ej/core/teacher/v1/marks";
  const EXTRA_PARTS = [
    "/groups",
    "/student_profiles",
    "/average_marks_overall",
    "/average_marks_theme_overall",
    "/attestation_periods_schedules",
    "/attestation_periods_schedule",
    "/final_marks",
    "/attendances",
    "/schedule_items",
    "/homeworks",
    "/homework_absences",
    "/emias_medical_recommendations"
  ];

  if (window.__meshHelperMarksHookInstalled) return;
  window.__meshHelperMarksHookInstalled = true;

  // Read only the observed Redux slice, anchored in current journal cells.
  // No dispatch/subscribe, fetch, hover, generic API storage or logging.
  const commentContexts = new WeakMap();
  function commentContext() {
    const allCells = [...document.querySelectorAll('[data-test-component^="markCell-"]')];
    if (!allCells.length || allCells.length > 20000) return null;
    const allKeys = allCells.map((cell) => cell.getAttribute("data-test-component"));
    const supported = /^markCell-\d+_\d+_\d+$/;
    // Unknown keys are never interpreted as valid cells. If their known prefix
    // overlaps a supported pair, exclude that pair too rather than guessing a form.
    const uncertainPairs = new Set();
    allKeys.forEach((key) => {
      if (supported.test(key)) return;
      const pair = /^markCell-(\d+_\d+)_/.exec(key);
      if (pair) uncertainPairs.add(pair[1]);
    });
    const cells = [];
    const keys = [];
    allKeys.forEach((key, index) => {
      if (!supported.test(key)) return;
      const pair = /^markCell-(\d+_\d+)_/.exec(key)[1];
      if (uncertainPairs.has(pair)) return;
      cells.push(allCells[index]);
      keys.push(key);
    });
    if (!cells.length) return null;
    // Include excluded keys in the fingerprint, just as the isolated bridge does.
    return { cells, keys, token: location.pathname + location.search + "|" + [...new Set(allKeys)].sort().join("|") };
  }

  function readLessonComments() {
    const unavailable = (reason) => ({ status: "unavailable", reason });
    try {
      const context = commentContext();
      if (!context) return unavailable("C01");
      const pairs = new Map();
      const stores = new Set();
      for (let i = 0; i < context.cells.length; i += 1) {
        const match = context.keys[i].match(/^markCell-(\d+)_(\d+)_(\d+)$/);
        const pair = `${match[1]}_${match[2]}`;
        if (pairs.has(pair) && pairs.get(pair) !== match[3]) return unavailable("C02");
        pairs.set(pair, match[3]);
        const cell = context.cells[i];
        const fiberKeys = Object.getOwnPropertyNames(cell).filter((key) => key.startsWith("__reactFiber$"));
        if (fiberKeys.length !== 1) return unavailable("C03");
        let fiber = cell[fiberKeys[0]];
        let foundStore = false;
        const visited = new Set();
        for (let depth = 0; fiber && depth < 150 && !visited.has(fiber); depth += 1) {
          visited.add(fiber);
          const store = fiber.memoizedProps?.value?.store;
          if (typeof store?.getState === "function") { stores.add(store); foundStore = true; break; }
          fiber = fiber.return;
        }
        if (!foundStore) return unavailable("C04");
      }
      if (stores.size !== 1) return unavailable("C05");
      const store = [...stores][0];
      const slice = store.getState()?.JR_GradeJournal?.journal?.lessonComments;
      if (!Array.isArray(slice?.apiData)) return unavailable("C06");
      if (slice.apiData.length > 20000) return unavailable("C09");
      if (slice.apiError != null) return unavailable("C15");
      if (typeof slice.apiStatus !== "string") return unavailable("C16");
      const previous = commentContexts.get(store);
      if (previous && previous.token !== context.token && previous.data === slice.apiData) return unavailable("C07");
      commentContexts.set(store, { token: context.token, data: slice.apiData });
      const grouped = new Map();
      let totalText = 0;
      for (const record of slice.apiData) {
        if (!Number.isSafeInteger(record?.student_id) || !Number.isSafeInteger(record?.schedule_lesson_id) || typeof record?.comment !== "string") return unavailable("C08");
        if (!pairs.has(`${record.student_id}_${record.schedule_lesson_id}`) || !record.comment.trim()) continue;
        totalText += record.comment.length;
        if (record.comment.length > 10000 || totalText > 1000000) return unavailable("C09");
        const id = String(record.student_id);
        if (!grouped.has(id)) grouped.set(id, new Map());
        const texts = grouped.get(id);
        texts.set(record.comment, (texts.get(record.comment) || 0) + 1);
      }
      if (commentContext()?.token !== context.token) return unavailable("C10");
      const byStudent = Object.fromEntries([...grouped].map(([id, texts]) => [id, [...texts].map(([text, count]) => ({ text, count }))]));
      // The observed cache is not proof of period coverage or server freshness.
      return { status: "partial", byStudent };
    } catch (error) { return unavailable("C14"); }
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window || event.origin !== location.origin || data?.source !== SOURCE || data.type !== "lesson-comments-request" || data.version !== 1 || typeof data.requestId !== "string" || data.requestId.length > 100 || data.subject !== "физическая культура") return;
    window.postMessage({ source: SOURCE, type: "lesson-comments-response", version: 1, requestId: data.requestId, snapshot: readLessonComments() }, location.origin);
  });

  function normalizeUrl(input) {
    try {
      if (typeof input === "string") return input;
      if (input?.url) return String(input.url);
    } catch (error) {}
    return "";
  }

  function isMarksListUrl(url) {
    return String(url || "").includes(MARKS_LIST_PART) || /(^|\/)marks\?/.test(String(url || ""));
  }

  function isAnyMarksUrl(url) {
    return String(url || "").includes(MARKS_ANY_PART) || /(^|\/)marks(\?|$)/.test(String(url || ""));
  }

  function isExtraApiUrl(url) {
    const value = String(url || "");
    return EXTRA_PARTS.some((part) => value.includes(part));
  }

  function isTargetUrl(url) {
    return isAnyMarksUrl(url) || isExtraApiUrl(url);
  }

  function extractMarks(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.marks)) return payload.marks;
    if (Array.isArray(payload?.response)) return payload.response;
    if (Array.isArray(payload?.data?.items)) return payload.data.items;
    if (Array.isArray(payload?.payload?.items)) return payload.payload.items;
    if (Array.isArray(payload?.response?.items)) return payload.response.items;
    if (Array.isArray(payload?.result?.items)) return payload.result.items;
    return [];
  }

  function saveDebugMarks(url, payload) {
    try {
      const marks = extractMarks(payload);
      if (!marks.length) return;
      window.__MESH_HELPER_MARKS_DEBUG__ = {
        loadedAt: Date.now(),
        url: String(url || ""),
        count: marks.length,
        marks,
        byStudent(studentProfileId) {
          const id = Number(studentProfileId);
          return this.marks.filter((mark) => Number(mark?.student_profile_id) === id);
        }
      };
    } catch (error) {}
  }

  function post(type, url, payload) {
    try {
      window.postMessage({ source: SOURCE, type, url: String(url || ""), payload, at: Date.now() }, window.location.origin);
    } catch (error) {}
  }

  function postMarks(url, payload) {
    saveDebugMarks(url, payload);
    post("marks-response", url, payload);
    post("api-response", url, payload);
  }

  function postMutation(url, payload) {
    post("marks-mutated", url, payload || {});
  }

  function readJsonSafely(response, url, kind) {
    try {
      if (!response || response.status >= 400) return;
      response.clone().json().then((payload) => {
        if (kind === "marks") postMarks(url, payload);
        else if (kind === "api") post("api-response", url, payload);
        else postMutation(url, payload);
      }).catch(() => {});
    } catch (error) {}
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function meshHelperFetchHook(input, init) {
      const url = normalizeUrl(input);
      if (!isTargetUrl(url)) return originalFetch.apply(this, arguments);
      const method = String(init?.method || input?.method || "GET").toUpperCase();
      return originalFetch.apply(this, arguments).then((response) => {
        try {
          if (isMarksListUrl(url) && method === "GET") readJsonSafely(response, url, "marks");
          else if (method === "GET" && isExtraApiUrl(url)) readJsonSafely(response, url, "api");
          else if (method !== "GET" && isAnyMarksUrl(url)) readJsonSafely(response, url, "mutation");
        } catch (error) {}
        return response;
      });
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (typeof OriginalXHR === "function") {
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;
    OriginalXHR.prototype.open = function meshHelperXhrOpen(method, url) {
      this.__meshHelperUrl = url;
      this.__meshHelperMethod = String(method || "GET").toUpperCase();
      return originalOpen.apply(this, arguments);
    };
    OriginalXHR.prototype.send = function meshHelperXhrSend() {
      if (!isTargetUrl(this.__meshHelperUrl)) return originalSend.apply(this, arguments);
      this.addEventListener("load", function () {
        try {
          const url = this.__meshHelperUrl;
          const method = this.__meshHelperMethod || "GET";
          if (!isTargetUrl(url) || this.status >= 400) return;
          const payload = this.responseText ? JSON.parse(this.responseText) : {};
          if (isMarksListUrl(url) && method === "GET") postMarks(url, payload);
          else if (method === "GET" && isExtraApiUrl(url)) post("api-response", url, payload);
          else if (method !== "GET" && isAnyMarksUrl(url)) postMutation(url, payload);
        } catch (error) {}
      });
      return originalSend.apply(this, arguments);
    };
  }
})();

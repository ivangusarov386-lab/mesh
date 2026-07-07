(() => {
  if (window.__meshHelperApiExportClickGuardInstalled) return;
  window.__meshHelperApiExportClickGuardInstalled = true;

  const BUTTON_ID = "mh-class-download-btn";
  const STATUS_ID = "mh-class-export-status";

  const setStatus = (text, tone = "warn") => {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = text;
    el.dataset.tone = tone;
  };

  const store = () => window.__MESH_HELPER_API_LOADER_V2__ || {};
  const bridge = () => window.__MESH_HELPER_API_EXPORT_BRIDGE__ || null;

  async function run(button) {
    const apiBridge = bridge();
    if (!apiBridge || typeof apiBridge.prepareWithApiV2 !== "function") {
      setStatus("API bridge не найден. Старый экспорт остановлен для диагностики.", "warn");
      console.warn("[МЭШ helper][click-guard] API bridge not found");
      return;
    }

    setStatus("API-загрузка МЭШ запущена через click-guard…", "warn");
    console.log("[МЭШ helper][click-guard] start", store().stats || {});

    const ready = await apiBridge.prepareWithApiV2(button);
    console.log("[МЭШ helper][click-guard] ready", ready, store().stats || {}, store().errors || []);

    if (!ready) {
      setStatus("API-загрузка не собрала полные данные. Смотри консоль: __MESH_HELPER_API_LOADER_V2__", "warn");
      return;
    }

    button.dataset.apiV2Ready = "1";
    setStatus("API-данные готовы. Повторно запускаю Excel…", "ok");
    setTimeout(() => button.click(), 100);
  }

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.(`#${BUTTON_ID}`);
    if (!button) return;

    if (button.dataset.apiV2Ready === "1") {
      button.dataset.apiV2Ready = "0";
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();

    if (button.dataset.apiV2GuardLoading === "1") return;
    button.dataset.apiV2GuardLoading = "1";
    run(button).finally(() => {
      button.dataset.apiV2GuardLoading = "0";
    });
  }, true);

  console.log("[МЭШ helper][click-guard] installed");
})();

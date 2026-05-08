(() => {
  const STORAGE_KEY = "highlightLowGrades";
  const MIGRATION_KEY = "highlightLowGradesDefaultOn129";

  chrome.storage.sync.get([MIGRATION_KEY], (data) => {
    if (data[MIGRATION_KEY] === true) return;

    chrome.storage.sync.set({
      [STORAGE_KEY]: true,
      [MIGRATION_KEY]: true
    }, () => {
      window.__MESH_HELPER_HIGHLIGHT_LOW_ENABLED__ = true;
    });
  });
})();

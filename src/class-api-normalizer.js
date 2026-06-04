(() => {
  if (window.__meshHelperClassApiNormalizerInstalled) return;
  window.__meshHelperClassApiNormalizerInstalled = true;

  function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function looksLikeMark(value) {
    if (!isPlainObject(value)) return false;
    return Boolean(
      value.id ||
      value.mark_id ||
      value.markId ||
      value.name ||
      value.value ||
      value.mark ||
      value.date ||
      value.student_profile_id ||
      value.studentProfileId ||
      value.student_profile ||
      value.studentProfile
    );
  }

  function flattenList(value) {
    const result = [];

    const walk = (item) => {
      if (Array.isArray(item)) {
        item.forEach(walk);
        return;
      }

      if (!isPlainObject(item)) return;

      const numericKeys = Object.keys(item).filter((key) => /^\d+$/.test(key));
      if (!looksLikeMark(item) && numericKeys.length) {
        numericKeys
          .sort((a, b) => Number(a) - Number(b))
          .forEach((key) => walk(item[key]));
        return;
      }

      result.push(item);
    };

    walk(value);
    return result;
  }

  function normalizeStore() {
    const store = window.__MESH_HELPER_API__;
    if (!store || typeof store !== "object") return;

    ["marks", "studentProfiles", "averageMarks", "finalMarks", "groups", "periods"].forEach((key) => {
      if (Array.isArray(store[key])) store[key] = flattenList(store[key]);
    });

    if (window.__MESH_HELPER_MARKS__?.marks) {
      window.__MESH_HELPER_MARKS__.marks = flattenList(window.__MESH_HELPER_MARKS__.marks);
      window.__MESH_HELPER_MARKS__.count = window.__MESH_HELPER_MARKS__.marks.length;
    }
  }

  window.addEventListener("mesh-helper-api-updated", normalizeStore);
  window.addEventListener("mesh-helper-marks-updated", normalizeStore);
  setInterval(normalizeStore, 1000);
  normalizeStore();
})();
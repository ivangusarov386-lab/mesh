(() => {
  let timer = null;

  function cleanText(value) {
    return String(value || "")
      .replace(/\s*·\s*marks пойманы/g, "")
      .replace(/\s*marks пойманы/g, "")
      .trim();
  }

  function cleanPanel() {
    const panel = document.getElementById("mesh-helper-panel");
    if (!panel) return;

    const summary = panel.querySelector("#mh-summary");
    if (summary) summary.textContent = cleanText(summary.textContent);

    panel.querySelectorAll(".mh-count").forEach((el) => {
      let html = el.innerHTML || "";
      html = html
        .replace(/<br\s*\/?>\s*<span[^>]*>\s*API оценок:[\s\S]*?<\/span>/gi, "")
        .replace(/<br\s*\/?>\s*API оценок:[\s\S]*?(?=<br|$)/gi, "")
        .replace(/API оценок:[\s\S]*?(?=<br|$)/gi, "");
      el.innerHTML = html;
    });
  }

  function scheduleClean() {
    clearTimeout(timer);
    timer = setTimeout(cleanPanel, 80);
  }

  new MutationObserver(scheduleClean).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cleanPanel, { once: true });
  } else {
    cleanPanel();
  }

  setInterval(cleanPanel, 1000);
})();

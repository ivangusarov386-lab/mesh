(() => {
  const LAST_PROBLEMS_KEY = "meshHelperLastProblems";

  const DEFAULT_HEADER = [
    "Директору школы",
    "от учителя",
    "",
    "СЛУЖЕБНАЯ ЗАПИСКА",
    "",
    "Довожу до Вашего сведения, что по результатам текущего контроля успеваемости у следующих обучающихся выявлен риск академической задолженности (низкий средний балл и/или высокий процент пропусков без уважительной причины):"
  ].join("\n");

  const DEFAULT_FOOTER = [
    "Прошу принять меры в соответствии с компетенцией (уведомление родителей (законных представителей), проведение дополнительных занятий, постановка на внутришкольный контроль).",
    "",
    "Дата: ____________",
    "Подпись: ____________"
  ].join("\n");

  function getStorage(key) {
    return new Promise((resolve) => chrome.storage.local.get(key, (result) => resolve(result?.[key])));
  }

  function groupByClass(problems) {
    const groups = new Map();
    problems.forEach((problem, index) => {
      const key = problem.classLabel || "?";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...problem, index });
    });
    return groups;
  }

  function renderList(problems) {
    const list = document.getElementById("memo-list");
    list.innerHTML = "";
    const groups = groupByClass(problems);
    const sortedKeys = [...groups.keys()].sort((a, b) => String(a).localeCompare(String(b), "ru"));

    sortedKeys.forEach((key) => {
      const items = groups.get(key);
      const groupEl = document.createElement("div");
      groupEl.className = "memo-group";

      const header = document.createElement("div");
      header.className = "memo-group-header";
      header.textContent = key === "?" ? "Без класса" : `Класс ${key}`;
      groupEl.appendChild(header);

      items.forEach((item) => {
        const row = document.createElement("label");
        row.className = "memo-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = item.academicRisk === "Да";
        checkbox.dataset.index = String(item.index);
        const span = document.createElement("span");
        span.textContent = `${item.student} — ${item.label} (${item.value})`;
        row.appendChild(checkbox);
        row.appendChild(span);
        groupEl.appendChild(row);
      });

      list.appendChild(groupEl);
    });
  }

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function textToParagraphs(text) {
    return String(text ?? "").split("\n").map((line) => {
      if (!line.trim()) return "<w:p/>";
      return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;
    }).join("");
  }

  function tableCellXml(text, bold) {
    const runProps = bold ? "<w:rPr><w:b/></w:rPr>" : "";
    const paraProps = bold ? "<w:pPr><w:rPr><w:b/></w:rPr></w:pPr>" : "";
    return `<w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/></w:tcBorders></w:tcPr><w:p>${paraProps}<w:r>${runProps}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p></w:tc>`;
  }

  function buildTable(rows) {
    const header = ["№", "Класс", "ФИО", "Проблема", "Значение"];
    const headerRow = `<w:tr>${header.map((h) => tableCellXml(h, true)).join("")}</w:tr>`;
    const bodyRows = rows.map((row, index) => {
      const cells = [index + 1, row.classLabel, row.student, row.label, row.value];
      return `<w:tr>${cells.map((cell) => tableCellXml(cell, false)).join("")}</w:tr>`;
    }).join("");
    const gridCols = header.map(() => "<w:gridCol/>").join("");
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid>${gridCols}</w:tblGrid>${headerRow}${bodyRows}</w:tbl>`;
  }

  function documentXml(headerText, rows, footerText) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${textToParagraphs(headerText)}
<w:p/>
${buildTable(rows)}
<w:p/>
${textToParagraphs(footerText)}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;
  }

  function contentTypesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  }

  function rootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  }

  function docRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;
  }

  function crc32(str) {
    const bytes = new TextEncoder().encode(str);
    let crc = -1;
    for (let i = 0; i < bytes.length; i += 1) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j += 1) {
        crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
      }
    }
    return (crc ^ -1) >>> 0;
  }

  function u16(v) { return [v & 255, (v >>> 8) & 255]; }
  function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }

  function zip(files) {
    const encoder = new TextEncoder();
    const local = [];
    const central = [];
    let offset = 0;

    files.forEach((file) => {
      const name = encoder.encode(file.name);
      const data = encoder.encode(file.content);
      const crc = crc32(file.content);

      const localHeader = new Uint8Array([
        ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)
      ]);
      local.push(localHeader, name, data);

      const centralHeader = new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
        ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)
      ]);
      central.push(centralHeader, name);

      offset += localHeader.length + name.length + data.length;
    });

    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(centralSize), ...u32(offset), ...u16(0)
    ]);

    return new Blob([...local, ...central, end], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
  }

  function downloadDocx(filename, headerText, rows, footerText) {
    const files = [
      { name: "[Content_Types].xml", content: contentTypesXml() },
      { name: "_rels/.rels", content: rootRelsXml() },
      { name: "word/document.xml", content: documentXml(headerText, rows, footerText) },
      { name: "word/_rels/document.xml.rels", content: docRelsXml() }
    ];

    const blob = zip(files);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function init() {
    const data = await getStorage(LAST_PROBLEMS_KEY);
    const problems = data?.problems || [];

    if (!problems.length) {
      document.getElementById("memo-empty").style.display = "block";
      return;
    }

    document.getElementById("memo-content").style.display = "block";
    document.getElementById("memo-header").value = DEFAULT_HEADER;
    document.getElementById("memo-footer").value = DEFAULT_FOOTER;
    renderList(problems);

    document.getElementById("memo-select-all").addEventListener("click", () => {
      document.querySelectorAll("#memo-list input[type=checkbox]").forEach((cb) => { cb.checked = true; });
    });
    document.getElementById("memo-select-none").addEventListener("click", () => {
      document.querySelectorAll("#memo-list input[type=checkbox]").forEach((cb) => { cb.checked = false; });
    });

    document.getElementById("memo-download").addEventListener("click", () => {
      const status = document.getElementById("memo-status");
      const checkedIndexes = [...document.querySelectorAll("#memo-list input[type=checkbox]:checked")]
        .map((cb) => Number(cb.dataset.index));
      const selected = problems.filter((problem, index) => checkedIndexes.includes(index));

      if (!selected.length) {
        status.textContent = "Отметь хотя бы одного ученика.";
        return;
      }

      const headerText = document.getElementById("memo-header").value;
      const footerText = document.getElementById("memo-footer").value;
      const date = new Date().toISOString().slice(0, 10);
      downloadDocx(`sluzhebnaya_zapiska_${date}.docx`, headerText, selected, footerText);
      status.textContent = `Сформировано: ${selected.length} учеников.`;
    });
  }

  init();
})();

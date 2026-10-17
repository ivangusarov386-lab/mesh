(() => {
  if (window.__meshHelperClassWorkbookInstalled) return;
  window.__meshHelperClassWorkbookInstalled = true;

  const STYLE = {
    Default: 0,
    Header: 1,
    BadFinal: 2,
    BadAbsence: 3,
    Highlight: 4
  };

  // ---- Динамическая палитра цветов по предметам (лист «Аналитика») ----
  // ---- Предметов может быть сколько угодно (не только текущие 6-8) — ----
  // ---- подсветить нужно КАЖДЫЙ своим цветом, а не крутить по кругу ----
  // ---- маленький фиксированный набор (иначе 7-й предмет повторил бы ----
  // ---- цвет 1-го). Поэтому цвет не захардкожен списком, а вычисляется ----
  // ---- по формуле HSL — равномерно по кругу оттенков на основании ----
  // ---- общего количества предметов в ЭТОЙ выгрузке, так что любое их ----
  // ---- число получает настолько разные цвета, насколько это возможно. ----
  const FIXED_CELLXFS_COUNT = 5;
  const FIXED_FILLS_COUNT = 6;

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, "0").toUpperCase();
    return `${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }

  // Пастельный, но при этом хорошо различимый тон (в меру светлый, не
  // блёклый) — подобрано так, чтобы чёрный текст поверх оставался читаем.
  function paletteColorHex(index, total) {
    const hue = Math.round((index * 360) / Math.max(total, 1));
    return hslToHex(hue, 55, 86);
  }

  // Имя стиля для блока столбцов предмета №index (из total предметов) —
  // используется вызывающим кодом (admin-collector.js) вместо того, чтобы
  // самому придумывать схему именования.
  function paletteStyleId(index, isHeader) {
    return `Pal${index}${isHeader ? "Header" : ""}`;
  }

  function resolveStyleIndex(styleId) {
    if (Object.prototype.hasOwnProperty.call(STYLE, styleId)) return STYLE[styleId];
    const match = /^Pal(\d+)(Header)?$/.exec(String(styleId || ""));
    if (match) {
      const index = Number(match[1]);
      const isHeader = Boolean(match[2]);
      return FIXED_CELLXFS_COUNT + index * 2 + (isHeader ? 1 : 0);
    }
    return STYLE.Default;
  }

  function sanitize(value) {
    return String(value ?? "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
      .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  }

  function escapeXml(value) {
    return sanitize(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function cleanSheetName(value) {
    return sanitize(value || "Лист")
      .replace(/[\\/:*?\[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || "Лист";
  }

  function colName(index) {
    let n = index + 1;
    let name = "";

    while (n > 0) {
      const rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }

    return name;
  }

  function row(values = [], styleForCell) {
    return {
      values: values.map((value, index) => ({
        value,
        styleId: typeof styleForCell === "function"
          ? styleForCell(value, index)
          : "Default"
      }))
    };
  }

  function formula(expr) {
    return { __formula: String(expr) };
  }

  function isFormulaValue(value) {
    return Boolean(value) && typeof value === "object" && typeof value.__formula === "string";
  }

  function worksheet(name, rows = [], options = {}) {
    return {
      name: cleanSheetName(name),
      rows: Array.isArray(rows) ? rows : [],
      hiddenCols: Array.isArray(options.hiddenCols) ? options.hiddenCols : [],
      dataValidations: Array.isArray(options.dataValidations) ? options.dataValidations : [],
      conditionalFormats: Array.isArray(options.conditionalFormats) ? options.conditionalFormats : [],
      // Список объединений вида "B1:D1" — например, название предмета над тремя
      // столбцами его метрик на листе «Аналитика».
      mergeCells: Array.isArray(options.mergeCells) ? options.mergeCells : [],
      // Строка, с которой начинаются заголовки-фильтры и заморозка — по умолчанию 1-я,
      // но если сверху есть строка-заголовок/сводка (например, в СВОДе или над шапкой
      // листа предмета), реальная шапка таблицы может быть ниже.
      freezeRows: Number.isFinite(options.freezeRows) ? options.freezeRows : 1,
      filterStartRow: Number.isFinite(options.filterStartRow) ? options.filterStartRow : 1
    };
  }

  function cellXml(value, styleId, rowIndex, colIndex) {
    const ref = `${colName(colIndex)}${rowIndex + 1}`;
    const style = resolveStyleIndex(styleId);

    if (isFormulaValue(value)) {
      return `<c r="${ref}" s="${style}"><f>${escapeXml(value.__formula)}</f></c>`;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return `<c r="${ref}" s="${style}"><v>${String(value).replace(",", ".")}</v></c>`;
    }

    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
  }

  // ---- Ширина столбцов по факту содержимого (а не фиксированные цифры) — ----
  // ---- берём самый частый "размер строки" в листе (обычная строка с ----
  // ---- данными/заголовком) и меряем по нему, игнорируя короткие строки- ----
  // ---- баннеры (типа заголовка СВОДа на всю ширину в одной ячейке), ----
  // ---- иначе они раздули бы первый же столбец до своей длины. ----
  function textLength(value) {
    if (isFormulaValue(value)) return 10;
    if (typeof value === "number" && Number.isFinite(value)) return String(value).length;
    return String(value ?? "").length;
  }

  function mostCommonRowLength(rows) {
    const counts = new Map();
    (rows || []).forEach((rowData) => {
      const len = (rowData.values || []).length;
      if (!len) return;
      counts.set(len, (counts.get(len) || 0) + 1);
    });
    let best = 0;
    let bestCount = 0;
    counts.forEach((count, len) => {
      if (count > bestCount) {
        bestCount = count;
        best = len;
      }
    });
    return best;
  }

  function computeColumnWidths(rows, maxCols) {
    const typicalLength = mostCommonRowLength(rows) || maxCols;
    const widths = new Array(maxCols).fill(0);
    (rows || []).forEach((rowData) => {
      const values = rowData.values || [];
      if (values.length !== typicalLength) return;
      values.forEach((cell, colIndex) => {
        if (colIndex >= maxCols) return;
        const len = textLength(cell.value);
        if (len > widths[colIndex]) widths[colIndex] = len;
      });
    });
    return widths.map((len) => Math.max(6, Math.min(50, len + 3)));
  }

  function colsXml(rows, maxCols, hiddenCols) {
    const hiddenSet = new Set(hiddenCols || []);
    const widths = computeColumnWidths(rows, maxCols);
    const parts = [];
    for (let col = 1; col <= maxCols; col += 1) {
      const width = widths[col - 1] || 10;
      const hidden = hiddenSet.has(col) ? ' hidden="1"' : "";
      parts.push(`<col min="${col}" max="${col}" width="${width}" customWidth="1"${hidden}/>`);
    }
    return `<cols>\n${parts.join("\n")}\n</cols>`;
  }

  function dataValidationsXml(list) {
    if (!list || !list.length) return "";
    const items = list.map((dv) => {
      return `<dataValidation type="${dv.type || "list"}" allowBlank="1" sqref="${dv.sqref}"><formula1>${escapeXml(dv.formula1)}</formula1></dataValidation>`;
    }).join("");
    return `<dataValidations count="${list.length}">${items}</dataValidations>`;
  }

  function conditionalFormattingXml(list) {
    if (!list || !list.length) return "";
    return list.map((cf, index) => {
      return `<conditionalFormatting sqref="${cf.sqref}"><cfRule type="expression" dxfId="${cf.dxfId}" priority="${index + 1}"><formula>${escapeXml(cf.formula)}</formula></cfRule></conditionalFormatting>`;
    }).join("");
  }

  function mergeCellsXml(list) {
    if (!list || !list.length) return "";
    const items = list.map((ref) => `<mergeCell ref="${ref}"/>`).join("");
    return `<mergeCells count="${list.length}">${items}</mergeCells>`;
  }

  function sheetXml(sheet) {
    const rowsXml = (sheet.rows || []).map((rowData, rowIndex) => {
      const cells = (rowData.values || []).map((cell, colIndex) => {
        return cellXml(cell.value, cell.styleId, rowIndex, colIndex);
      }).join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");

    const maxCols = Math.max(10, ...(sheet.rows || []).map((rowData) => (rowData.values || []).length));
    const maxRows = Math.max(1, (sheet.rows || []).length);
    const range = `A1:${colName(maxCols - 1)}${maxRows}`;
    const freezeRows = Math.max(0, sheet.freezeRows ?? 1);
    const filterStartRow = Math.max(1, Math.min(sheet.filterStartRow ?? 1, maxRows));
    const filterRange = `A${filterStartRow}:${colName(maxCols - 1)}${maxRows}`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="${range}"/>
<sheetViews>
<sheetView workbookViewId="0">
<pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/>
</sheetView>
</sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${colsXml(sheet.rows, maxCols, sheet.hiddenCols)}
<sheetData>${rowsXml}</sheetData>
<autoFilter ref="${filterRange}"/>
${mergeCellsXml(sheet.mergeCells)}
${conditionalFormattingXml(sheet.conditionalFormats)}
${dataValidationsXml(sheet.dataValidations)}
</worksheet>`;
  }

  function workbookXml(sheets, definedNames = []) {
    const list = sheets.map((sheet, index) => {
      return `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`;
    }).join("");

    const namesXml = (definedNames && definedNames.length)
      ? `<definedNames>${definedNames.map((dn) => `<definedName name="${escapeXml(dn.name)}">${escapeXml(dn.formula)}</definedName>`).join("")}</definedNames>`
      : "";

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${list}</sheets>
${namesXml}
<calcPr fullCalcOnLoad="1"/>
</workbook>`;
  }

  function workbookRelsXml(sheets) {
    const list = sheets.map((sheet, index) => {
      return `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`;
    }).join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${list}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  }

  function rootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  }

  function stylesXml(paletteCount = 0) {
    const safePaletteCount = Math.max(0, paletteCount);
    let paletteFillsXml = "";
    let paletteXfsXml = "";
    for (let i = 0; i < safePaletteCount; i += 1) {
      const hex = paletteColorHex(i, safePaletteCount);
      paletteFillsXml += `<fill><patternFill patternType="solid"><fgColor rgb="FF${hex}"/></patternFill></fill>`;
      const fillId = FIXED_FILLS_COUNT + i;
      paletteXfsXml += `<xf numFmtId="0" fontId="0" fillId="${fillId}" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`;
      paletteXfsXml += `<xf numFmtId="0" fontId="1" fillId="${fillId}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`;
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="10"/><name val="Arial"/></font>
<font><b/><sz val="10"/><name val="Arial"/></font>
</fonts>
<fills count="${FIXED_FILLS_COUNT + safePaletteCount}">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEAF2FF"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFE08A"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFD6D6"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill>
${paletteFillsXml}
</fills>
<borders count="1">
<border><left/><right/><top/><bottom/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${FIXED_CELLXFS_COUNT + safePaletteCount * 2}">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
${paletteXfsXml}
</cellXfs>
<dxfs count="2">
<dxf><fill><patternFill><bgColor rgb="FFFFE08A"/></patternFill></fill></dxf>
<dxf><fill><patternFill><bgColor rgb="FFFFD6D6"/></patternFill></fill></dxf>
</dxfs>
</styleSheet>`;
  }

  function contentTypesXml(sheets) {
    const overrides = sheets.map((sheet, index) => {
      return `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    }).join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${overrides}
</Types>`;
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

  function u16(v) {
    return [v & 255, (v >>> 8) & 255];
  }

  function u32(v) {
    return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  }

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
        ...u32(0x04034b50),
        ...u16(20),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(crc),
        ...u32(data.length),
        ...u32(data.length),
        ...u16(name.length),
        ...u16(0)
      ]);

      local.push(localHeader, name, data);

      const centralHeader = new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(crc),
        ...u32(data.length),
        ...u32(data.length),
        ...u16(name.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset)
      ]);

      central.push(centralHeader, name);

      offset += localHeader.length + name.length + data.length;
    });

    const centralSize = central.reduce((sum, part) => sum + part.length, 0);

    const end = new Uint8Array([
      ...u32(0x06054b50),
      ...u16(0),
      ...u16(0),
      ...u16(files.length),
      ...u16(files.length),
      ...u32(centralSize),
      ...u32(offset),
      ...u16(0)
    ]);

    return new Blob([...local, ...central, end], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  }

  function buildWorkbookBlob(sheets, options = {}) {
    const safeSheets = (sheets || []).filter(Boolean);
    const definedNames = options.definedNames || [];

    const files = [
      {
        name: "[Content_Types].xml",
        content: contentTypesXml(safeSheets)
      },
      {
        name: "_rels/.rels",
        content: rootRelsXml()
      },
      {
        name: "xl/workbook.xml",
        content: workbookXml(safeSheets, definedNames)
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        content: workbookRelsXml(safeSheets)
      },
      {
        name: "xl/styles.xml",
        content: stylesXml(options.paletteCount || 0)
      },
      ...safeSheets.map((sheet, index) => ({
        name: `xl/worksheets/sheet${index + 1}.xml`,
        content: sheetXml(sheet)
      }))
    ];

    return zip(files);
  }

  function downloadWorkbook(filename, sheets, options = {}) {
    const blob = buildWorkbookBlob(sheets, options);
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename.replace(/\.xls$/i, ".xlsx");

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.__MESH_HELPER_CLASS_WORKBOOK__ = {
    row,
    worksheet,
    formula,
    downloadWorkbook,
    buildWorkbookBlob,
    paletteStyleId
  };
})();
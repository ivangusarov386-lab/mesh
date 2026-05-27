(() => {
  if (window.__meshHelperClassWorkbookInstalled) return;
  window.__meshHelperClassWorkbookInstalled = true;

  const STYLE = {
    Default: 0,
    Header: 1,
    BadFinal: 2,
    BadAbsence: 3
  };

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

  function worksheet(name, rows = []) {
    return {
      name: cleanSheetName(name),
      rows: Array.isArray(rows) ? rows : []
    };
  }

  function cellXml(value, styleId, rowIndex, colIndex) {
    const ref = `${colName(colIndex)}${rowIndex + 1}`;
    const style = STYLE[styleId] ?? STYLE.Default;

    if (typeof value === "number" && Number.isFinite(value)) {
      return `<c r="${ref}" s="${style}"><v>${String(value).replace(",", ".")}</v></c>`;
    }

    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
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

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="${range}"/>
<sheetViews>
<sheetView workbookViewId="0">
<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
</sheetView>
</sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>
<col min="1" max="1" width="6" customWidth="1"/>
<col min="2" max="2" width="28" customWidth="1"/>
<col min="3" max="3" width="40" customWidth="1"/>
<col min="4" max="12" width="16" customWidth="1"/>
</cols>
<sheetData>${rowsXml}</sheetData>
<autoFilter ref="${range}"/>
</worksheet>`;
  }

  function workbookXml(sheets) {
    const list = sheets.map((sheet, index) => {
      return `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`;
    }).join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${list}</sheets>
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

  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="10"/><name val="Arial"/></font>
<font><b/><sz val="10"/><name val="Arial"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEAF2FF"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFE08A"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFD6D6"/></patternFill></fill>
</fills>
<borders count="1">
<border><left/><right/><top/><bottom/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
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

  function downloadWorkbook(filename, sheets) {
    const safeSheets = (sheets || []).filter(Boolean);

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
        content: workbookXml(safeSheets)
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        content: workbookRelsXml(safeSheets)
      },
      {
        name: "xl/styles.xml",
        content: stylesXml()
      },
      ...safeSheets.map((sheet, index) => ({
        name: `xl/worksheets/sheet${index + 1}.xml`,
        content: sheetXml(sheet)
      }))
    ];

    const blob = zip(files);
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
    downloadWorkbook
  };
})();
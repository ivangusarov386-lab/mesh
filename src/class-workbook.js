(() => {
  if (window.__meshHelperClassWorkbookInstalled) return;
  window.__meshHelperClassWorkbookInstalled = true;

  function sanitizeXmlText(value) {
    return String(value ?? "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
      .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  }

  function escapeXml(value) {
    return sanitizeXmlText(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function safeStyleId(value) {
    const style = String(value || "Default");
    return /^[A-Za-z][A-Za-z0-9_-]*$/.test(style) ? style : "Default";
  }

  function sheetName(value) {
    const name = sanitizeXmlText(value || "Лист")
      .replace(/[\\/:*?\[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31);
    return escapeXml(name || "Лист");
  }

  function cell(value, styleId = "Default") {
    const numericValue = typeof value === "number" ? value : null;
    const isNumber = Number.isFinite(numericValue);
    const type = isNumber ? "Number" : "String";
    const data = isNumber ? String(numericValue).replace(",", ".") : escapeXml(value);
    return `<Cell ss:StyleID="${safeStyleId(styleId)}"><Data ss:Type="${type}">${data}</Data></Cell>`;
  }

  function row(values = [], styleForCell) {
    const cells = values
      .map((value, index) => cell(value, typeof styleForCell === "function" ? styleForCell(value, index) : "Default"))
      .join("");
    return `<Row>${cells}</Row>`;
  }

  function worksheet(name, rows = []) {
    return `<Worksheet ss:Name="${sheetName(name)}"><Table>${rows.join("")}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>`;
  }

  function borders() {
    return `<Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders>`;
  }

  function workbookXml(sheets = []) {
    const validSheets = sheets.filter(Boolean).join("");
    return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default"><Font ss:FontName="Arial" ss:Size="10"/>${borders()}</Style><Style ss:ID="Header"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#EAF2FF" ss:Pattern="Solid"/>${borders()}</Style><Style ss:ID="BadFinal"><Interior ss:Color="#FFE08A" ss:Pattern="Solid"/><Font ss:Bold="1"/>${borders()}</Style><Style ss:ID="BadAbsence"><Interior ss:Color="#FFD6D6" ss:Pattern="Solid"/><Font ss:Bold="1"/>${borders()}</Style></Styles>${validSheets}</Workbook>`;
  }

  function downloadWorkbook(filename, sheets) {
    const xml = workbookXml(sheets);
    const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.__MESH_HELPER_CLASS_WORKBOOK__ = {
    cell,
    row,
    worksheet,
    downloadWorkbook
  };
})();

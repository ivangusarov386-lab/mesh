(() => {
  if (window.__meshHelperClassWorkbookInstalled) return;
  window.__meshHelperClassWorkbookInstalled = true;

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function sheetName(value) {
    const name = String(value || "Лист")
      .replace(/[\\/:*?\[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return escapeXml(name.slice(0, 31) || "Лист");
  }

  function cell(value, styleId = "Default") {
    const isNumber = typeof value === "number" && Number.isFinite(value);
    const type = isNumber ? "Number" : "String";
    return `<Cell ss:StyleID="${styleId}"><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`;
  }

  function row(values = [], styleForCell) {
    const cells = values.map((value, index) => cell(value, typeof styleForCell === "function" ? styleForCell(value, index) : "Default")).join("");
    return `<Row>${cells}</Row>`;
  }

  function worksheet(name, rows = []) {
    return `<Worksheet ss:Name="${sheetName(name)}"><Table>${rows.join("")}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>`;
  }

  function workbookXml(sheets = []) {
    return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default"><Font ss:FontName="Arial" ss:Size="10"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style><Style ss:ID="Header"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#EAF2FF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style><Style ss:ID="BadFinal"><Interior ss:Color="#FFE08A" ss:Pattern="Solid"/><Font ss:Bold="1"/></Style><Style ss:ID="BadAbsence"><Interior ss:Color="#FFD6D6" ss:Pattern="Solid"/><Font ss:Bold="1"/></Style></Styles>${sheets.join("")}</Workbook>`;
  }

  function downloadWorkbook(filename, sheets) {
    const xml = workbookXml(sheets);
    const blob = new Blob(["\ufeff", xml], { type: "application/vnd.ms-excel;charset=utf-8" });
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

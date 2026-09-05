/**
 * A genuine, styled .xlsx (OOXML spreadsheet) — no dependency. An .xlsx is
 * just a ZIP of XML parts; this writes the minimum set Excel, Google Sheets
 * and LibreOffice all open without a repair prompt, plus enough of
 * `styles.xml` for the export to actually read as a table: bold bordered
 * headers, a full grid, real numeric currency/percent formatting (not
 * pre-formatted text), and sized columns.
 */
import { buildZip } from './zip.js';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** 0 -> A, 25 -> Z, 26 -> AA, ... */
function columnLetter(index: number): string {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

export type XlsxCellStyle = 'title' | 'header' | 'label' | 'text' | 'currency' | 'percent' | 'int';

/** Index into `CELL_XFS` below — the only thing a caller needs to know about. */
const STYLE_INDEX: Record<XlsxCellStyle, number> = {
  title: 1, header: 2, label: 3, text: 4, currency: 5, percent: 6, int: 7,
};

export interface XlsxCell {
  value: string | number;
  style?: XlsxCellStyle;
  /** Only meaningful on a title/label cell: span this many columns. */
  colSpan?: number;
}
export type XlsxRow = XlsxCell[];

export interface XlsxSheet {
  name: string;
  rows: XlsxRow[];
  /** Character widths, one per column. */
  columnWidths: number[];
}

function cellXml(colIndex: number, rowIndex: number, cell: XlsxCell): string {
  const ref = `${columnLetter(colIndex)}${rowIndex}`;
  const s = STYLE_INDEX[cell.style ?? 'text'];
  const { value } = cell;
  if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${s}"/>`;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}" s="${s}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/**
 * Style indices (must match `STYLE_INDEX` above, 1-based since 0 is Excel's own default):
 *   1 title    — bold 14pt, no border
 *   2 header   — bold, light-blue fill, thin border all round, wrapped
 *   3 label    — bold, no fill, no border (section headings)
 *   4 text     — plain, thin border (keeps the whole table gridded)
 *   5 currency — "$"#,##0.00, thin border
 *   6 percent  — 0.0"%", thin border (values are already 0-100, not a 0-1 fraction)
 *   7 int      — #,##0, thin border
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="[$$-409]#,##0.00"/>
    <numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/>
    <numFmt numFmtId="166" formatCode="#,##0"/>
  </numFmts>
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="14"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF1E3A5F"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9E6F5"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFB9C6D6"/></left>
      <right style="thin"><color rgb="FFB9C6D6"/></right>
      <top style="thin"><color rgb="FFB9C6D6"/></top>
      <bottom style="thin"><color rgb="FFB9C6D6"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment wrapText="1" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function worksheetXml(sheet: XlsxSheet): string {
  const cols = sheet.columnWidths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const rowsXml = sheet.rows
    .map((row, i) => {
      const rowNum = i + 1;
      let colCursor = 0;
      const cells = row
        .map((cell) => {
          const xml = cellXml(colCursor, rowNum, cell);
          colCursor += cell.colSpan ?? 1;
          return xml;
        })
        .join('');
      return `<row r="${rowNum}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${cols}</cols>
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;
}

/** Builds a valid, styled single-sheet .xlsx. */
export function buildSimpleXlsx(sheet: XlsxSheet): Buffer {
  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(ROOT_RELS, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml(sheet.name), 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(WORKBOOK_RELS, 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(STYLES, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(worksheetXml(sheet), 'utf8') },
  ]);
}

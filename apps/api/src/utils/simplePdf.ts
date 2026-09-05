/**
 * A minimal PDF table-report writer — no dependency.
 *
 * Uses Courier (one of the 14 standard PDF fonts, guaranteed present in every
 * viewer) because it is fixed-pitch: every glyph is exactly 0.6em wide, which
 * makes column alignment a matter of counting characters rather than needing
 * real font metrics. Text is encoded as WinAnsi (Windows-1252), which is what
 * the standard fonts render under by default — feeding them raw UTF-8 bytes
 * (the previous bug here) corrupts anything outside ASCII, e.g. an em dash
 * turning into "â€"".
 */

/** Unicode code points that WinAnsi (cp1252) maps differently from Latin-1 in the 0x80-0x9F byte range. */
const WIN1252_SPECIALS: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

function toWinAnsiByte(codePoint: number): number {
  if (codePoint < 0x80) return codePoint;
  if (WIN1252_SPECIALS[codePoint] !== undefined) return WIN1252_SPECIALS[codePoint];
  if (codePoint <= 0xff) return codePoint; // Latin-1 supplement matches WinAnsi outside 0x80-0x9F
  return 0x3f; // '?' — anything truly outside Latin-1 can't render in a standard PDF font anyway
}

/** Escapes PDF string-literal syntax, then encodes to WinAnsi bytes — never raw UTF-8. */
function encodePdfString(s: string): Buffer {
  const escaped = s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const bytes = Buffer.alloc(escaped.length);
  for (let i = 0; i < escaped.length; i++) bytes[i] = toWinAnsiByte(escaped.charCodeAt(i));
  return bytes;
}

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 9;
const CHAR_WIDTH = BODY_SIZE * 0.6; // Courier is fixed-pitch at 0.6em
const LINE_HEIGHT = 13;
const TITLE_SIZE = 18;

type Font = 'regular' | 'bold' | 'title';
const FONT_NAME: Record<Font, string> = { regular: 'F1', bold: 'F2', title: 'F3' };
const FONT_RESOURCE: Record<Font, string> = {
  regular: '/Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding',
  bold: '/Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding',
  title: '/Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding',
};

export interface TableColumn {
  header: string;
  width: number; // characters
  align?: 'left' | 'right';
}

function ascii(s: string): Buffer {
  return Buffer.from(s, 'latin1');
}

/** Builds up a multi-page content stream, tracking the Y cursor and starting new pages as needed. */
class PdfDocument {
  private pages: Buffer[][] = [[]];
  private y = PAGE_HEIGHT - MARGIN;

  private ops(): Buffer[] {
    return this.pages[this.pages.length - 1];
  }

  private ensureSpace(height: number): void {
    if (this.y - height < MARGIN) {
      this.pages.push([]);
      this.y = PAGE_HEIGHT - MARGIN;
    }
  }

  private textOp(x: number, y: number, font: Font, size: number, text: string): void {
    const encoded = encodePdfString(text);
    this.ops().push(
      ascii(`BT /${FONT_NAME[font]} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (`),
      encoded,
      ascii(') Tj ET\n'),
    );
  }

  title(text: string): void {
    this.ensureSpace(TITLE_SIZE + LINE_HEIGHT);
    this.textOp(MARGIN, this.y, 'title', TITLE_SIZE, text);
    this.y -= TITLE_SIZE + 8;
  }

  heading(text: string): void {
    this.ensureSpace(LINE_HEIGHT * 2);
    this.y -= 6;
    this.textOp(MARGIN, this.y, 'bold', BODY_SIZE + 1, text);
    this.y -= LINE_HEIGHT;
  }

  text(line: string, font: Font = 'regular'): void {
    this.ensureSpace(LINE_HEIGHT);
    this.textOp(MARGIN, this.y, font, BODY_SIZE, line);
    this.y -= LINE_HEIGHT;
  }

  space(): void {
    this.y -= LINE_HEIGHT * 0.6;
  }

  /** A horizontal rule spanning the content width, at the current Y. */
  private ruleAt(y: number): void {
    this.ops().push(ascii(`0.6 w ${MARGIN.toFixed(2)} ${y.toFixed(2)} m ${(MARGIN + CONTENT_WIDTH).toFixed(2)} ${y.toFixed(2)} l S\n`));
  }

  /** A bordered, monospaced table — column widths are in characters, so alignment needs no font metrics. */
  table(columns: TableColumn[], rows: (string | number)[][]): void {
    const colX: number[] = [];
    let cursor = MARGIN;
    for (const col of columns) {
      colX.push(cursor);
      cursor += col.width * CHAR_WIDTH;
    }
    const tableWidth = cursor - MARGIN;

    const drawRow = (cells: string[], font: Font) => {
      cells.forEach((cell, i) => {
        const col = columns[i];
        const maxChars = col.width;
        const truncated = cell.length > maxChars ? cell.slice(0, Math.max(0, maxChars - 1)) + '…' : cell;
        const x = col.align === 'right' ? colX[i] + (maxChars - truncated.length) * CHAR_WIDTH : colX[i];
        this.textOp(x, this.y, font, BODY_SIZE, truncated);
      });
    };

    this.ensureSpace(LINE_HEIGHT * 2);
    const top = this.y + LINE_HEIGHT * 0.75;
    this.ruleAt(top);
    drawRow(columns.map((c) => c.header), 'bold');
    this.y -= LINE_HEIGHT;
    this.ruleAt(this.y + LINE_HEIGHT * 0.75);

    for (const row of rows) {
      this.ensureSpace(LINE_HEIGHT * 1.5);
      // A page break mid-table repeats the header so the columns stay legible.
      if (this.y > PAGE_HEIGHT - MARGIN - 1) {
        const headerTop = this.y + LINE_HEIGHT * 0.75;
        this.ruleAt(headerTop);
        drawRow(columns.map((c) => c.header), 'bold');
        this.y -= LINE_HEIGHT;
        this.ruleAt(this.y + LINE_HEIGHT * 0.75);
      }
      drawRow(row.map((v) => String(v)), 'regular');
      this.y -= LINE_HEIGHT;
    }
    this.ruleAt(this.y + LINE_HEIGHT * 0.75);
    void tableWidth;
    this.y -= 4;
  }

  build(): Buffer {
    const pageCount = this.pages.length;
    const pageObjStart = 3;
    const contentObjStart = pageObjStart + pageCount;
    const fontObjs: Record<Font, number> = {
      regular: contentObjStart + pageCount,
      bold: contentObjStart + pageCount + 1,
      title: contentObjStart + pageCount + 2,
    };
    const totalObjects = contentObjStart + pageCount + 2;

    const objects: Buffer[] = [];
    objects[1] = ascii('<< /Type /Catalog /Pages 2 0 R >>');
    objects[2] = ascii(
      `<< /Type /Pages /Kids [${this.pages.map((_, i) => `${pageObjStart + i} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    );
    this.pages.forEach((_, i) => {
      objects[pageObjStart + i] = ascii(
        `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${fontObjs.regular} 0 R /F2 ${fontObjs.bold} 0 R /F3 ${fontObjs.title} 0 R >> >> ` +
          `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Contents ${contentObjStart + i} 0 R >>`,
      );
    });
    this.pages.forEach((pageOps, i) => {
      const stream = Buffer.concat(pageOps);
      objects[contentObjStart + i] = Buffer.concat([ascii(`<< /Length ${stream.length} >>\nstream\n`), stream, ascii('\nendstream')]);
    });
    objects[fontObjs.regular] = ascii(`<< ${FONT_RESOURCE.regular} >>`);
    objects[fontObjs.bold] = ascii(`<< ${FONT_RESOURCE.bold} >>`);
    objects[fontObjs.title] = ascii(`<< ${FONT_RESOURCE.title} >>`);

    const parts: Buffer[] = [ascii('%PDF-1.4\n')];
    const offsets: number[] = new Array(totalObjects + 1).fill(0);
    let running = parts[0].length;
    for (let n = 1; n <= totalObjects; n++) {
      offsets[n] = running;
      const chunk = Buffer.concat([ascii(`${n} 0 obj\n`), objects[n], ascii('\nendobj\n')]);
      parts.push(chunk);
      running += chunk.length;
    }
    const xrefOffset = running;

    let xref = `xref\n0 ${totalObjects + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= totalObjects; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    const trailer = `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.concat([...parts, ascii(xref), ascii(trailer)]);
  }
}

export interface PdfTableSection {
  heading: string;
  columns: TableColumn[];
  rows: (string | number)[][];
}

export interface PdfReport {
  title: string;
  summary: [string, string][];
  sections: PdfTableSection[];
}

/** Builds a titled report: a two-column summary block, then one bordered table per section. */
export function buildSimplePdf(report: PdfReport): Buffer {
  const doc = new PdfDocument();
  doc.title(report.title);
  doc.space();
  for (const [label, value] of report.summary) {
    doc.text(`${label.padEnd(24)}${value}`);
  }
  for (const section of report.sections) {
    doc.space();
    doc.heading(section.heading);
    doc.table(section.columns, section.rows);
  }
  return doc.build();
}

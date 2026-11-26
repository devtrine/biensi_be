const xlsx = require('xlsx');

const CELL_KEY_REGEX = /^([A-Z]+)(\d+)$/;

const decodeColIndex = (colLetters) => {
  let idx = 0;
  for (let i = 0; i < colLetters.length; i++) {
    idx = idx * 26 + (colLetters.charCodeAt(i) - 64);
  }
  return idx - 1;
};

/**
 * Menentukan apakah sel Excel memiliki nilai yang bermakna (bukan sel kosong/spasi sisa format).
 * Sel error formula (t === 'e') tetap dianggap bermakna agar validator dapat mendeteksinya.
 */
const isMeaningfulCell = (cell) => {
  if (!cell || cell.t === 'z') return false;
  if (cell.t === 'e') return true;
  const val = cell.v !== undefined ? cell.v : cell.w;
  if (val === undefined || val === null) return false;
  if (typeof val === 'number') return !Number.isNaN(val);
  if (typeof val === 'string') {
    return val.replace(/\u00A0/g, ' ').trim() !== '';
  }
  return true;
};

/**
 * Memangkas sel hantu (ghost cells / spasi kosong / sel nyasar di baris 1 juta)
 * dan mempersempit `!ref` worksheet ke rentang data aktual agar SheetJS tidak
 * mengalokasikan ratusan ribu baris kosong di RAM.
 */
const trimWorksheetRange = (sheet) => {
  if (!sheet || sheet._trimmed) return sheet;

  const rowCellKeys = new Map();
  const colCellKeys = new Map();

  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!')) continue;
    const match = CELL_KEY_REGEX.exec(key);
    if (!match) continue;

    if (!isMeaningfulCell(sheet[key])) {
      delete sheet[key];
      continue;
    }

    const colIdx = decodeColIndex(match[1]);
    const rowIdx = parseInt(match[2], 10) - 1;

    if (!rowCellKeys.has(rowIdx)) rowCellKeys.set(rowIdx, []);
    rowCellKeys.get(rowIdx).push(key);

    if (!colCellKeys.has(colIdx)) colCellKeys.set(colIdx, []);
    colCellKeys.get(colIdx).push(key);
  }

  if (rowCellKeys.size === 0) {
    delete sheet['!ref'];
    Object.defineProperty(sheet, '_trimmed', { value: true, configurable: true });
    return sheet;
  }

  const sortedRows = Array.from(rowCellKeys.keys()).sort((a, b) => a - b);
  let maxRow = sortedRows[sortedRows.length - 1];

  // Pangkas sel nyasar di akhir sheet setelah >1.000 baris kosong berturut-turut
  for (let i = 1; i < sortedRows.length; i++) {
    if (sortedRows[i] - sortedRows[i - 1] > 1000) {
      const trailingRows = sortedRows.slice(i);
      const isStrayTail =
        trailingRows.length <= 5 &&
        trailingRows.every((r) => (rowCellKeys.get(r)?.length || 0) <= 3);

      if (isStrayTail) {
        for (const r of trailingRows) {
          for (const k of rowCellKeys.get(r) || []) {
            delete sheet[k];
          }
          rowCellKeys.delete(r);
        }
        maxRow = sortedRows[i - 1];
      }
      break;
    }
  }

  // Hitung ulang kolom terisi setelah penghapusan baris nyasar
  const activeColKeys = new Map();
  for (const [cIdx, keys] of colCellKeys.entries()) {
    const remaining = keys.filter((k) => Object.prototype.hasOwnProperty.call(sheet, k));
    if (remaining.length > 0) {
      activeColKeys.set(cIdx, remaining);
    }
  }

  const sortedCols = Array.from(activeColKeys.keys()).sort((a, b) => a - b);
  if (sortedCols.length === 0) {
    delete sheet['!ref'];
    Object.defineProperty(sheet, '_trimmed', { value: true, configurable: true });
    return sheet;
  }

  let maxCol = sortedCols[sortedCols.length - 1];

  // Pangkas kolom nyasar di ujung kanan setelah >50 kolom kosong berturut-turut
  for (let i = 1; i < sortedCols.length; i++) {
    if (sortedCols[i] - sortedCols[i - 1] > 50) {
      const trailingCols = sortedCols.slice(i);
      const isStrayColTail =
        trailingCols.length <= 3 &&
        trailingCols.every((c) => (activeColKeys.get(c)?.length || 0) <= 3);

      if (isStrayColTail) {
        for (const c of trailingCols) {
          for (const k of activeColKeys.get(c) || []) {
            delete sheet[k];
          }
          activeColKeys.delete(c);
        }
        maxCol = sortedCols[i - 1];
      }
      break;
    }
  }

  let origStartRow = 0;
  let origStartCol = 0;
  if (sheet['!ref']) {
    try {
      const decoded = xlsx.utils.decode_range(sheet['!ref']);
      origStartRow = decoded.s.r;
      origStartCol = decoded.s.c;
    } catch (_) {
      origStartRow = 0;
      origStartCol = 0;
    }
  }

  const startRow = Math.min(origStartRow, sortedRows[0]);
  const startCol = Math.min(origStartCol, sortedCols[0]);

  sheet['!ref'] = xlsx.utils.encode_range({
    s: { r: startRow, c: startCol },
    e: { r: maxRow, c: maxCol }
  });

  Object.defineProperty(sheet, '_trimmed', { value: true, configurable: true });
  return sheet;
};

/**
 * Membaca workbook Excel secara hemat memori (atau menggunakan ulang workbook yang sudah di-parse)
 * dan memangkas `!ref` seluruh sheet untuk mencegah lonjakan RAM akibat ghost rows/cols.
 */
const readWorkbookSafe = (filePathOrWorkbook, options = {}) => {
  if (
    filePathOrWorkbook &&
    typeof filePathOrWorkbook === 'object' &&
    Array.isArray(filePathOrWorkbook.SheetNames)
  ) {
    if (!filePathOrWorkbook._trimmed && filePathOrWorkbook.Sheets) {
      for (const name of filePathOrWorkbook.SheetNames) {
        trimWorksheetRange(filePathOrWorkbook.Sheets[name]);
      }
      Object.defineProperty(filePathOrWorkbook, '_trimmed', { value: true, configurable: true });
    }
    return filePathOrWorkbook;
  }

  const workbook = xlsx.readFile(filePathOrWorkbook, {
    cellHTML: false,
    cellFormula: false,
    cellStyles: false,
    sheetRows: 50000,
    ...options
  });

  if (workbook && Array.isArray(workbook.SheetNames) && workbook.Sheets) {
    for (const name of workbook.SheetNames) {
      trimWorksheetRange(workbook.Sheets[name]);
    }
    Object.defineProperty(workbook, '_trimmed', { value: true, configurable: true });
  }

  return workbook;
};

/**
 * Membaca sejumlah baris & kolom awal saja (misal untuk deteksi header/sheet)
 * tanpa mengekspansi seluruh worksheet ke RAM.
 */
const peekSheetMatrix = (sheet, maxRows = 10, maxCols = 60) => {
  if (!sheet || !sheet['!ref']) return [];
  const orig = xlsx.utils.decode_range(sheet['!ref']);
  const boundedRange = {
    s: orig.s,
    e: {
      r: Math.min(orig.e.r, orig.s.r + Math.max(0, maxRows - 1)),
      c: Math.min(orig.e.c, orig.s.c + Math.max(0, maxCols - 1))
    }
  };
  return xlsx.utils.sheet_to_json(sheet, { header: 1, range: boundedRange });
};

/**
 * Konversi worksheet yang sudah dipangkas ke array 2D.
 */
const sheetToMatrix = (sheet) => {
  if (!sheet) return [];
  trimWorksheetRange(sheet);
  if (!sheet['!ref']) return [];
  return xlsx.utils.sheet_to_json(sheet, { header: 1 });
};

/**
 * Konversi worksheet yang sudah dipangkas ke array objek mulai dari baris header tertentu.
 */
const sheetToObjects = (sheet, headerRowIdx = 0) => {
  if (!sheet) return [];
  trimWorksheetRange(sheet);
  if (!sheet['!ref']) return [];
  return xlsx.utils.sheet_to_json(sheet, { range: headerRowIdx });
};

module.exports = {
  isMeaningfulCell,
  trimWorksheetRange,
  readWorkbookSafe,
  peekSheetMatrix,
  sheetToMatrix,
  sheetToObjects
};

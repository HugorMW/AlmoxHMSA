import { Platform } from 'react-native';

type ExcelRowValue = string | number | boolean | null | undefined;

export type ExcelRow = Record<string, ExcelRowValue>;

function sanitizeFileName(fileName: string) {
  const normalized = fileName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '_');

  return normalized.endsWith('.xlsx') ? normalized : `${normalized}.xlsx`;
}

function sanitizeSheetName(sheetName: string) {
  const normalized = sheetName.trim().replace(/[:\\/?*\[\]]/g, ' ');
  return normalized.slice(0, 31) || 'Planilha';
}

function computeColumnWidths(rows: ExcelRow[]) {
  if (rows.length === 0) {
    return [];
  }

  const headers = Object.keys(rows[0]);
  return headers.map((header) => {
    const widestValue = rows.reduce((maxWidth, row) => {
      const value = row[header];
      const nextWidth = String(value ?? '').length;
      return Math.max(maxWidth, nextWidth);
    }, header.length);

    return {
      wch: Math.min(Math.max(widestValue + 2, 12), 42),
    };
  });
}

export function createExportTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}${minutes}`;
}

export async function exportRowsToExcel({
  rows,
  fileName,
  sheetName,
}: {
  rows: ExcelRow[];
  fileName: string;
  sheetName: string;
}) {
  if (rows.length === 0) {
    throw new Error('Nenhum dado disponível para exportar.');
  }

  if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('A exportação Excel está disponível apenas na versão web no momento.');
  }

  const xlsxModule = await import('xlsx');
  const XLSX = (xlsxModule as typeof import('xlsx') & { default?: typeof import('xlsx') }).default ?? xlsxModule;
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  const safeSheetName = sanitizeSheetName(sheetName);
  const fileBuffer = XLSX.write(
    Object.assign(workbook, {
      Sheets: {
        [safeSheetName]: Object.assign(worksheet, { '!cols': computeColumnWidths(rows) }),
      },
      SheetNames: [safeSheetName],
    }),
    { bookType: 'xlsx', type: 'array' }
  );

  const blob = new Blob([fileBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = sanitizeFileName(fileName);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
}

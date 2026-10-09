import { detectDecimalSeparator, parseAmount, type AmountResult, type DecimalSeparator } from "./amounts";
import { detectDayMonthOrder, parseDate, type DateResult, type DayMonthOrder } from "./dates";
import { cellText, isBlankRow, type RawCell, type RawTable } from "./table";

/** Lignes de données (après l'en-tête) avec leur numéro de ligne dans le fichier. */
export type DataRow = { rowNumber: number; cells: RawCell[] };

export function dataRows(table: RawTable, headerRow: number): DataRow[] {
  const out: DataRow[] = [];
  for (let i = headerRow + 1; i < table.rows.length; i++) {
    const cells = table.rows[i];
    if (!isBlankRow(cells)) out.push({ rowNumber: i + 1, cells });
  }
  return out;
}

/** Lecteur de colonnes : séparateur décimal et ordre jour/mois déterminés une fois par colonne. */
export class ColumnReader {
  private decimals = new Map<number, DecimalSeparator | null>();
  private orders = new Map<number, DayMonthOrder>();

  constructor(private readonly rows: readonly DataRow[]) {}

  text(row: DataRow, col: number | null | undefined): string {
    return col == null ? "" : cellText(row.cells[col]);
  }

  amount(row: DataRow, col: number | null | undefined): AmountResult {
    if (col == null) return { ok: true, value: null, empty: true };
    if (!this.decimals.has(col)) {
      this.decimals.set(col, detectDecimalSeparator(this.rows.map((r) => cellText(r.cells[col]))));
    }
    return parseAmount(cellText(row.cells[col]), this.decimals.get(col)!);
  }

  date(row: DataRow, col: number | null | undefined): DateResult {
    if (col == null) return { ok: true, value: null };
    const cell = row.cells[col];
    if (cell instanceof Date) return parseDate(cell);
    if (!this.orders.has(col)) {
      this.orders.set(col, detectDayMonthOrder(this.rows.map((r) => cellText(r.cells[col]))));
    }
    return parseDate(cellText(cell), this.orders.get(col)!);
  }
}

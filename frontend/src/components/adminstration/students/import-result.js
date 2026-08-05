"use client";

import { CircleCheck, CopyX, FileSpreadsheet, TriangleAlert } from "lucide-react";

/**
 * What POST /students/bulk actually returned.
 *
 * The response is { imported, failed, total, errors: [{ row, field, message }] }
 * and two things about it drive this whole component:
 *
 *  1. `failed` counts ERROR ENTRIES, not rows. A row that fails zod validation
 *     on two fields contributes two entries, so `imported + failed` does not
 *     have to equal `total`. The headline count here is therefore the number of
 *     DISTINCT rejected rows, derived from the entries; the raw issue count is
 *     shown next to it rather than passed off as a row count.
 *
 *  2. The backend does not label a rejection as "duplicate" or "invalid" — it
 *     returns the sentence it generated. The created / skipped / invalid split
 *     below is derived from those sentences (see DUPLICATE_PATTERNS), and each
 *     row still shows the server's own wording verbatim underneath, so nothing
 *     depends on the classification being right.
 *
 * The write is ALL-OR-NOTHING for the rows that passed: the controller inserts
 * the survivors in one transaction, so `imported` is never a partial truth.
 */

// "Email is already registered", "studentId is already registered",
// "Duplicate of row 4 in this file" — a row that was skipped because the person
// is already on the roll (or twice in the sheet), as opposed to a bad row.
const DUPLICATE_PATTERNS = [/already registered/i, /^Duplicate of row \d+/i];

function isDuplicate(message) {
  return DUPLICATE_PATTERNS.some((pattern) => pattern.test(String(message || "")));
}

function groupByRow(errors) {
  const rows = new Map();

  for (const issue of errors) {
    if (!rows.has(issue.row)) rows.set(issue.row, []);
    rows.get(issue.row).push(issue);
  }

  return [...rows.entries()]
    .map(([row, issues]) => ({
      row,
      issues,
      duplicate: issues.every((issue) => isDuplicate(issue.message)),
    }))
    .sort((a, b) => a.row - b.row);
}

export default function ImportResult({ fileName, result }) {
  const errors = result.errors ?? [];
  const rejectedRows = groupByRow(errors);

  const skipped = rejectedRows.filter((row) => row.duplicate).length;
  const invalid = rejectedRows.length - skipped;

  return (
    <div className="animate-fade-up">
      <div className="mb-4 grid gap-3.5 min-[720px]:grid-cols-4">
        <div className="border-line bg-surface flex items-center gap-3 rounded-lg border p-4">
          <span className="grid size-[42px] flex-none place-items-center rounded-xl bg-slate-100 text-slate-600">
            <FileSpreadsheet size={21} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-ink truncate text-sm font-bold" title={fileName}>
              {fileName}
            </div>
            <div className="text-muted text-xs">
              {result.total} {result.total === 1 ? "row" : "rows"} read
            </div>
          </div>
        </div>

        <SummaryTile
          value={result.imported}
          label="Created"
          icon={CircleCheck}
          className="border-success-500/25 bg-success-50 text-success-700"
        />

        <SummaryTile
          value={skipped}
          label="Duplicates skipped"
          icon={CopyX}
          className="border-warning-500/30 bg-warning-50 text-warning-700"
        />

        <SummaryTile
          value={invalid}
          label="Invalid"
          icon={TriangleAlert}
          className="border-error-500/25 bg-error-50 text-error-700"
        />
      </div>

      <p className="text-muted m-0 mb-4 text-[13px]">
        <strong className="text-ink font-semibold">
          {result.imported} created · {skipped} skipped · {invalid} invalid
        </strong>{" "}
        out of {result.total} {result.total === 1 ? "row" : "rows"}
        {errors.length > rejectedRows.length && (
          <> · {errors.length} issues across {rejectedRows.length} rows</>
        )}
        . Skipped and invalid rows were not imported — fix them in the sheet and upload again.
      </p>

      {rejectedRows.length > 0 && (
        <div className="border-line bg-surface overflow-hidden rounded-lg border shadow-sm">
          <div className="border-line border-b px-5 py-3.5">
            <h2 className="text-ink m-0 text-sm font-bold">Per-row result</h2>
            <p className="text-muted m-0 mt-0.5 text-xs">
              Row numbers match the row numbers in your spreadsheet.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className={HEAD_CELL}>Row</th>
                  <th className={HEAD_CELL}>Result</th>
                  <th className={HEAD_CELL}>Field</th>
                  <th className={`${HEAD_CELL} pr-5`}>Reason</th>
                </tr>
              </thead>

              <tbody>
                {rejectedRows.map((row) =>
                  row.issues.map((issue, index) => (
                    <tr key={`${row.row}-${issue.field}-${index}`} className="border-line border-t">
                      <td className="font-display py-3 pr-4 pl-5 text-[13px] text-slate-500">
                        {index === 0 ? row.row : ""}
                      </td>

                      <td className="px-4 py-3">
                        {index === 0 && (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold ${
                              row.duplicate
                                ? "bg-warning-50 text-warning-700"
                                : "bg-error-50 text-error-700"
                            }`}
                          >
                            {row.duplicate ? "Skipped" : "Invalid"}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-[12.5px] font-semibold text-slate-600">
                        {issue.field}
                      </td>

                      <td className="py-3 pr-5 pl-4 text-[12.5px] text-error-700">
                        {issue.message}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const HEAD_CELL =
  "px-4 py-3 text-left text-[11.5px] font-bold tracking-[.04em] text-slate-500 uppercase";

function SummaryTile({ value, label, icon: Icon, className }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-4 ${className}`}>
      <span className="grid size-[42px] flex-none place-items-center rounded-xl bg-white">
        <Icon size={21} aria-hidden="true" />
      </span>
      <div>
        <div className="font-display text-[22px] leading-none font-bold">{value}</div>
        <div className="mt-1 text-xs font-semibold">{label}</div>
      </div>
    </div>
  );
}

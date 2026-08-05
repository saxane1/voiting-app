"use client";

import { useRef, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Info, LoaderCircle, TriangleAlert, Upload } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

import { apiErrorMessage, isNetworkError } from "@/utils/api-error";
import { queryKeys } from "@/utils/query-keys";
import {
  IMPORT_ACCEPT,
  IMPORT_COLUMNS,
  IMPORT_MAX_BYTES,
  importStudents,
} from "@/utils/students-api";

import PageHeader from "../page-header";
import ImportResult from "./import-result";

/**
 * Bulk roster import — POST /students/bulk, multipart, field name "file".
 *
 * THE BROWSER DOES NOT READ THE SPREADSHEET. The bytes go straight to the
 * backend, which parses them with exceljs and owns every rule about what a
 * valid row is; this screen only enforces the two things multer would reject at
 * the door anyway (extension and size), so a 6MB file fails instantly instead
 * of after a long upload on a campus connection.
 *
 * The backend's constraints, read from backend/src/middleware/upload.js and
 * student-controllers.js:
 *   · .xlsx only — legacy .xls is refused outright, because exceljs cannot read
 *     it and accepting it would mean taking the upload only to fail it.
 *   · 5MB, one file, memory storage (a roster is PII; nothing touches disk).
 *   · header row must contain name, email, studentId and faculty — matched
 *     case- and punctuation-insensitively, so "Student ID" and "student_id"
 *     both resolve.
 *   · faculty accepts a faculty CODE or a full faculty NAME.
 *   · 5000 data rows maximum.
 */

const TEMPLATE_PATH = "/student-import-template.xlsx";
const MAX_MB = Math.round(IMPORT_MAX_BYTES / (1024 * 1024));

function localFileProblem(file) {
  if (!file.name.toLowerCase().endsWith(IMPORT_ACCEPT)) {
    return `Only ${IMPORT_ACCEPT} files are accepted. If your roster is an older .xls file, open it in Excel and use "Save As" to convert it.`;
  }

  if (file.size > IMPORT_MAX_BYTES) {
    return `That file is ${(file.size / (1024 * 1024)).toFixed(1)}MB — the limit is ${MAX_MB}MB.`;
  }

  return null;
}

export default function StudentImportPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [localError, setLocalError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState(null);

  const importMutation = useMutation({
    mutationFn: (selected) => importStudents(selected, { onProgress: setProgress }),
    onSuccess: (data) => {
      setResult(data);
      setProgress(null);

      if (data.imported > 0) {
        queryClient.invalidateQueries({ queryKey: queryKeys.students });
        toast.success(`${data.imported} student${data.imported === 1 ? "" : "s"} imported`);
      } else {
        toast.error("No students were imported — see the per-row results");
      }
    },
    onError: (error) => {
      setProgress(null);
      setLocalError(
        isNetworkError(error)
          ? "We couldn't reach the server. Check your connection and try again."
          : apiErrorMessage(error, "The file could not be imported. Please try again.")
      );
    },
  });

  function selectFile(selected) {
    if (!selected) return;

    const problem = localFileProblem(selected);

    setLocalError(problem);
    setResult(null);
    setFile(problem ? null : selected);
  }

  function reset() {
    setFile(null);
    setResult(null);
    setLocalError(null);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const isUploading = importMutation.isPending;

  return (
    <>
      <PageHeader
        title="Bulk upload students"
        subtitle="Upload an Excel file — the server validates every row before importing"
        backHref="/adminstration/students"
        backLabel="Students"
      />

      <div className="max-w-[900px] px-4 py-6 min-[920px]:px-7">
        {result ? (
          <>
            <ImportResult fileName={file?.name ?? "Spreadsheet"} result={result} />

            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link
                href="/adminstration/students"
                className="bg-primary-gradient inline-flex items-center gap-2 rounded-[10px] px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-105"
              >
                Back to students
              </Link>

              <button
                type="button"
                onClick={reset}
                className="cursor-pointer rounded-[10px] border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Upload another file
              </button>
            </div>
          </>
        ) : (
          <>
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                selectFile(event.dataTransfer.files?.[0]);
              }}
              className={`block cursor-pointer rounded-xl border-2 border-dashed px-8 py-12 text-center transition ${
                dragging
                  ? "border-indigo-400 bg-indigo-100"
                  : "border-indigo-200 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept={IMPORT_ACCEPT}
                disabled={isUploading}
                onChange={(event) => selectFile(event.target.files?.[0])}
                className="sr-only"
              />

              <span className="bg-surface mx-auto mb-4 grid size-[66px] place-items-center rounded-[19px] text-indigo-600 shadow-sm">
                {file ? (
                  <FileSpreadsheet size={32} aria-hidden="true" />
                ) : (
                  <Upload size={32} aria-hidden="true" />
                )}
              </span>

              <span className="font-display text-ink block text-lg font-bold tracking-[-0.01em]">
                {file ? file.name : "Drop your Excel file here"}
              </span>

              <span className="text-muted mt-1.5 block text-[13.5px]">
                {file
                  ? `${(file.size / 1024).toFixed(0)} KB · click to choose a different file`
                  : `or click to browse · ${IMPORT_ACCEPT} up to ${MAX_MB}MB`}
              </span>
            </label>

            {localError && (
              <p
                role="alert"
                className="animate-fade-up mt-4 flex items-start gap-2 rounded-md bg-error-50 px-3.5 py-3 text-[13px] font-medium text-error-700"
              >
                <TriangleAlert size={16} className="mt-px shrink-0" aria-hidden="true" />
                {localError}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={!file || isUploading}
                onClick={() => {
                  setLocalError(null);
                  importMutation.mutate(file);
                }}
                className="bg-primary-gradient inline-flex cursor-pointer items-center gap-2 rounded-[10px] px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {isUploading ? (
                  <>
                    <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
                    {progress === null || progress === 100
                      ? "Validating rows…"
                      : `Uploading… ${progress}%`}
                  </>
                ) : (
                  <>
                    <Upload size={17} aria-hidden="true" />
                    Upload and validate
                  </>
                )}
              </button>

              {file && !isUploading && (
                <button
                  type="button"
                  onClick={reset}
                  className="cursor-pointer rounded-[10px] border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="mt-5 grid gap-3.5 min-[720px]:grid-cols-2">
              <div className="border-line bg-surface rounded-lg border p-[18px]">
                <div className="mb-2 flex items-center gap-2.5 text-indigo-600">
                  <Info size={18} aria-hidden="true" />
                  <span className="text-ink text-[13.5px] font-bold">Required columns</span>
                </div>

                <p className="text-muted m-0 font-mono text-[12.5px] leading-[1.7]">
                  {IMPORT_COLUMNS.join(" · ")}
                </p>

                <p className="text-muted m-0 mt-2 text-[12.5px] leading-[1.6]">
                  Header spelling is forgiving — <code>Student ID</code> and{" "}
                  <code>student_id</code> both work. <strong>faculty</strong> takes either the
                  faculty code (ENG) or its full name. Up to 5,000 rows.
                </p>
              </div>

              <div className="border-line bg-surface rounded-lg border p-[18px]">
                <div className="mb-2 flex items-center gap-2.5 text-indigo-600">
                  <Download size={18} aria-hidden="true" />
                  <span className="text-ink text-[13.5px] font-bold">Need a template?</span>
                </div>

                <a
                  href={TEMPLATE_PATH}
                  download
                  className="text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Download the blank .xlsx template →
                </a>

                <p className="text-muted m-0 mt-2 text-[12.5px] leading-[1.6]">
                  Its header row matches what the importer expects. Fill in one student per row and
                  upload it here.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

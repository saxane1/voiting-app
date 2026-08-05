import path from "node:path";

import multer from "multer";

import { badRequest } from "../utils/api-response.js";

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

// .xlsx ONLY. The parser (exceljs) cannot read legacy .xls at all, so accepting
// one here would mean taking a 5MB upload and then failing it — rejecting at the
// boundary tells the admin the same thing without moving the bytes.
const ALLOWED_EXTENSIONS = new Set([".xlsx"]);

// Browsers and CLI clients disagree about spreadsheet mimetypes, so the
// extension is the primary gate and the mimetype list stays permissive enough
// not to reject a legitimate upload from curl or an older Excel.
const ALLOWED_MIMETYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "application/octet-stream", // curl / some browsers
  "application/x-msexcel",
  "application/excel",
]);

const excelUpload = multer({
  // memoryStorage: the file never touches disk. A student roster is PII, and a
  // temp file left behind on the host is a disclosure waiting to happen.
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return callback(
        new Error(
          'Only .xlsx files are accepted. If your roster is an older .xls file, open it in Excel and use "Save As" to convert it to .xlsx.'
        )
      );
    }

    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      return callback(new Error(`Unsupported file type "${file.mimetype}"`));
    }

    return callback(null, true);
  },
});

// Multer reports its failures through next(err), which would surface as a 500
// through the global handler. Everything here is caller error, so map it to 400.
export function uploadExcel(req, res, next) {
  excelUpload.single("file")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? `File is larger than the ${MAX_FILE_BYTES / (1024 * 1024)}MB limit`
          : error.code === "LIMIT_UNEXPECTED_FILE"
            ? 'Upload the spreadsheet in a form field named "file"'
            : error.message;

      return badRequest(res, message, "UPLOAD_REJECTED");
    }

    return badRequest(res, error.message, "UPLOAD_REJECTED");
  });
}

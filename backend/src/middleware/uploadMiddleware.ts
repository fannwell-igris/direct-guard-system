import multer from "multer";
import path from "path";
import fs from "fs";
import { ApiError } from "./errorHandler";
import { Request } from "express";

// Ensure upload directory exists on startup
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "employee-photos");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    // Use a timestamp + random suffix to avoid collisions
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, filename);
  },
});

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  const allowed = [".jpg", ".jpeg", ".png", ".webp"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, "Only JPG, PNG, and WebP images are allowed."));
  }
}

export const uploadPhoto = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max
  },
});

export const UPLOAD_DIR_PATH = UPLOAD_DIR;

// ---- Field Visit supporting photo/document (Marketing module, brief section 5) ----
// Same disk-storage pattern as employee photos above, in its own directory,
// with PDF also allowed alongside images since a visit's "supporting
// document" may be a scanned form rather than a photo.

const VISIT_UPLOAD_DIR = path.join(process.cwd(), "uploads", "visit-attachments");
if (!fs.existsSync(VISIT_UPLOAD_DIR)) {
  fs.mkdirSync(VISIT_UPLOAD_DIR, { recursive: true });
}

const visitStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, VISIT_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, filename);
  },
});

function visitFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  const allowed = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, "Only JPG, PNG, WebP, and PDF files are allowed."));
  }
}

export const uploadVisitAttachment = multer({
  storage: visitStorage,
  fileFilter: visitFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max — a scanned document can be bigger than a photo
  },
});

export const VISIT_UPLOAD_DIR_PATH = VISIT_UPLOAD_DIR;

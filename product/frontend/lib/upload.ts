/** Client-side upload validation for scan artifacts. */

export const ACCEPTED_EXTENSIONS = [".xml", ".json", ".csv", ".nessus"] as const;

export const REJECTED_VM_EXTENSIONS = [
  ".vmdk",
  ".vdi",
  ".ova",
  ".iso",
  ".qcow2",
] as const;

export const UNSUPPORTED_FILE_MESSAGE =
  "Unsupported file type.\n" +
  "VAYNE currently accepts scan artifacts\n" +
  "(.xml, .json, .csv, .nessus),\n" +
  "not virtual machine images.";

export type UploadValidationResult =
  | { ok: true; files: File[] }
  | { ok: false; message: string };

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function fileTypeLabel(filename: string): string {
  const ext = extension(filename);
  switch (ext) {
    case ".xml":
      return "XML File";
    case ".json":
      return "JSON File";
    case ".csv":
      return "CSV File";
    case ".nessus":
      return "Nessus Scan";
    default:
      return "File";
  }
}

export function validateUploadFiles(files: FileList | File[]): UploadValidationResult {
  const list = Array.from(files);
  if (!list.length) {
    return { ok: false, message: "Error: choose at least one file" };
  }

  for (const file of list) {
    const ext = extension(file.name);
    if ((REJECTED_VM_EXTENSIONS as readonly string[]).includes(ext)) {
      return { ok: false, message: UNSUPPORTED_FILE_MESSAGE };
    }
    if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
      return { ok: false, message: UNSUPPORTED_FILE_MESSAGE };
    }
  }

  return { ok: true, files: list };
}

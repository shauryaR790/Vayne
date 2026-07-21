/** Client-side upload validation for scan artifacts. */

export const ACCEPTED_EXTENSIONS = [
  ".xml",
  ".json",
  ".csv",
  ".nessus",
  ".html",
  ".htm",
  ".txt",
  ".sarif",
] as const;

/** Extensionless exports named burp_042, nuclei_195, cloud_197, etc. */
export const PARSER_NAME_HINTS = [
  "nmap",
  "nessus",
  "burp",
  "openvas",
  "nuclei",
  "httpx",
  "naabu",
  "katana",
  "qualys",
  "rapid7",
  "nexpose",
  "insightvm",
  "sarif",
  "prowler",
  "scoutsuite",
  "cloud",
  "ldap",
  "metasploit",
  "nessus",
] as const;

export const REJECTED_VM_EXTENSIONS = [
  ".vmdk",
  ".vdi",
  ".ova",
  ".iso",
  ".qcow2",
] as const;

export const UNSUPPORTED_FILE_MESSAGE =
  "Unsupported file type.\n" +
  "VAYNE accepts scanner exports (.xml, .json, .csv, .html, .nessus, .sarif)\n" +
  "or extensionless files named with a tool hint (burp_, nuclei_, nmap_, etc.).\n" +
  "Virtual machine images are not supported.";

export type UploadValidationResult =
  | { ok: true; files: File[] }
  | { ok: false; message: string };

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function isAcceptedScanFilename(name: string): boolean {
  const ext = extension(name);
  if ((REJECTED_VM_EXTENSIONS as readonly string[]).includes(ext)) {
    return false;
  }
  if (ext && (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return true;
  }
  if (!ext) {
    const lower = name.toLowerCase();
    return PARSER_NAME_HINTS.some((hint) => lower.includes(hint));
  }
  return false;
}

export function fileTypeLabel(filename: string): string {
  const ext = extension(filename);
  switch (ext) {
    case ".xml":
      return "XML Scan";
    case ".json":
      return "JSON Scan";
    case ".csv":
      return "CSV Export";
    case ".nessus":
      return "Nessus Scan";
    case ".html":
    case ".htm":
      return "HTML Report";
    case ".sarif":
      return "SARIF";
    default:
      if (!ext && isAcceptedScanFilename(filename)) return "Scanner Export";
      return "Evidence File";
  }
}

export function validateUploadFiles(files: FileList | File[]): UploadValidationResult {
  const list = Array.from(files);
  if (!list.length) {
    return { ok: false, message: "Error: choose at least one file" };
  }

  const accepted = list.filter((file) => isAcceptedScanFilename(file.name));
  if (!accepted.length) {
    return { ok: false, message: UNSUPPORTED_FILE_MESSAGE };
  }

  return { ok: true, files: accepted };
}

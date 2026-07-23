/** Professional, distribution-ready copy for errors and service status. */

export const USER_MESSAGES = {
  serviceUnavailable:
    "VAYNE is temporarily unavailable. Please try again in a few minutes.",
  serviceOffline:
    "Unable to reach VAYNE. Check your connection and try again.",
  serviceOfflineShort: "VAYNE is currently unavailable.",
  analysisTimeout:
    "This analysis took longer than expected. Try again with fewer files, or contact your administrator.",
  analysisFailed:
    "The investigation could not be completed. Please try again.",
  unsupportedFile:
    "One or more files could not be processed. Use a supported scanner export format.",
  authSignInFailed:
    "We couldn't sign you in. Verify your email and password, then try again.",
  authRegisterFailed:
    "We couldn't create your account. Check your details and try again.",
  authInvalidCredentials: "Incorrect email or password.",
  authEmailInUse: "An account with this email already exists. Sign in instead.",
  requestFailed: "Something went wrong. Please try again.",
  investigationNotFound: "This investigation is no longer available.",
  reportUnavailable:
    "The investigation report is unavailable. Run the analysis again to regenerate it.",
  uploadRequired: "Upload evidence files, then start the analysis.",
  analystUnavailable:
    "The VAYNE analyst is temporarily unavailable. Investigation results in your workspace remain available.",
} as const;

const TECHNICAL_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /cannot reach vane api|failed to fetch|networkerror|fetch failed/i,
    replacement: USER_MESSAGES.serviceOffline,
  },
  {
    pattern: /backend offline|start the backend|uvicorn|port\s*8000|127\.0\.0\.1|localhost:\d+/i,
    replacement: USER_MESSAGES.serviceOfflineShort,
  },
  {
    pattern: /next_public_api_url|python -m /i,
    replacement: USER_MESSAGES.serviceUnavailable,
  },
  {
    pattern: /request failed \(\d+\)/i,
    replacement: USER_MESSAGES.requestFailed,
  },
  {
    pattern: /authentication failed/i,
    replacement: USER_MESSAGES.authSignInFailed,
  },
  {
    pattern: /analysis exceeded timeout/i,
    replacement: USER_MESSAGES.analysisTimeout,
  },
];

/** Strip URLs, ports, and dev jargon from any error string. */
export function sanitizeUserMessage(raw: string): string {
  const text = raw.trim();
  if (!text) return USER_MESSAGES.requestFailed;

  for (const { pattern, replacement } of TECHNICAL_PATTERNS) {
    if (pattern.test(text)) return replacement;
  }

  if (/^https?:\/\//i.test(text) || text.includes(":8000")) {
    return USER_MESSAGES.serviceOffline;
  }

  if (text.length > 160) {
    return `${text.slice(0, 157).trim()}…`;
  }

  return text;
}

export function userMessageForHttpStatus(status: number, detail?: string): string {
  switch (status) {
    case 401:
      return USER_MESSAGES.authInvalidCredentials;
    case 403:
      return "You don't have permission to perform this action.";
    case 404:
      return USER_MESSAGES.investigationNotFound;
    case 409:
      return USER_MESSAGES.authEmailInUse;
    case 422:
      return detail ? sanitizeUserMessage(detail) : "Please check your input and try again.";
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    case 502:
    case 503:
    case 504:
      return USER_MESSAGES.serviceUnavailable;
    default:
      if (status >= 500) return USER_MESSAGES.serviceUnavailable;
      return detail ? sanitizeUserMessage(detail) : USER_MESSAGES.requestFailed;
  }
}

export function parseUserFacingApiError(status: number, body: string): string {
  const trimmed = body.trim();

  try {
    const parsed = JSON.parse(trimmed) as {
      detail?: string | Array<{ msg?: string }>;
      error?: string;
      message?: string;
    };

    const detail = parsed.detail;
    if (typeof detail === "string") {
      if (detail === "Investigation not found") return USER_MESSAGES.investigationNotFound;
      if (detail === "Report not found") return USER_MESSAGES.reportUnavailable;
      if (status === 401 || /invalid credentials|incorrect password/i.test(detail)) {
        return USER_MESSAGES.authInvalidCredentials;
      }
      if (/already registered|already exists/i.test(detail)) {
        return USER_MESSAGES.authEmailInUse;
      }
      return sanitizeUserMessage(detail);
    }

    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail.find((item) => item?.msg)?.msg;
      if (first) return sanitizeUserMessage(first);
    }

    if (parsed.error?.trim()) return sanitizeUserMessage(parsed.error.trim());
    if (parsed.message?.trim()) return sanitizeUserMessage(parsed.message.trim());
  } catch {
    // fall through
  }

  if (!trimmed) return userMessageForHttpStatus(status);
  return userMessageForHttpStatus(status, trimmed);
}

export function formatAuthError(error: unknown, mode: "login" | "register"): string {
  if (error instanceof Error) {
    const sanitized = sanitizeUserMessage(error.message);
    if (sanitized !== error.message.trim()) return sanitized;
    if (/401|invalid|incorrect|credential/i.test(error.message)) {
      return USER_MESSAGES.authInvalidCredentials;
    }
    if (/409|already exists|already registered/i.test(error.message)) {
      return USER_MESSAGES.authEmailInUse;
    }
    return mode === "login" ? USER_MESSAGES.authSignInFailed : USER_MESSAGES.authRegisterFailed;
  }
  return mode === "login" ? USER_MESSAGES.authSignInFailed : USER_MESSAGES.authRegisterFailed;
}

export function describeAnalyzeError(error: unknown): string {
  if (error instanceof Error && error.name === "AnalyzeError") {
    const kind = (error as Error & { kind?: string; file?: string }).kind;
    const file = (error as Error & { file?: string }).file;
    switch (kind) {
      case "offline":
        return USER_MESSAGES.serviceOffline;
      case "timeout":
        return USER_MESSAGES.analysisTimeout;
      case "unsupported_file":
      case "invalid_xml":
      case "invalid_json":
        return file
          ? `${USER_MESSAGES.unsupportedFile}\n\nFile: ${file}`
          : USER_MESSAGES.unsupportedFile;
      case "parser_error":
        return USER_MESSAGES.unsupportedFile;
      case "internal_error":
        return USER_MESSAGES.analysisFailed;
      default:
        return sanitizeUserMessage(error.message);
    }
  }

  if (error instanceof Error) {
    return sanitizeUserMessage(error.message);
  }

  return USER_MESSAGES.requestFailed;
}

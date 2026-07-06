import { getApiBase } from "./api";

export function investigationLinksFooter(investigationId: string): string {
  const base = `${getApiBase()}/api/investigation/${investigationId}`;
  return [
    "",
    "[View Full Investigation →](/investigation/" + investigationId + ")",
    "[View Report →](/report/" + investigationId + ")",
    "[Download Report →](" + base + "/artifacts/investigation.json)",
  ].join("\n");
}

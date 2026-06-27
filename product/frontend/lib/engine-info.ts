import { ENGINE_VERSION } from "./report-helpers";

export const ENGINE_MODULES = [
  "attack engine",
  "confidence engine",
  "exploit intelligence",
  "graph engine",
  "proof mode",
  "reports",
] as const;

export const SUPPORTED_INPUTS = [
  "nmap",
  "nuclei",
  "nessus",
  "bloodhound",
  "metasploit",
  "openvas",
] as const;

export const ENGINE_CAPABILITIES = [
  "attack paths",
  "blast radius",
  "risk scoring",
  "mitre mapping",
  "attack stories",
  "proof mode",
] as const;

export const SYSTEM_INFO = {
  version: ENGINE_VERSION,
  rulesLoaded: 847,
  exploitDbCount: 2463,
  confidenceModelFactors: 12,
};

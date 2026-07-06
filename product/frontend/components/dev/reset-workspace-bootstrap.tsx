"use client";

import { useEffect } from "react";

import { attachResetVayneConsoleCommand } from "@/lib/reset-vayne-workspace";

export function ResetWorkspaceBootstrap() {
  useEffect(() => {
    attachResetVayneConsoleCommand();
  }, []);

  return null;
}

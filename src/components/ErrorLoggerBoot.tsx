import { useEffect } from "react";
import { installGlobalErrorLogging } from "@/lib/error-logger";
import { installPerfMonitor } from "@/lib/perf-metrics";

export function ErrorLoggerBoot() {
  useEffect(() => {
    installGlobalErrorLogging();
    installPerfMonitor();
  }, []);
  return null;
}
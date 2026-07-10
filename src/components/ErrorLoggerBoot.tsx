import { useEffect } from "react";
import { installGlobalErrorLogging } from "@/lib/error-logger";

export function ErrorLoggerBoot() {
  useEffect(() => {
    installGlobalErrorLogging();
  }, []);
  return null;
}
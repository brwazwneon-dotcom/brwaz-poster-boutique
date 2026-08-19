import { useEffect } from "react";
import { initBehavior } from "@/lib/behavior";

/** Fires visitor profile upsert once per session. */
export function BehaviorBoot() {
  useEffect(() => {
    void initBehavior();
  }, []);
  return null;
}

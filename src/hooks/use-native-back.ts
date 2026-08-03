import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { isNativePlatform, platform } from "@/lib/platform";

export function useNativeBack(): void {
  const router = useRouter();

  useEffect(() => {
    if (!isNativePlatform()) return;

    return platform.addBackListener(() => {
      // router.history.index > 0 means there is a previous route to go back to.
      if (router.history.index > 0) {
        router.history.back();
        return true;
      }
      return false;
    });
  }, [router]);
}

import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { isNativePlatform, platform } from "@/lib/platform";

export function useNativeBack(): void {
  const router = useRouter();

  useEffect(() => {
    if (!isNativePlatform()) return;

    return platform.addBackListener(() => {
      // canGoBack() means there is a previous route in the stack.
      if (router.history.canGoBack()) {
        router.history.back();
        return true;
      }
      return false;
    });
  }, [router]);
}

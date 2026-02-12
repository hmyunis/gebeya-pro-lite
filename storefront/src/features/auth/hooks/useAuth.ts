import { useEffect } from "react";
import { useStore } from "@nanostores/react";

import { $authReady, $user, loadUser } from "@/features/auth/store/authStore";

type UseAuthOptions = {
  enabled?: boolean;
};

export function useAuth(options: UseAuthOptions = {}) {
  const { enabled = true } = options;
  const user = useStore($user);
  const authReady = useStore($authReady);

  useEffect(() => {
    if (!enabled) return;
    if (authReady) return;
    void loadUser();
  }, [authReady, enabled]);

  return { user, authReady };
}

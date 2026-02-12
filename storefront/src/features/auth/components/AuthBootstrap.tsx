import { useEffect } from "react";

import { loadUser } from "@/features/auth/store/authStore";

export default function AuthBootstrap() {
  useEffect(() => {
    void loadUser();
  }, []);

  return null;
}

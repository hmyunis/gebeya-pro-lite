import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import DashboardShellSkeleton from "../layouts/DashboardShellSkeleton";

type MeResponse = {
  userId?: number;
  role?: "admin" | "merchant" | "customer";
  firstName?: string;
  username?: string;
  avatarUrl?: string;
};

type Role = NonNullable<MeResponse["role"]>;

export default function RequireAdmin({
  children,
  allowedRoles = ["admin"],
}: {
  children: ReactNode;
  allowedRoles?: Role[];
}) {
  const location = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.get<MeResponse>("/auth/me");
      return res.data;
    },
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading && !data) {
    return <DashboardShellSkeleton />;
  }

  if (!data?.role) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(data.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}


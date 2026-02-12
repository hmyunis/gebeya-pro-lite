import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Skeleton,
  addToast,
} from "@heroui/react";
import {
  Lock,
  Password,
  TelegramLogo,
  UploadSimple,
  UserCircle,
} from "@phosphor-icons/react";
import { api } from "../../lib/api";
import { getImageUrl } from "../../types";

type StaffProfile = {
  id: number;
  role: "admin" | "merchant";
  firstName?: string | null;
  avatarUrl?: string | null;
  loginUsername?: string | null;
  telegramUsername?: string | null;
  hasTelegram?: boolean;
};

type TelegramUser = {
  id: number;
  first_name: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    onTelegramStaffLink?: (user: TelegramUser) => void;
  }
}

const LOGIN_USERNAME_RE = /^@?[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function getErrorMessage(error: any, fallback: string) {
  const raw = error?.response?.data?.message;
  if (Array.isArray(raw)) {
    const entries = raw.filter((entry) => typeof entry === "string");
    if (entries.length) return entries.join(", ");
  }
  if (typeof raw === "string" && raw.trim()) return raw;
  if (typeof error?.message === "string" && error.message.trim()) return error.message;
  return fallback;
}

export default function AdminProfilePage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const telegramWidgetRef = useRef<HTMLDivElement | null>(null);

  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [widgetAttempt, setWidgetAttempt] = useState(0);
  const [showTelegramWidget, setShowTelegramWidget] = useState(false);
  const [telegramWidgetStatus, setTelegramWidgetStatus] = useState<
    "idle" | "loading" | "ready" | "error" | "disabled"
  >("idle");

  const botName = import.meta.env.VITE_TELEGRAM_BOT_NAME as string | undefined;

  const profileQuery = useQuery<StaffProfile>({
    queryKey: ["admin", "profile"],
    queryFn: async () => (await api.get("/users/me")).data,
  });

  useEffect(() => {
    if (!profileQuery.data) return;
    setFullName(profileQuery.data.firstName ?? "");
    setAvatarUrl(profileQuery.data.avatarUrl ?? "");
    setLoginUsername(
      profileQuery.data.loginUsername ?? profileQuery.data.telegramUsername ?? "",
    );
    if (!profileQuery.data.hasTelegram) {
      setShowTelegramWidget(true);
    }
  }, [profileQuery.data]);

  const avatarSrc = useMemo(
    () => (avatarUrl ? getImageUrl(avatarUrl) : undefined),
    [avatarUrl],
  );

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: { firstName: string }) =>
      api.patch("/users/me", payload),
    onSuccess: () => {
      addToast({
        title: "Profile updated",
        description: "Your profile details were saved.",
        color: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: any) => {
      addToast({
        title: "Update failed",
        description: getErrorMessage(error, "Failed to update profile."),
        color: "danger",
      });
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("avatar", file);
      return api.post("/users/me/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: (response) => {
      const nextAvatar = response.data?.avatarUrl ?? "";
      setAvatarUrl(nextAvatar);
      addToast({
        title: "Avatar updated",
        description: "Your new avatar is saved.",
        color: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: any) => {
      addToast({
        title: "Upload failed",
        description: getErrorMessage(error, "Failed to upload avatar."),
        color: "danger",
      });
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async (payload: {
      username?: string;
      currentPassword?: string;
      newPassword: string;
    }) => api.post("/auth/password/set", payload),
    onSuccess: () => {
      addToast({
        title: "Credentials updated",
        description: "Password login settings have been saved.",
        color: "success",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      queryClient.invalidateQueries({ queryKey: ["admin", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: any) => {
      addToast({
        title: "Credentials update failed",
        description: getErrorMessage(error, "Failed to update credentials."),
        color: "danger",
      });
    },
  });

  const linkTelegramMutation = useMutation({
    mutationFn: async (user: TelegramUser) => api.post("/auth/telegram/link", user),
    onSuccess: () => {
      addToast({
        title: "Telegram linked",
        description: "Your Telegram account is now connected.",
        color: "success",
      });
      setShowTelegramWidget(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: any) => {
      addToast({
        title: "Link failed",
        description: getErrorMessage(error, "Could not link Telegram account."),
        color: "danger",
      });
    },
  });

  useEffect(() => {
    const profile = profileQuery.data;
    const container = telegramWidgetRef.current;
    if (!profile || !container) return;

    const shouldRenderWidget = !profile.hasTelegram || showTelegramWidget;
    if (!shouldRenderWidget) {
      setTelegramWidgetStatus("idle");
      container.innerHTML = "";
      return;
    }

    if (!botName) {
      setTelegramWidgetStatus("disabled");
      container.innerHTML = "";
      return;
    }

    window.onTelegramStaffLink = async (user: TelegramUser) => {
      await linkTelegramMutation.mutateAsync(user);
    };

    container.innerHTML = "";
    setTelegramWidgetStatus("loading");

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botName);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramStaffLink(user)");
    script.setAttribute("data-request-access", "write");

    let isCurrent = true;
    let timeoutId: number | null = window.setTimeout(() => {
      if (!isCurrent) return;
      if (container.childElementCount === 0) {
        setTelegramWidgetStatus("error");
      }
    }, 12000);

    script.onload = () => {
      if (!isCurrent) return;
      window.setTimeout(() => {
        if (!isCurrent) return;
        setTelegramWidgetStatus(container.childElementCount > 0 ? "ready" : "error");
      }, 300);
    };

    script.onerror = () => {
      if (!isCurrent) return;
      setTelegramWidgetStatus("error");
    };

    container.appendChild(script);

    return () => {
      isCurrent = false;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      container.innerHTML = "";
    };
  }, [
    botName,
    linkTelegramMutation,
    profileQuery.data,
    showTelegramWidget,
    widgetAttempt,
  ]);

  const handleAvatarPick = () => fileInputRef.current?.click();
  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      addToast({
        title: "Invalid file",
        description: "Please select an image file.",
        color: "warning",
      });
      return;
    }
    uploadAvatarMutation.mutate(file);
    event.target.value = "";
  };

  const profile = profileQuery.data;
  const isLoading = profileQuery.isLoading;
  const roleLabel = profile?.role === "merchant" ? "Merchant" : "Admin";
  const username = profile?.loginUsername || profile?.telegramUsername || roleLabel.toLowerCase();

  const hasExistingPassword = Boolean(profile?.loginUsername);
  const needsLoginUsername = Boolean(
    profile && !profile.loginUsername && !profile.telegramUsername?.trim(),
  );

  const usernameTrimmed = loginUsername.trim();
  const usernameMeetsFormat =
    usernameTrimmed.length >= 3 &&
    usernameTrimmed.length <= 32 &&
    LOGIN_USERNAME_RE.test(usernameTrimmed);
  const usernameLooksValid = needsLoginUsername
    ? usernameMeetsFormat
    : usernameTrimmed.length === 0 || usernameMeetsFormat;

  const canSubmitPassword =
    usernameLooksValid &&
    newPassword.length >= 8 &&
    confirmPassword === newPassword &&
    (!hasExistingPassword || currentPassword.length >= 8);

  const handleSaveCredentials = () => {
    const payload: {
      username?: string;
      currentPassword?: string;
      newPassword: string;
    } = {
      newPassword,
    };

    if (usernameTrimmed.length > 0) {
      payload.username = usernameTrimmed;
    }
    if (hasExistingPassword) {
      payload.currentPassword = currentPassword;
    }

    setPasswordMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-sm text-default-500">
          Manage your {roleLabel.toLowerCase()} profile, login credentials, and Telegram link.
        </p>
      </div>

      <Card>
        <CardBody className="space-y-6 p-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <Skeleton className="h-10 rounded-xl" />
              <Skeleton className="h-10 rounded-xl" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Avatar src={avatarSrc} size="lg" name={fullName || roleLabel} />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold">{fullName || roleLabel}</span>
                  <span className="text-xs text-default-500">@{username}</span>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="flat"
                  startContent={<UploadSimple className="h-4 w-4" />}
                  onPress={handleAvatarPick}
                  isLoading={uploadAvatarMutation.isPending}
                >
                  Upload avatar
                </Button>
                <span className="text-xs text-default-500">
                  PNG or JPG, square images look best.
                </span>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <Input
                  label="Full name"
                  value={fullName}
                  onValueChange={setFullName}
                  placeholder={`${roleLabel} name`}
                  startContent={<UserCircle className="h-4 w-4" />}
                  className="md:flex-1"
                />
                <Button
                  color="primary"
                  onPress={() =>
                    updateProfileMutation.mutate({ firstName: fullName.trim() })
                  }
                  isLoading={updateProfileMutation.isPending}
                >
                  Save profile
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4 p-6">
          <div>
            <h2 className="text-lg font-semibold">Password Login</h2>
            <p className="text-sm text-default-500">
              Set or change username/password so you can sign in without Telegram.
            </p>
          </div>

          <Input
            label="Login username"
            value={loginUsername}
            onValueChange={setLoginUsername}
            placeholder="your_username"
            isInvalid={!usernameLooksValid}
            errorMessage={
              !usernameLooksValid
                ? "Username must be 3-32 chars and use letters, numbers, ., _, -"
                : undefined
            }
          />

          {hasExistingPassword ? (
            <Input
              type="password"
              label="Current password"
              value={currentPassword}
              onValueChange={setCurrentPassword}
              placeholder="Current password"
              startContent={<Lock className="h-4 w-4" />}
            />
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <Input
              type="password"
              label="New password"
              value={newPassword}
              onValueChange={setNewPassword}
              placeholder="At least 8 characters"
              startContent={<Password className="h-4 w-4" />}
            />
            <Input
              type="password"
              label="Confirm password"
              value={confirmPassword}
              onValueChange={setConfirmPassword}
              placeholder="Repeat new password"
              startContent={<Password className="h-4 w-4" />}
              isInvalid={confirmPassword.length > 0 && confirmPassword !== newPassword}
              errorMessage={
                confirmPassword.length > 0 && confirmPassword !== newPassword
                  ? "Passwords do not match"
                  : undefined
              }
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-default-500">
              {hasExistingPassword
                ? "Current password is required to update credentials."
                : "Set credentials once to enable password login."}
            </p>
            <Button
              color="primary"
              onPress={handleSaveCredentials}
              isLoading={setPasswordMutation.isPending}
              isDisabled={!canSubmitPassword}
            >
              Save credentials
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Telegram</h2>
              <p className="text-sm text-default-500">
                Link your Telegram account to enable Telegram-based login and notifications.
              </p>
            </div>
            {profile?.hasTelegram ? (
              <Chip color="success" variant="flat">
                Linked
              </Chip>
            ) : (
              <Chip color="warning" variant="flat">
                Not linked
              </Chip>
            )}
          </div>

          {!profile?.hasTelegram || showTelegramWidget ? (
            <>
              {profile?.hasTelegram ? (
                <p className="text-xs text-warning">
                  Linking a new Telegram account will replace the current linked account.
                </p>
              ) : null}
              <div ref={telegramWidgetRef} className="min-h-12" />
              {telegramWidgetStatus === "disabled" ? (
                <p className="text-sm text-danger">
                  Telegram bot name is missing in `VITE_TELEGRAM_BOT_NAME`.
                </p>
              ) : null}
              {telegramWidgetStatus === "error" ? (
                <Button
                  variant="flat"
                  startContent={<TelegramLogo className="h-4 w-4" />}
                  onPress={() => setWidgetAttempt((value) => value + 1)}
                >
                  Retry Telegram Widget
                </Button>
              ) : null}
              {profile?.hasTelegram ? (
                <Button
                  variant="light"
                  onPress={() => {
                    setShowTelegramWidget(false);
                    setTelegramWidgetStatus("idle");
                  }}
                >
                  Cancel change
                </Button>
              ) : null}
              {linkTelegramMutation.isPending ? (
                <p className="text-xs text-default-500">Linking Telegram account...</p>
              ) : null}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-default-500">
                Linked as @{profile.telegramUsername || "telegram_user"}.
              </p>
              <Button
                variant="flat"
                startContent={<TelegramLogo className="h-4 w-4" />}
                onPress={() => {
                  setShowTelegramWidget(true);
                  setWidgetAttempt((value) => value + 1);
                }}
              >
                Change linked Telegram
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}


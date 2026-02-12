import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Input,
  addToast,
} from "@heroui/react";
import { useNavigate } from "react-router-dom";
import { SignIn } from "@phosphor-icons/react";
import { api, clearAuthToken, setAuthToken } from "../../lib/api";
import appLogo from "../../assets/logo.png";

interface TelegramUser {
  id: number;
  first_name: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    onTelegramAuth: (user: TelegramUser) => void;
  }
}

const isStaffRole = (role: string | undefined) => role === "admin";

export default function LoginPage() {
  const telegramWrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);

  useEffect(() => {
    const botName = import.meta.env.VITE_TELEGRAM_BOT_NAME as string | undefined;

    window.onTelegramAuth = async (user) => {
      try {
        addToast({
          title: "Authenticating...",
          description: "Verifying with server",
        });

        const response = await api.post("/auth/telegram", user);
        const role = response?.data?.user?.role as string | undefined;
        const token = response?.data?.token as string | undefined;

        if (!isStaffRole(role)) {
          clearAuthToken();
          await api.post("/auth/logout");
          addToast({
            title: "Access denied",
            description: "Only admins can access this dashboard.",
            color: "danger",
          });
          return;
        }

        if (!token) {
          throw new Error("Missing auth token in /auth/telegram response");
        }

        setAuthToken(token);
        addToast({
          title: "Success",
          description: "Logged in successfully",
          color: "success",
        });
        navigate("/");
      } catch (error) {
        console.error(error);
        addToast({
          title: "Login failed",
          description: "Could not verify Telegram credentials.",
          color: "danger",
        });
      }
    };

    if (!botName) {
      console.error("Missing VITE_TELEGRAM_BOT_NAME in environment variables.");
      return;
    }

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botName);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");

    if (telegramWrapperRef.current) {
      telegramWrapperRef.current.innerHTML = "";
      telegramWrapperRef.current.appendChild(script);
    }
  }, [navigate]);

  const loginWithPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (username.trim().length < 3 || password.length < 8) {
      addToast({
        title: "Invalid credentials",
        description: "Username or password is too short.",
        color: "warning",
      });
      return;
    }

    setIsPasswordLoading(true);
    try {
      const response = await api.post("/auth/password", {
        username: username.trim(),
        password,
      });
      const role = response?.data?.user?.role as string | undefined;
      const token = response?.data?.token as string | undefined;

      if (!isStaffRole(role)) {
        clearAuthToken();
        await api.post("/auth/logout");
          addToast({
            title: "Access denied",
            description: "Only admins can access this dashboard.",
            color: "danger",
          });
        return;
      }

      if (!token) {
        throw new Error("Missing auth token in /auth/password response");
      }

      setAuthToken(token);
      addToast({
        title: "Success",
        description: "Logged in successfully",
        color: "success",
      });
      navigate("/");
    } catch (error: any) {
      addToast({
        title: "Login failed",
        description:
          error?.response?.data?.message || "Invalid username or password.",
        color: "danger",
      });
    } finally {
      setIsPasswordLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-br from-blue-800 via-indigo-900 to-slate-950 px-4 py-10">
      <Card className="w-full max-w-md p-2">
        <CardHeader className="flex flex-col gap-2 pb-2 text-center">
          <img src={appLogo} alt="Gebeya Pro logo" className="size-12 rounded-lg object-contain" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Staff Login
          </h1>
          <p className="text-sm text-slate-500">
            Admin access to the dashboard
          </p>
        </CardHeader>

        <CardBody className="flex flex-col gap-4 py-2">
          <div ref={telegramWrapperRef} className="flex w-full justify-center px-3 py-2" />

          <div className="px-2">
            <Divider />
          </div>

          <form className="space-y-3 px-2" onSubmit={loginWithPassword}>
            <Input
              type="text"
              label="Username"
              placeholder="admin_username"
              value={username}
              onValueChange={setUsername}
              autoComplete="username"
              isRequired
            />
            <Input
              type="password"
              label="Password"
              placeholder="••••••••"
              value={password}
              onValueChange={setPassword}
              autoComplete="current-password"
              isRequired
            />
            <Button
              type="submit"
              color="primary"
              className="w-full"
              isLoading={isPasswordLoading}
              startContent={<SignIn className="h-4 w-4" />}
            >
              Login with password
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}


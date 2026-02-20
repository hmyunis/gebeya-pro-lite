import { useEffect, useState, type ReactNode } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, clearAuthToken } from "../lib/api";
import { getImageUrl } from "../types";
import appLogo from "../assets/logo.png";
import {
  Navbar,
  NavbarContent,
  Avatar,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Tooltip,
  Chip,
} from "@heroui/react";
import { Drawer, DrawerBody, DrawerContent, DrawerHeader } from "@heroui/drawer";
import { CaretDown, ChartBar, House, Megaphone, Package, SignOut, UserCircle, List, SidebarSimple, Storefront } from "@phosphor-icons/react";
import { cn } from "../lib/utils";
import DashboardShellSkeleton from "./DashboardShellSkeleton";

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data as {
        role?: "admin";
        firstName?: string;
        username?: string;
        loginUsername?: string;
        avatarUrl?: string;
      };
    },
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading && !user) {
    return <DashboardShellSkeleton />;
  }

  if (!user) {
    return null;
  }

  const role = user?.role ?? "admin";

  const menuItems: Array<{
    name: string;
    path: string;
    icon: ReactNode;
    badge?: string;
  }> = [
    { name: "Dashboard", path: "/", icon: <House className="h-5 w-5" /> },
    { name: "Ads", path: "/ads", icon: <Package className="h-5 w-5" /> },
    { name: "Announcements", path: "/announcements", icon: <Megaphone className="h-5 w-5" /> },
    { name: "Analytics", path: "/analytics", icon: <ChartBar className="h-5 w-5" /> },
    { name: "Merchants", path: "/merchants", icon: <Storefront className="h-5 w-5" /> },
    { name: "Profile", path: "/profile", icon: <UserCircle className="h-5 w-5" /> },
  ];

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("adminSidebarCollapsed");
    if (stored !== null) {
      setIsCollapsed(stored === "true");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("adminSidebarCollapsed", String(isCollapsed));
  }, [isCollapsed]);

  const handleLogout = async () => {
    await api.post('/auth/logout');
    clearAuthToken();
    navigate('/login', { replace: true });
  };

  const displayName = user?.firstName ?? "Admin";
  const displayUsername = user?.loginUsername ?? user?.username ?? role;
  const avatarUrl = user?.avatarUrl ? getImageUrl(user.avatarUrl) : undefined;
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .map((part: string) => part[0]?.toUpperCase())
    .join("")
    .slice(0, 2);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background">
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 hidden h-screen border-r border-default-200 bg-background py-6 transition-all duration-200 lg:flex lg:flex-col",
          isCollapsed ? "w-20 items-center" : "w-64 px-4"
        )}
      >
        <div className={cn("mb-8 flex items-center gap-2 shrink-0", isCollapsed ? "justify-center" : "px-2")}>
          <img src={appLogo} alt="Gebeya Pro logo" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
          <span className={cn("text-xl font-bold whitespace-nowrap", isCollapsed && "hidden")}>Gebeya Pro</span>
        </div>

        <nav className={cn("flex flex-col gap-2 w-full", isCollapsed && "items-center")}>
          {menuItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path !== "/" && location.pathname.startsWith(`${item.path}/`));
            
            const content = (
              <Button
                fullWidth={!isCollapsed}
                isIconOnly={isCollapsed}
                variant={isActive ? "flat" : "light"}
                color={isActive ? "primary" : "default"}
                className={cn("justify-start", isCollapsed && "justify-center")}
                startContent={!isCollapsed ? item.icon : undefined}
                aria-label={item.name}
              >
                {isCollapsed ? (
                  item.icon
                ) : (
                  <span className="flex items-center gap-2">
                    <span>{item.name}</span>
                    {item.badge ? (
                      <Chip size="sm" variant="flat" color="secondary">
                        {item.badge}
                      </Chip>
                    ) : null}
                  </span>
                )}
              </Button>
            );

            return (
              <Link key={item.path} to={item.path} className={cn("block", !isCollapsed && "w-full")}>
                {isCollapsed ? (
                  <Tooltip content={item.name} placement="right">
                    {content}
                  </Tooltip>
                ) : (
                  content
                )}
              </Link>
            );
          })}
        </nav>

        <div className={cn("mt-auto w-full", isCollapsed ? "flex justify-center" : "")}>
          {isCollapsed ? (
            <Tooltip content="Logout" placement="right">
              <Button
                isIconOnly
                color="danger"
                variant="flat"
                onPress={handleLogout}
                aria-label="Logout"
              >
                <SignOut className="h-5 w-5" />
              </Button>
            </Tooltip>
          ) : (
            <Button
              fullWidth
              color="danger"
              variant="flat"
              startContent={<SignOut className="h-5 w-5" />}
              onPress={handleLogout}
            >
              Logout
            </Button>
          )}
        </div>
      </aside>

      <main
        className={cn(
          "min-h-screen min-w-0 transition-all duration-200",
          isCollapsed ? "lg:ml-20" : "lg:ml-64",
        )}
      >
        <Navbar isBordered maxWidth="full" className="bg-background/70 backdrop-blur-md">
          <NavbarContent justify="start">
            <Button
              isIconOnly
              variant="light"
              className="lg:hidden"
              onPress={() => setIsDrawerOpen(true)}
              aria-label="Open menu"
            >
              <List className="h-5 w-5" />
            </Button>
            <Button
              isIconOnly
              variant="light"
              className="hidden lg:inline-flex"
              onPress={() => setIsCollapsed((prev) => !prev)}
              aria-label="Toggle sidebar"
            >
              {isCollapsed ? <List className="h-5 w-5" /> : <SidebarSimple className="h-5 w-5" />}
            </Button>
            <h2 className="text-lg font-semibold">
              {menuItems.find(
                (item) =>
                  location.pathname === item.path ||
                  (item.path !== "/" && location.pathname.startsWith(`${item.path}/`))
              )?.name || "Admin"}
            </h2>
          </NavbarContent>

          <NavbarContent justify="end">
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <Button variant="light" className="h-10 px-2">
                  <div className="flex items-center gap-3">
                    <Avatar src={avatarUrl} size="sm" name={initials} />
                    <div className="hidden sm:flex flex-col items-start">
                      <p className="text-sm font-medium">{displayName}</p>
                      <p className="text-xs text-default-500">@{displayUsername}</p>
                    </div>
                    <CaretDown className="h-4 w-4 text-default-400" />
                  </div>
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="User menu">
                <DropdownItem
                  key="profile"
                  startContent={<UserCircle className="h-4 w-4" />}
                  textValue="Profile"
                  onPress={() => navigate("/profile")}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{displayName}</span>
                    <span className="text-xs text-default-500">Admin profile</span>
                  </div>
                </DropdownItem>
                <DropdownItem
                  key="logout"
                  color="danger"
                  startContent={<SignOut className="h-4 w-4" />}
                  onPress={handleLogout}
                >
                  Logout
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </NavbarContent>
        </Navbar>

        <div className="min-w-0 p-6">
          <Outlet />
        </div>
      </main>

      <Drawer
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        placement="left"
        classNames={{ base: "w-[90vw] max-w-xs" }}
      >
        <DrawerContent>
          <DrawerHeader className="flex items-center gap-2">
            <img src={appLogo} alt="Gebeya Pro logo" className="h-8 w-8 rounded-lg object-contain" />
            <span className="text-lg font-bold">Gebeya Pro</span>
          </DrawerHeader>
          <DrawerBody className="space-y-2">
            {menuItems.map((item) => (
              <Link key={item.path} to={item.path} onClick={() => setIsDrawerOpen(false)}>
                <Button
                  fullWidth
                  variant={
                    location.pathname === item.path ||
                    (item.path !== "/" && location.pathname.startsWith(`${item.path}/`))
                      ? "flat"
                      : "light"
                  }
                  color={
                    location.pathname === item.path ||
                    (item.path !== "/" && location.pathname.startsWith(`${item.path}/`))
                      ? "primary"
                      : "default"
                  }
                  className="justify-start"
                  startContent={item.icon}
                >
                  <span className="flex items-center gap-2">
                    <span>{item.name}</span>
                    {item.badge ? (
                      <Chip size="sm" variant="flat" color="secondary">
                        {item.badge}
                      </Chip>
                    ) : null}
                  </span>
                </Button>
              </Link>
            ))}
            <Button
              fullWidth
              color="danger"
              variant="flat"
              startContent={<SignOut className="h-5 w-5" />}
              onPress={handleLogout}
            >
              Logout
            </Button>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  );
}


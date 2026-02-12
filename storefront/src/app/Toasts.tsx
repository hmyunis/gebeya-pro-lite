import { HeroUIProvider, ToastProvider } from "@heroui/react";

export default function Toasts() {
  return (
    <HeroUIProvider>
      <ToastProvider placement="top-right" maxVisibleToasts={4} />
    </HeroUIProvider>
  );
}


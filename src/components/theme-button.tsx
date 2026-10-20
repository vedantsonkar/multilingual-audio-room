"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "./ui/button";
const subscribe = (): (() => void) => () => undefined;
export function ThemeButton() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const { theme, setTheme } = useTheme();
  const current = mounted ? theme ?? "system" : "system";
  const Icon = current === "dark" ? Moon : current === "light" ? Sun : Monitor;
  return <Button variant="ghost" size="icon" aria-label={`Theme: ${current}. Change theme`} title={`Theme: ${current}`} onClick={() => setTheme(current === "system" ? "light" : current === "light" ? "dark" : "system")}><Icon className="size-4" /></Button>;
}

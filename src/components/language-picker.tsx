"use client";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { LANGUAGES, languageName, type LanguageCode } from "@/lib/languages";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function LanguagePicker({ id, value, onChange }: { id: string; value: LanguageCode; onChange: (code: LanguageCode) => void }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="h-12 w-full justify-between bg-card text-base font-normal">{languageName(value)}<ChevronsUpDown className="size-4 text-muted-foreground" /></Button></PopoverTrigger>
    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
      <Command><CommandInput placeholder="Search languages…" /><CommandList className="max-h-64 overscroll-contain"><CommandEmpty>No supported language found.</CommandEmpty><CommandGroup>
        {LANGUAGES.map(([code, name]) => <CommandItem key={code} value={`${name} ${code}`} onSelect={() => { onChange(code); setOpen(false); }}><Check className={cn("size-4", code === value ? "opacity-100" : "opacity-0")} />{name}</CommandItem>)}
      </CommandGroup></CommandList></Command>
    </PopoverContent>
  </Popover>;
}

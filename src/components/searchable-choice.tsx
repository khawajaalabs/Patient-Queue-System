import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { Btn } from "@/components/qc";
export function SearchableChoice({
  label,
  value,
  onChange,
  options,
  labels = {},
  allowCreate = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
  allowCreate?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }
  const items = [...new Set(options)].filter(Boolean);
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Btn
            type="button"
            variant="secondary"
            className="w-full justify-between text-left"
            aria-label={label}
            disabled={disabled}
          >
            {labels[value] || value || "Select " + label.toLowerCase()}
            <span aria-hidden>⌄</span>
          </Btn>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput
              aria-label={"Search " + label.toLowerCase()}
              placeholder={"Search " + label.toLowerCase()}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              {items.map((v) => (
                <CommandItem key={v} value={labels[v] || v} onSelect={() => choose(v)}>
                  {labels[v] || v}
                  {v === value && <span className="ml-auto text-primary">✓</span>}
                </CommandItem>
              ))}
              {allowCreate &&
                query.trim() &&
                !items.some((v) => v.toLowerCase() === query.trim().toLowerCase()) && (
                  <CommandItem value={query} onSelect={() => choose(query.trim())}>
                    Use “{query.trim()}”
                  </CommandItem>
                )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

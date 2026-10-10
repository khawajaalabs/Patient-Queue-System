import * as React from "react";
import { CalendarDays, Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const emptyOption = "__queuecare_empty_option__";
const fieldClass =
  "h-11 rounded-lg border border-input bg-card px-4 text-base outline-none transition focus:border-ring focus:ring-0 disabled:opacity-60";

function optionsFrom(
  children: React.ReactNode,
): React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>>[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return [];
    if (child.type === React.Fragment) return optionsFrom(child.props.children);
    return child.type === "option"
      ? [child as React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>>]
      : [];
  });
}
function textOf(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) =>
      React.isValidElement<{ children?: React.ReactNode }>(child)
        ? textOf(child.props.children)
        : String(child),
    )
    .join("");
}

/** Native backing field preserves FormData, required validation and change handlers.
 * Only the shadcn trigger/menu is visible or keyboard-focusable. */
export function SelectField({
  children,
  className,
  value,
  defaultValue,
  onChange,
  id,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const options = optionsFrom(children);
  const optionValue = (option: (typeof options)[number]) =>
    String(option.props.value ?? textOf(option.props.children));
  const initial = String(defaultValue ?? (options[0] ? optionValue(options[0]) : ""));
  const [local, setLocal] = React.useState(initial);
  const selected = String(value ?? local);
  const backing = React.useRef<HTMLSelectElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    const form = backing.current?.form;
    const reset = () => setLocal(initial);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initial]);
  return (
    <>
      <Select
        value={selected || emptyOption}
        disabled={!!props.disabled}
        onValueChange={(next) => {
          // Radix's form backing can emit an empty value on mount. User-cleared
          // selections use our explicit emptyOption item instead.
          if (!next) return;
          const nextValue = next === emptyOption ? "" : next;
          if (backing.current) {
            backing.current.value = nextValue;
            backing.current.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }}
      >
        <SelectTrigger
          ref={trigger}
          id={id}
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
          aria-describedby={props["aria-describedby"]}
          aria-invalid={props["aria-invalid"]}
          aria-required={props.required}
          className={cn(
            fieldClass,
            "inline-flex w-auto max-w-full min-w-0 gap-3 text-start",
            className?.replace(/\bblock\b/g, "flex"),
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-w-[calc(100vw-2rem)] rounded-lg bg-card shadow-md">
          {options.map((option) => (
            <SelectItem
              key={optionValue(option)}
              value={optionValue(option) || emptyOption}
              disabled={!!option.props.disabled}
              className="min-h-10 rounded-md data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary focus:bg-accent focus:text-accent-foreground"
            >
              {option.props.children}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <select
        {...props}
        ref={backing}
        value={selected}
        aria-label={undefined}
        aria-labelledby={undefined}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onInvalid={() => trigger.current?.focus()}
        onChange={(event) => {
          setLocal(event.target.value);
          onChange?.(event);
        }}
      >
        {children}
      </select>
    </>
  );
}

/** Keep ISO local date/time strings and browser constraints; replace only picker UI. */
export function TemporalInput({
  type = "date",
  value,
  defaultValue,
  className,
  onChange,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const initial = String(defaultValue ?? "");
  const [local, setLocal] = React.useState(initial);
  const current = String(value ?? local);
  const [open, setOpen] = React.useState(false);
  const backing = React.useRef<HTMLInputElement>(null);
  const input = React.useRef<HTMLInputElement>(null);
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const datePart = type === "time" ? "" : current.split("T")[0];
  const timePart = type === "time" ? current : (current.split("T")[1] ?? "");
  const parsedDate = datePart ? new Date(datePart + "T00:00:00") : undefined;
  const selectedDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : undefined;
  const placeholder =
    type === "date" ? "YYYY-MM-DD" : type === "time" ? "HH:mm" : "YYYY-MM-DDTHH:mm";
  const commit = (next: string) => {
    setLocal(next);
    if (backing.current) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(backing.current, next);
      backing.current.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };
  React.useEffect(() => {
    const native = backing.current;
    if (native)
      native.setCustomValidity(
        current && native.value !== current
          ? `Enter a valid ${type === "date" ? "date" : "time and date"} (${placeholder}).`
          : "",
      );
  }, [current, type, placeholder]);
  React.useEffect(() => {
    const form = backing.current?.form;
    const reset = () => setLocal(initial);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initial]);
  const timeControls = (
    <div className="flex items-end gap-2 p-3">
      <label className="min-w-0 flex-1 text-sm">
        Hour
        <SelectField
          aria-label="Hour"
          className="mt-1 w-full"
          value={timePart.split(":")[0] || "00"}
          onChange={(e) => changeTime(e.target.value, timePart.split(":")[1] || "00")}
        >
          {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((hour) => (
            <option key={hour}>{hour}</option>
          ))}
        </SelectField>
      </label>
      <label className="min-w-0 flex-1 text-sm">
        Minute
        <SelectField
          aria-label="Minute"
          className="mt-1 w-full"
          value={timePart.split(":")[1] || "00"}
          onChange={(e) => changeTime(timePart.split(":")[0] || "00", e.target.value)}
        >
          {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((minute) => (
            <option key={minute}>{minute}</option>
          ))}
        </SelectField>
      </label>
    </div>
  );
  function changeTime(hour: string, minute: string) {
    commit(
      type === "time"
        ? `${hour}:${minute}`
        : `${datePart || localDate(new Date())}T${hour}:${minute}`,
    );
  }
  return (
    <div className="relative min-w-0">
      <input
        {...props}
        id={inputId}
        ref={input}
        type="text"
        name={undefined}
        required={false}
        aria-required={props.required}
        min={undefined}
        max={undefined}
        step={undefined}
        value={current}
        placeholder={props.placeholder ?? placeholder}
        className={cn(fieldClass, "w-full pe-11", className)}
        onChange={(e) => {
          setLocal(e.target.value);
          onChange?.(e);
        }}
        onBlur={props.onBlur}
      />
      <input
        {...props}
        id={undefined}
        aria-label={undefined}
        aria-labelledby={undefined}
        aria-describedby={undefined}
        ref={backing}
        type={type}
        value={current}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onInvalid={() => input.current?.focus()}
        onChange={(e) => {
          setLocal(e.target.value);
          onChange?.(e);
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={props.disabled || props.readOnly}
            aria-label={`Choose ${type === "time" ? "time" : type === "date" ? "date" : "date and time"}`}
            className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {type === "time" ? <Clock className="size-4" /> : <CalendarDays className="size-4" />}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto max-w-[calc(100vw-2rem)] rounded-lg bg-card p-0"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            input.current?.focus();
          }}
        >
          {type !== "time" && (
            <Calendar
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate ?? new Date()}
              captionLayout="dropdown"
              startMonth={new Date(1900, 0)}
              endMonth={new Date(new Date().getFullYear() + 20, 11)}
              autoFocus
              disabled={(day) => {
                const iso = localDate(day);
                return !!(
                  (props.min && iso < String(props.min).slice(0, 10)) ||
                  (props.max && iso > String(props.max).slice(0, 10))
                );
              }}
              components={{
                Dropdown: ({ options, value, onChange, "aria-label": label, disabled }) => (
                  <SelectField
                    aria-label={label}
                    value={String(value)}
                    disabled={disabled}
                    onChange={onChange}
                  >
                    {options?.map((option) => (
                      <option key={option.value} value={option.value} disabled={option.disabled}>
                        {option.label}
                      </option>
                    ))}
                  </SelectField>
                ),
              }}
              onSelect={(day) => {
                if (!day) return;
                commit(
                  localDate(day) + (type === "datetime-local" ? "T" + (timePart || "00:00") : ""),
                );
                if (type === "date") setOpen(false);
              }}
            />
          )}
          {type !== "date" && timeControls}
          <div className="flex justify-between gap-3 border-t p-3">
            {!props.required && (
              <button
                type="button"
                className="rounded-md px-3 py-2 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  commit("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              className="ms-auto rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

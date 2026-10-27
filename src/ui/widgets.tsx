import { cloneElement, useId, useState, type ReactElement, type ReactNode } from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id, "aria-describedby": hintId })}
      {hint ? <small id={hintId}>{hint}</small> : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  type?: "text" | "date" | "number";
  maxLength?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <input type={type} value={value} maxLength={maxLength} autoComplete="off" onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  hint,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </Field>
  );
}

export function FileButton({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  return (
    <label className="btn secondary file">
      {label}
      <input
        type="file"
        aria-label={label}
        accept=".json,.xlsx,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

export function ConfirmButton({ label, confirm, onConfirm }: { label: string; confirm: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className="btn danger" onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm">
      <button type="button" className="btn danger" onClick={onConfirm}>
        {confirm}
      </button>
      <button type="button" className="btn secondary" onClick={() => setArmed(false)}>
        Оставить
      </button>
    </span>
  );
}

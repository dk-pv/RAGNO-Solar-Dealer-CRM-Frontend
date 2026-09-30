"use client";

import { useState, type ComponentProps } from "react";

import { EyeIcon, EyeOffIcon } from "@/components/layout/icons";

type PasswordInputProps = Omit<ComponentProps<"input">, "type"> & {
  /** Names the field in the toggle's label: "confirm password" gives "Show confirm password". */
  label?: string;
};

// A password field with a show/hide button inside it, on the right. Hidden by default; each field toggles on its own.
// Only the input's type changes, so the value, validation and form submission behave exactly as before.
export function PasswordInput({ label = "password", className = "", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const action = `${visible ? "Hide" : "Show"} ${label}`;

  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${className} pr-10`} />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={action}
        aria-controls={props.id}
        title={action}
        className="absolute inset-y-0 right-0 grid w-9 place-items-center rounded-r-md text-faint hover:text-label focus-visible:text-primary"
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  );
}

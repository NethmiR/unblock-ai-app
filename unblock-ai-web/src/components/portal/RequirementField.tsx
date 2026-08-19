"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PersonValue, RequirementType, RequirementValue, TaskRequirement } from "@/types/task";

const FIELD_CLASS =
  "w-full rounded-control border border-line-admin bg-surface px-3.5 py-2.5 text-[14.5px] text-ink placeholder:text-faint focus:outline-none";

/**
 * The HTML input type to render per requirement type.
 *
 * `datetime` maps to a DATE input on purpose: the server sends `datetime`
 * through `coerceDate`, which tests /^\d{4}-\d{2}-\d{2}$/, and an
 * `<input type="datetime-local">` emits `YYYY-MM-DDTHH:mm` - rejected every time.
 *
 * `enum` is a text input, not a <select>: it is validated server-side as a plain
 * string and the requirement carries no option list, so there are no options to
 * render. Revisit if the API ever exposes them.
 */
const INPUT_TYPE: Partial<Record<RequirementType, string>> = {
  email: "email",
  number: "number",
  date: "date",
  datetime: "date",
  phone: "tel",
};

/** Mirrors the simple server rules into input attributes. Courtesy, not contract. */
function attrsFrom(requirement: TaskRequirement) {
  const v = requirement.validation;
  if (!v) return {};
  return {
    minLength: v.min_length ?? undefined,
    maxLength: v.max_length ?? undefined,
    min: v.min ?? undefined,
    max: v.max ?? undefined,
    pattern: v.pattern ?? undefined,
  };
  // The cross-field date rules (not_before_field / not_after_field) are
  // deliberately NOT mirrored - they resolve against every value collected so
  // far, and against "today", server-side. Duplicating that logic here would
  // drift from value-validator.util.ts. The server owns it.
}

/**
 * Renders the control for ONE requirement and emits a correctly TYPED value.
 *
 * Type branching is not polish. `POST /tasks/:id/values` coerces strictly per
 * `requirement.type`: `boolean` rejects the strings "true"/"false", and `person`
 * wants an object. A generic string-valued form 400s on the first typed input -
 * and `requester_email` guarantees every workflow now has one.
 *
 * Holds its own draft state, so the CALLER must key this on `requirement.key`.
 * That is what clears the control as the loop advances - resetting via an effect
 * instead would render the previous answer for a frame first.
 */
export function RequirementField({
  requirement,
  isBusy,
  onSubmit,
}: {
  requirement: TaskRequirement;
  isBusy: boolean;
  onSubmit: (value: RequirementValue) => void;
}) {
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(false);
  const [person, setPerson] = useState<PersonValue>({ name: "", email: "" });

  const { type } = requirement;

  function currentValue(): RequirementValue {
    if (type === "boolean") return checked;          // a real boolean, never "true"
    if (type === "person") return { name: person.name.trim(), email: person.email.trim() };
    if (type === "number") return text.trim() === "" ? null : Number(text);
    return text;
  }

  /** Blocks only empties - everything else is the server's call to make. */
  function canSubmit(): boolean {
    if (isBusy) return false;
    if (type === "boolean") return true;             // false is a valid answer
    if (type === "person") return person.name.trim() !== "" && person.email.trim() !== "";
    if (!requirement.required) return true;          // optional may be sent blank
    return text.trim() !== "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit()) return;
    onSubmit(currentValue());
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="mb-1.5 block text-[15px] font-semibold tracking-tight" htmlFor={requirement.key}>
        {requirement.label}
        {!requirement.required && <span className="ml-2 text-[13px] font-normal text-faint">(optional)</span>}
      </label>

      {requirement.description && (
        <p className="mb-3 text-[13.5px] leading-relaxed text-muted">{requirement.description}</p>
      )}
      {requirement.collection_hint && (
        <p className="mb-3 text-[13px] leading-relaxed text-faint">{requirement.collection_hint}</p>
      )}

      <div className="mb-6 mt-3">
        {type === "text" ? (
          <textarea
            id={requirement.key}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            autoFocus
            {...attrsFrom(requirement)}
            className={`${FIELD_CLASS} resize-none`}
          />
        ) : type === "boolean" ? (
          <label className="flex cursor-pointer items-center gap-3 text-[14.5px] text-ink">
            <input
              id={requirement.key}
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Yes
          </label>
        ) : type === "person" ? (
          // Two fields, one object. Actor requirements (the approvers) are all
          // `person`, and both parts are validated server-side.
          <div className="flex flex-col gap-3">
            <input
              id={requirement.key}
              type="text"
              value={person.name}
              onChange={(e) => setPerson((p) => ({ ...p, name: e.target.value }))}
              placeholder="Full name"
              autoFocus
              className={FIELD_CLASS}
            />
            <input
              type="email"
              value={person.email}
              onChange={(e) => setPerson((p) => ({ ...p, email: e.target.value }))}
              placeholder="name@example.com"
              className={FIELD_CLASS}
            />
          </div>
        ) : (
          <input
            id={requirement.key}
            type={INPUT_TYPE[type] ?? "text"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            {...attrsFrom(requirement)}
            className={FIELD_CLASS}
          />
        )}
      </div>

      <Button type="submit" disabled={!canSubmit()} className="h-[46px] rounded-card px-[22px] text-[15px] font-medium">
        {isBusy ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}

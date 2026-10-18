"use client";

import { useId, useState } from "react";
import { fieldExperience, type Profile } from "@/lib/validation";
import { learningFieldLabel, learningFieldKind } from "@/lib/learning-catalog";

export default function ActivityFields({
  fields,
}: {
  fields: NonNullable<Profile["learning_fields"]>;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const visible = expanded ? fields : fields.slice(0, 2);
  return (
    <span className="activity-fields">
      <span className="activity-fields-list" id={id}>
        {visible.map((item) => (
          <span
            className={`post-field-badge field-kind-${learningFieldKind(item.field)}`}
            key={item.field}
          >
            <span>{learningFieldLabel(item.field)}</span>
            <span className="post-field-level">{fieldExperience(item)}</span>
          </span>
        ))}
      </span>
      {fields.length > 2 && (
        <button
          type="button"
          className="text-button activity-fields-toggle"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "閉じる" : `ほか${fields.length - 2}件`}
        </button>
      )}
    </span>
  );
}

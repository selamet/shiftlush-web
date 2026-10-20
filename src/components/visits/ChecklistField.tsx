import { useTranslation } from "react-i18next";
import type { MaintenanceChecklistItem, MaintenanceChecklistResult } from "@/api/enums";
import { enumLabel } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  CHECKLIST_ITEMS,
  CHECKLIST_RESULTS,
  answeredCount,
  type Checklist,
} from "@/lib/visit";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/field";

/** The id of the first segment of a row, so the form can move focus to it. */
export function checklistInputId(item: MaintenanceChecklistItem): string {
  return `visit-check-${item}`;
}

/**
 * The sixteen rows, each a three-way answer, none of them answered.
 *
 * Controlled, unlike every other field in this product's forms, because the
 * answers decide what else is on screen: the counter, whether the save button
 * is live, and a note box under every row marked "attention needed". None of
 * that can be read off an uncontrolled form without re-reading it on every tap.
 */
export function ChecklistField({
  checklist,
  onChange,
  required,
}: {
  checklist: Checklist;
  onChange: (next: Checklist) => void;
  /** True when every row must be answered — a visit being recorded as complete. */
  required: boolean;
}) {
  const { t } = useTranslation();
  const answered = answeredCount(checklist);

  const options: SegmentedOption<MaintenanceChecklistResult>[] = CHECKLIST_RESULTS.map(
    (value) => ({
      value,
      label: enumLabel("visit.checklistResult", value),
      tone: value === "attention_needed" ? "warning" : "default",
    }),
  );

  function answer(item: MaintenanceChecklistItem, result: MaintenanceChecklistResult) {
    // The note survives a change of answer and back again: a technician who
    // taps "OK" by mistake on a row they had written about should not lose
    // what they wrote. Only what is visible is sent — see `buildVisitBody`.
    onChange({ ...checklist, [item]: { result, note: checklist[item]?.note ?? "" } });
  }

  function note(item: MaintenanceChecklistItem, text: string) {
    const current = checklist[item];
    if (!current) return;
    onChange({ ...checklist, [item]: { ...current, note: text } });
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="visit-checklist-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="visit-checklist-title" className="text-cardtitle">
          {t("visit.checklist")}
          {!required && (
            <span className="ml-2 text-help font-normal text-muted-foreground">
              {t("common.optional")}
            </span>
          )}
        </h2>
        {/* Live, so a screen reader hears the count move as rows are answered
            rather than having to go looking for it. Polite: it must never talk
            over the label of the row the person just moved to. */}
        <span
          aria-live="polite"
          className={cn(
            "tnum shrink-0 rounded-full px-2.5 py-0.5 text-label",
            answered === CHECKLIST_ITEMS.length
              ? "bg-success-bg text-success"
              : "bg-muted text-muted-foreground",
          )}
        >
          {t("visit.answeredCount", { answered, total: CHECKLIST_ITEMS.length })}
        </span>
      </div>

      <ol className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-card">
        {CHECKLIST_ITEMS.map((item, index) => {
          const current = checklist[item];
          const attention = current?.result === "attention_needed";
          return (
            <li
              key={item}
              className={cn(
                "flex flex-col gap-2 p-3",
                attention && "border-l-[3px] border-l-warning",
              )}
            >
              <Segmented
                name={`check-${item}`}
                // Numbered, because "the ninth one" is how two technicians
                // talk about a row over the phone.
                label={`${index + 1}. ${enumLabel("visit.checklistItem", item)}`}
                options={options}
                value={current?.result}
                onChange={(result) => answer(item, result)}
                firstInputId={checklistInputId(item)}
              />
              {attention && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`visit-note-${item}`} className="text-help text-muted-foreground">
                    {t("visit.attentionNote")}
                  </label>
                  <Textarea
                    id={`visit-note-${item}`}
                    rows={2}
                    value={current?.note ?? ""}
                    onChange={(event) => note(item, event.target.value)}
                    placeholder={t("visit.attentionNotePlaceholder")}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

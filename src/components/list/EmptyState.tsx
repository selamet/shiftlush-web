import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Inbox, SearchX, ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * A new company lands on five empty lists at once, and the records only make
 * sense in order — a building needs a customer, an elevator needs a building.
 * So an empty list does not just say "nothing here": when its prerequisite is
 * missing it points at that instead, and the five empty states become the
 * onboarding path without a separate wizard.
 *
 * "No records at all" and "no rows matched the filter" are different problems
 * and get different treatments — offering "add the first customer" to someone
 * who just filtered 342 rows down to zero is noise.
 */
interface EmptyStateProps {
  /** Set when the list is empty only because a filter is applied. */
  filtered?: boolean;
  onClearFilters?: () => void;
  titleKey: string;
  /** The record that must exist first, if any. */
  prerequisite?: { labelKey: string; to: string };
  /**
   * The create action, and where it goes.
   *
   * Both or neither. The label used to arrive without the destination, which
   * rendered a button that did nothing — in the middle of the screen, on a
   * list that is empty, which is the one moment the design is pointing the
   * reader at it. The header's copy of the same action worked, so the product
   * offered a live control and a dead one under the same words.
   */
  actionKey?: string;
  actionTo?: string;
}

export function EmptyState({
  filtered,
  onClearFilters,
  titleKey,
  prerequisite,
  actionKey,
  actionTo,
}: EmptyStateProps) {
  const { t } = useTranslation();

  if (filtered) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <SearchX className="size-8 text-subtle" aria-hidden="true" />
        <p className="text-body text-muted-foreground">{t("empty.noFilterResults")}</p>
        {onClearFilters && (
          <Button variant="secondary" size="sm" onClick={onClearFilters}>
            {t("list.clearAll")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Inbox className="size-8 text-subtle" aria-hidden="true" />
      <p className="text-body text-muted-foreground">{t(titleKey)}</p>

      {prerequisite ? (
        <>
          <p className="max-w-sm text-help text-subtle">{t("empty.prerequisiteHint")}</p>
          <Link to={prerequisite.to} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            {t(prerequisite.labelKey)}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </>
      ) : (
        actionKey &&
        actionTo && (
          <Link to={actionTo} className={buttonVariants({ size: "sm" })}>
            {t(actionKey)}
          </Link>
        )
      )}
    </div>
  );
}

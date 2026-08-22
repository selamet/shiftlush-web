import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  customerListQuery,
  setAssignedCustomers,
  userKeys,
  type TeamUser,
} from "@/api/queries";
import { errorMessage } from "@/api/errors";
import { useSubmit } from "@/lib/form";
import { enumLabel } from "@/lib/i18n";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Which customers a technician may see.
 *
 * Not a preference. A technician's whole product is derived from this list: the
 * customers, buildings and elevators they can open are the ones reachable from
 * a row in it, and a technician with nothing assigned sees an empty list
 * everywhere — which the server treats as a correct answer rather than an
 * error, so nothing else on their screen will say why.
 *
 * The panel exists only for technicians because the endpoint refuses anybody
 * else: every other role sees the whole firm, and `ONLY_TECHNICIANS_ARE_ASSIGNED`
 * is what comes back if you ask.
 */
export function AssignedCustomers({ user }: { user: TeamUser }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(user.assigned_customer_ids);
  const [saved, setSaved] = useState(false);

  // Searched on the server. The client holds one page, and a firm with more
  // customers than that has to be able to reach the rest.
  const customers = useQuery(customerListQuery({ page_size: 100, search: search.trim() }));

  /**
   * The set as it arrived, used for ordering only.
   *
   * Rows are sorted by this rather than by the live selection: sorting by what
   * is ticked would make a row jump out from under the pointer the moment it
   * was ticked.
   */
  const arrived = useMemo(() => new Set(user.assigned_customer_ids), [user.assigned_customer_ids]);

  const rows = useMemo(() => {
    const all = customers.data?.results ?? [];
    if (search.trim()) return all;
    return [...all].sort((a, b) => Number(arrived.has(b.id)) - Number(arrived.has(a.id)));
  }, [customers.data, search, arrived]);

  const { submit, state } = useSubmit<string[], TeamUser>({
    mutationFn: (ids) => setAssignedCustomers(user.id, ids),
    invalidate: [userKeys.all],
    onSuccess: () => setSaved(true),
  });

  const dirty =
    selected.length !== arrived.size || selected.some((id) => !arrived.has(id));

  const total = customers.data?.pagination.total ?? 0;
  const truncated = total > rows.length;

  function toggle(id: string) {
    setSaved(false);
    setSelected((current) =>
      current.includes(id) ? current.filter((one) => one !== id) : [...current, id],
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("user.assignedHeading")}</CardTitle>
        <CardDescription>{t("user.assignedBody")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-3 size-4 text-subtle"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("user.assignedSearch")}
            className="h-control-md w-full rounded-md border border-input bg-card pl-9 pr-3 text-body placeholder:text-subtle focus-ring pointer-coarse:h-control-lg"
          />
        </label>

        {customers.isError ? (
          <Alert tone="error" block title={errorMessage(customers.error, t)} />
        ) : customers.isPending ? (
          <p className="py-6 text-center text-help text-muted-foreground">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-help text-muted-foreground">{t("common.noMatch")}</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border-subtle overflow-y-auto rounded-md border border-border-subtle">
            {rows.map((customer) => (
              <li key={customer.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={selected.includes(customer.id)}
                    onChange={() => toggle(customer.id)}
                    className="size-4 shrink-0 rounded-xs accent-primary"
                  />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-body">{customer.legal_name}</span>
                    <span className="truncate text-help text-muted-foreground">
                      {enumLabel("customer.type", customer.type)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {truncated && (
          <p className="text-help text-muted-foreground">
            {t("user.assignedTruncated", { shown: rows.length, total })}
          </p>
        )}

        {/* An empty set is a valid state the server accepts, and it is also the
            state in which this person sees nothing at all. Said plainly, since
            no other screen of theirs will explain the emptiness. */}
        {selected.length === 0 ? (
          <Alert tone="warning" block title={t("user.assignedNone")} />
        ) : (
          <p className="text-help text-muted-foreground">
            {t("user.assignedCount", { count: selected.length })}
          </p>
        )}

        {state.message && <p className="text-help text-destructive">{state.message}</p>}

        <div className="flex items-center gap-3">
          <Button size="sm" disabled={state.pending || !dirty} onClick={() => submit(selected)}>
            {state.pending ? t("common.saving") : t("user.assignedSave")}
          </Button>
          {saved && !dirty && (
            <span className="text-help text-muted-foreground">{t("user.assignedSaved")}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

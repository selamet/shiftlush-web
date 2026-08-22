import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";
import { buildingListQuery, complexKeys, complexQuery, deleteComplex } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";
import { enumLabel } from "@/lib/i18n";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function Card({ title, action, children }: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border-subtle bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-cardtitle">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-0">
      <span className="text-help text-muted-foreground">{label}</span>
      <span className="text-cell text-right">{value || "—"}</span>
    </div>
  );
}

export function ComplexDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id?: string };

  const complexId = id ?? "";
  const query = useQuery({ ...complexQuery(complexId), enabled: Boolean(complexId) });

  // Filtered on the server, the way the customer page filters its buildings: a
  // firm with five hundred buildings would otherwise download all of them to
  // show the eight blocks in this estate.
  const buildingsQuery = useQuery({
    ...buildingListQuery({ complex: complexId, page_size: 100 }),
    enabled: Boolean(complexId),
  });

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function remove() {
    setConfirming(false);
    setDeleteError("");
    try {
      await deleteComplex(complexId);
      await queryClient.invalidateQueries({ queryKey: complexKeys.all });
      void navigate({ to: "/complexes" });
    } catch (error) {
      // Most often RECORD_IN_USE: a block was added to this complex between
      // the page loading and the button being pressed, so the count the screen
      // decided on is no longer true.
      setDeleteError(errorMessage(error, t));
    }
  }

  if (query.isPending) return <DetailSkeleton />;

  if (query.isError || !query.data) {
    return (
      <ListError
        message={errorMessage(query.error, t)}
        reference={supportReference(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const complex = query.data;
  const buildings = buildingsQuery.data?.results ?? [];

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
            <Link to="/complexes" className="hover:underline">
              {t("complex.title")}
            </Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span className="text-foreground">{complex.name}</span>
          </nav>
          <h1 className="text-title">{complex.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/complexes/$id/edit"
            params={{ id: complex.id }}
            className={buttonVariants({ size: "sm" })}
          >
            <Pencil />
            {t("common.edit")}
          </Link>
          {/* Offered only when the complex is empty. The server refuses while
              it still holds buildings, and a button whose only possible answer
              is an error is worse than no button. */}
          {complex.building_count === 0 ? (
            <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
              <Trash2 />
              {t("common.delete")}
            </Button>
          ) : (
            <p className="max-w-56 text-help text-muted-foreground">
              {t("complex.deleteBlocked", { count: complex.building_count })}
            </p>
          )}
        </div>
      </div>

      {deleteError && <Alert tone="error" block title={deleteError} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card
          title={t("complexDetail.buildings")}
          action={
            <Link
              to="/buildings/new"
              search={{ customer: complex.customer_id }}
              className="text-help text-primary hover:underline"
            >
              {t("building.add")}
            </Link>
          }
        >
          {buildings.length === 0 ? (
            <p className="py-2 text-help text-subtle">{t("empty.noBuildings")}</p>
          ) : (
            <div className="flex flex-col">
              {buildings.map((building) => (
                <Link
                  key={building.id}
                  to="/buildings/$id/edit"
                  params={{ id: building.id }}
                  className="flex items-center justify-between gap-3 border-b border-border-subtle py-2.5 last:border-0 hover:bg-muted"
                >
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-cell">{building.name}</span>
                    <span className="truncate text-help text-muted-foreground">
                      {enumLabel("building.type", building.type)}
                    </span>
                  </span>
                  <span className="shrink-0 tnum text-help text-muted-foreground">
                    {building.elevator_count} {t("customer.elevatorCount")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card title={t("complex.singular")}>
          <div className="flex flex-col">
            {/* The customer, not just its name: a complex is only ever reached
                through one, and the block names inside say nothing about whose
                they are. */}
            <Row
              label={t("customer.singular")}
              value={
                <Link
                  to="/customers/$id"
                  params={{ id: complex.customer_id }}
                  className="hover:underline"
                >
                  {complex.customer_name}
                </Link>
              }
            />
            <Row label={t("address.fields.neighborhood")} value={complex.neighborhood_name} />
            <Row label={t("address.fields.district")} value={complex.district_name} />
            <Row label={t("address.fields.street")} value={complex.street} />
            <Row label={t("address.fields.buildingNumber")} value={complex.building_number} />
            <Row label={t("complex.fields.notes")} value={complex.notes} />
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirming}
        title={t("complex.deleteTitle")}
        body={t("complex.deleteBody", { name: complex.name })}
        confirmLabel={t("common.delete")}
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

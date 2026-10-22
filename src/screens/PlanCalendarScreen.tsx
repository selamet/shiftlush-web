import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Move } from "lucide-react";
import {
  planKeys,
  plannedVisitEveryQuery,
  updatePlannedVisit,
  visitTechniciansQuery,
  type PlannedVisit,
  type PlannedVisitEdit,
} from "@/api/queries";
import { errorMessage, fieldErrors } from "@/api/errors";
import {
  addDays,
  endOfMonth,
  longDateLabel,
  monthGrid,
  monthYearLabel,
  startOfMonth,
  toDisplay,
  todayIso,
  weekdayLabels,
} from "@/lib/date";
import { useListSearch } from "@/lib/list-search";
import { canManagePlan, periodOf, periodsForWeek } from "@/lib/plan";
import {
  BUSY_DAY,
  cellKey,
  dropTarget,
  isDropAllowed,
  layoutWeek,
  monthLoad,
  weekDays,
  type DropSpot,
} from "@/lib/plan-calendar";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { calendarFilters } from "@/screens/list-searches";
import { PlanRestricted } from "@/components/plan/PlanRestricted";
import { PlanRowFlags } from "@/components/plan/PlanRowFlags";
import { PlanViewSwitch } from "@/components/plan/PlanViewSwitch";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";

const TRAY = "tray";

/**
 * The cell under the pointer is the one meant. dnd-kit's default reads the
 * card's own rectangle, and a card picked up by its top-left corner then lands
 * a column to the right of where the hand let go. The keyboard has no pointer,
 * so it falls back to the rectangle.
 */
const underThePointer: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

interface Person {
  id: string | null;
  name: string;
}

/**
 * The office's plan as a calendar: a week of days by technicians, where a
 * visit is moved by dragging it, or a month that shows how the work is spread.
 *
 * The rows are the same rows as the list; only how they are laid out differs.
 * A drop is one PATCH, shown at once and put back — with the server's reason —
 * if it is refused. Every drop has a keyboard path too: the "move" action on each card
 * opens the same change as a small form. Not offered on a phone, where the
 * list is the plan.
 */
export function PlanCalendarScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const list = useListSearch(calendarFilters);
  const today = todayIso();
  const anchor = list.filters.week ?? today;
  const view = list.filters.view === "month" ? "month" : "week";

  if (!canManagePlan(role)) return <PlanRestricted titleKey="plan.restricted" />;

  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title">{t("plan.title")}</h1>
        <PlanViewSwitch current="calendar" />
      </div>
      {/* The calendar needs room for seven columns; a phone gets the list. */}
      <p className="text-body text-muted-foreground md:hidden">{t("plan.calendar.phone")}</p>
      <div className="hidden md:block">
        {view === "month" ? (
          <MonthView
            anchor={anchor}
            onPickDay={(day) => list.setFilters({ view: null, week: day === today ? null : day })}
            onWeek={() => list.setFilter("view", null)}
            onMove={(day) => list.setFilter("week", day)}
          />
        ) : (
          <WeekView
            anchor={anchor}
            today={today}
            onMove={(day) => list.setFilter("week", day === today ? null : day)}
            onMonth={() => list.setFilter("view", "month")}
          />
        )}
      </div>
    </div>
  );
}

/** The firm's technicians, plus anyone a row names who is no longer offered (a deactivated colleague). */
function usePeople(rows: readonly PlannedVisit[]): Person[] {
  const { t } = useTranslation();
  const technicians = useQuery(visitTechniciansQuery());
  const people: Person[] = [{ id: null, name: t("plan.calendar.unassigned") }];
  const seen = new Set<string>();
  for (const technician of technicians.data ?? []) {
    seen.add(technician.id);
    people.push({ id: technician.id, name: technician.name });
  }
  for (const row of rows) {
    if (row.technician && !seen.has(row.technician)) {
      seen.add(row.technician);
      people.push({ id: row.technician, name: row.technician_name ?? "—" });
    }
  }
  return people;
}

function WeekView({
  anchor,
  today,
  onMove,
  onMonth,
}: {
  anchor: string;
  today: string;
  onMove: (day: string) => void;
  onMonth: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const days = weekDays(anchor);
  const periods = periodsForWeek(anchor);

  // Per period the server requires one: the week's planned rows, and the rows
  // with no day that wait in the tray.
  const planned = useQueries({
    queries: periods.map((period) =>
      plannedVisitEveryQuery({ period, planned_from: days[0], planned_to: days[6] }),
    ),
  });
  const waiting = useQueries({
    queries: periods.map((period) => plannedVisitEveryQuery({ period, unscheduled: "true", status: "planned" })),
  });
  const failed = [...planned, ...waiting].find((query) => query.isError);
  const loading = [...planned, ...waiting].some((query) => query.isPending);

  // A drop shows at once. The override is the row as the drop left it, until
  // the server's answer and the refetch replace it, or a refusal removes it.
  const [moved, setMoved] = useState<Record<string, Partial<PlannedVisit>>>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [dragging, setDragging] = useState<PlannedVisit | null>(null);
  const [moving, setMoving] = useState<PlannedVisit | null>(null);

  const rows = [...planned, ...waiting]
    .flatMap((query) => query.data ?? [])
    .map((row) => (moved[row.id] ? { ...row, ...moved[row.id] } : row));
  const unique = [...new Map(rows.map((row) => [row.id, row])).values()];
  const people = usePeople(unique);
  const layout = layoutWeek(unique, days);

  const save = useMutation({
    mutationFn: ({ row, body }: { row: PlannedVisit; body: PlannedVisitEdit }) => updatePlannedVisit(row.id, body),
    onMutate: ({ row, body }) => {
      setRefusal(null);
      setMoved((current) => ({ ...current, [row.id]: body as Partial<PlannedVisit> }));
    },
    onError: (error, { row }) => {
      // The rule that refused it — "outside its month", "a past day" — rather
      // than the generic "the form has errors" a validation failure carries.
      const reason = Object.values(fieldErrors(error, t))[0] ?? errorMessage(error, t);
      setRefusal(t("plan.calendar.refused", { lift: row.elevator_name, reason }));
    },
    onSettled: async (_data, _error, { row }) => {
      await queryClient.invalidateQueries({ queryKey: planKeys.all });
      setMoved((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
    },
  });

  function apply(row: PlannedVisit, spot: DropSpot) {
    const body = dropTarget(row, spot);
    if (body) save.mutate({ row, body });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function onDragStart(event: DragStartEvent) {
    setDragging(unique.find((row) => row.id === event.active.id) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const row = unique.find((one) => one.id === event.active.id);
    if (!row || !event.over) return;
    const target = String(event.over.id);
    if (target === TRAY) {
      if (isDropAllowed(row, null, today)) apply(row, { tray: true });
      return;
    }
    const [technician, day] = target.split("|");
    if (isDropAllowed(row, day, today)) apply(row, { technician: technician || null, day });
  }

  const labels = weekdayLabels();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={underThePointer}
      onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="icon" variant="ghost" aria-label={t("plan.calendar.previousWeek")} onClick={() => onMove(addDays(days[0], -7))}>
            <ChevronLeft />
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onMove(today)}>
            {t("plan.calendar.thisWeek")}
          </Button>
          <Button size="icon" variant="ghost" aria-label={t("plan.calendar.nextWeek")} onClick={() => onMove(addDays(days[0], 7))}>
            <ChevronRight />
          </Button>
          <span className="tnum text-cardtitle">
            {toDisplay(days[0])} – {toDisplay(days[6])}
          </span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onMonth}>
            {t("plan.calendar.monthView")}
          </Button>
        </div>

        {refusal && <Alert tone="error" block title={refusal} />}
        {failed && <Alert tone="error" block title={errorMessage(failed.error, t)} />}

        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border-subtle bg-card" aria-busy={loading}>
            <div className="grid min-w-[50rem] grid-cols-[9rem_repeat(7,minmax(5.75rem,1fr))]">
              <div className="border-b border-border bg-background" />
              {days.map((day, index) => (
                <div
                  key={day}
                  className={cn(
                    "border-b border-l border-border bg-background px-2 py-1.5 text-help",
                    index === 6 && "bg-muted",
                    day === today && "font-semibold text-foreground",
                  )}
                >
                  <abbr title={labels[index].long} className="no-underline">
                    {labels[index].short}
                  </abbr>{" "}
                  <span className="tnum">{toDisplay(day).slice(0, 5)}</span>
                </div>
              ))}
              {people.map((person) => (
                <PersonRow
                  key={person.id ?? "unassigned"}
                  person={person}
                  days={days}
                  today={today}
                  cells={layout.cells}
                  dragging={dragging}
                  onMove={setMoving}
                />
              ))}
            </div>
          </div>
          <Tray rows={layout.tray} dragging={dragging} today={today} onMove={setMoving} />
        </div>
      </div>
      {moving && (
        <MoveDialog
          row={moving}
          people={people}
          today={today}
          onClose={() => setMoving(null)}
          onSave={(spot) => {
            apply(moving, spot);
            setMoving(null);
          }}
        />
      )}
    </DndContext>
  );
}

function PersonRow({
  person,
  days,
  today,
  cells,
  dragging,
  onMove,
}: {
  person: Person;
  days: string[];
  today: string;
  cells: Map<string, PlannedVisit[]>;
  dragging: PlannedVisit | null;
  onMove: (row: PlannedVisit) => void;
}) {
  return (
    <>
      <div className="flex items-start border-b border-border-subtle px-3 py-2 text-cell font-medium">{person.name}</div>
      {days.map((day, index) => (
        <DayCell
          key={day}
          id={cellKey(person.id, day)}
          rows={cells.get(cellKey(person.id, day)) ?? []}
          sunday={index === 6}
          blocked={dragging !== null && !isDropAllowed(dragging, day, today)}
          onMove={onMove}
        />
      ))}
    </>
  );
}

function DayCell({
  id,
  rows,
  sunday,
  blocked,
  onMove,
}: {
  id: string;
  rows: PlannedVisit[];
  sunday: boolean;
  blocked: boolean;
  onMove: (row: PlannedVisit) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id, disabled: blocked });
  const busy = rows.filter((row) => row.status !== "cancelled").length;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-20 flex-col gap-1 border-b border-l border-border-subtle p-1",
        sunday && "bg-muted/60",
        blocked && "bg-muted opacity-60",
        isOver && !blocked && "bg-primary/10 outline outline-2 -outline-offset-2 outline-primary",
      )}
    >
      {busy > 0 && (
        <span
          className={cn("tnum self-end text-help text-muted-foreground", busy > BUSY_DAY && "font-semibold text-warning")}
          title={busy > BUSY_DAY ? t("plan.calendar.busy", { count: busy }) : undefined}
        >
          {busy}
        </span>
      )}
      {rows.map((row) => (
        <VisitCard key={row.id} row={row} onMove={onMove} />
      ))}
    </div>
  );
}

function Tray({
  rows,
  dragging,
  today,
  onMove,
}: {
  rows: PlannedVisit[];
  dragging: PlannedVisit | null;
  today: string;
  onMove: (row: PlannedVisit) => void;
}) {
  const { t } = useTranslation();
  const blocked = dragging !== null && !isDropAllowed(dragging, null, today);
  const { setNodeRef, isOver } = useDroppable({ id: TRAY, disabled: blocked });
  return (
    <aside
      ref={setNodeRef}
      aria-label={t("plan.calendar.tray")}
      className={cn(
        "flex max-h-[70vh] flex-col gap-2 overflow-y-auto rounded-lg border border-border-subtle bg-card p-3 xl:w-64 xl:shrink-0",
        isOver && !blocked && "outline outline-2 -outline-offset-2 outline-primary",
      )}
    >
      <h2 className="text-cardtitle">
        {t("plan.calendar.tray")} <span className="tnum text-muted-foreground">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-help text-muted-foreground">{t("plan.calendar.trayEmpty")}</p>
      ) : (
        rows.map((row) => <VisitCard key={row.id} row={row} onMove={onMove} showTechnician />)
      )}
    </aside>
  );
}

function VisitCard({
  row,
  onMove,
  showTechnician,
}: {
  row: PlannedVisit;
  onMove: (row: PlannedVisit) => void;
  showTechnician?: boolean;
}) {
  const { t } = useTranslation();
  const closed = row.status !== "planned";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id, disabled: closed });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex flex-col gap-0.5 rounded-md border border-border bg-card px-2 py-1 text-help shadow-sm",
        row.is_overdue && "border-l-[3px] border-l-foreground",
        closed && "opacity-60 shadow-none",
        isDragging && "z-20 shadow-lg",
      )}
    >
      <span
        {...listeners}
        {...attributes}
        aria-label={t("plan.calendar.drag", { lift: row.elevator_name })}
        className={cn("flex flex-col gap-0.5 focus-ring", closed ? "cursor-default" : "cursor-grab touch-none")}
      >
        <span className="truncate font-medium text-foreground">{row.elevator_name}</span>
        <span className="truncate text-muted-foreground">{row.building_name}</span>
        {showTechnician && row.technician_name && <span className="truncate">{row.technician_name}</span>}
      </span>
      <PlanRowFlags row={row} />
      {!closed && (
        <Button size="xs" variant="ghost" className="self-start" onClick={() => onMove(row)}>
          <Move aria-hidden="true" />
          {t("plan.calendar.move")}
        </Button>
      )}
    </div>
  );
}

/** The keyboard and touch path for a drop: the same day and technician, chosen in a form. */
function MoveDialog({
  row,
  people,
  today,
  onClose,
  onSave,
}: {
  row: PlannedVisit;
  people: Person[];
  today: string;
  onClose: () => void;
  onSave: (spot: DropSpot) => void;
}) {
  const { t } = useTranslation();
  const [day, setDay] = useState(row.planned_date ?? "");
  const [technician, setTechnician] = useState(row.technician ?? "");
  const monthStart = `${row.period}-01`;
  const first = today > monthStart ? today : monthStart;
  return (
    <Modal open onClose={onClose} label={t("plan.calendar.moveTitle", { lift: row.elevator_name })} className="max-w-md">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(day ? { technician: technician || null, day } : { tray: true });
        }}
      >
        <h2 className="text-cardtitle">{t("plan.calendar.moveTitle", { lift: row.elevator_name })}</h2>
        <Field label={t("plan.fields.plannedDate")} htmlFor="move-day" hint={t("plan.calendar.dayHint")}>
          <DatePicker id="move-day" value={day} onChange={setDay} min={first} max={endOfMonth(monthStart)} />
        </Field>
        <Field label={t("plan.fields.technician")} htmlFor="move-technician">
          <SearchableSelect
            id="move-technician"
            value={technician}
            onChange={(next) => setTechnician(next ?? "")}
            options={people.map((person) => ({ value: person.id ?? "", label: person.name }))}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit">{t("common.save")}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Read-only: how much each technician has on each day, to see where the month is heavy. */
function MonthView({
  anchor,
  onPickDay,
  onWeek,
  onMove,
}: {
  anchor: string;
  onPickDay: (day: string) => void;
  onWeek: () => void;
  onMove: (day: string) => void;
}) {
  const { t } = useTranslation();
  const period = periodOf(anchor);
  const query = useQuery(plannedVisitEveryQuery({ period, unscheduled: "false" }));
  const rows = query.data ?? [];
  const people = usePeople(rows);
  const names = new Map(people.map((person) => [person.id ?? "", person.name]));
  const load = monthLoad(rows);
  const labels = weekdayLabels();
  const first = startOfMonth(anchor);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="ghost" aria-label={t("plan.calendar.previousMonth")} onClick={() => onMove(addDays(first, -1))}>
          <ChevronLeft />
        </Button>
        <span className="text-cardtitle">{monthYearLabel(first)}</span>
        <Button size="icon" variant="ghost" aria-label={t("plan.calendar.nextMonth")} onClick={() => onMove(addDays(endOfMonth(first), 1))}>
          <ChevronRight />
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onWeek}>
          {t("plan.calendar.weekView")}
        </Button>
      </div>
      {query.isError && <Alert tone="error" block title={errorMessage(query.error, t)} />}
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-border-subtle bg-card" aria-busy={query.isPending}>
        {labels.map((label) => (
          <div key={label.long} className="border-b border-border bg-background px-2 py-1.5 text-help">
            <abbr title={label.long} className="no-underline">
              {label.short}
            </abbr>
          </div>
        ))}
        {monthGrid(first).flat().map((day) => {
          const counts = [...(load.get(day) ?? new Map<string, number>())];
          const outside = periodOf(day) !== period;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPickDay(day)}
              aria-label={t("plan.calendar.openWeek", { date: longDateLabel(day) })}
              className={cn(
                "flex min-h-20 flex-col items-start gap-0.5 border-b border-l border-border-subtle p-1.5 text-left hover:bg-muted focus-ring",
                outside && "bg-muted/60 text-subtle",
              )}
            >
              <span className="tnum text-help">{Number(day.slice(8))}</span>
              {!outside &&
                counts.map(([who, count]) => (
                  <span key={who} className={cn("tnum text-help", count > BUSY_DAY && "font-semibold text-warning")}>
                    {initials(names.get(who) ?? "?")} {count}
                  </span>
                ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR"))
    .join("");
}

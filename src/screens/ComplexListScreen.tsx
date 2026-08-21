import { Link } from "@tanstack/react-router";
import complexes from "@fixtures/demo-complexes.json";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";

type Complex = (typeof complexes)[number];

const columns: ListColumn<Complex>[] = [
  {
    key: "complex.fields.name",
    sticky: true,
    cell: (row) => (
      <Link to="/buildings" search={{ complex: row.id }} className="hover:underline">
        <Stacked primary={row.name} secondary={`${row.neighborhood} · ${row.district}`} />
      </Link>
    ),
  },
  {
    key: "complex.fields.customer",
    hideOnMobile: true,
    cell: (row) => row.customer,
  },
  { key: "customer.buildingCount", numeric: true, cell: (row) => row.building_count },
  { key: "customer.elevatorCount", numeric: true, cell: (row) => row.elevator_count },
];

export function ComplexListScreen() {
  return (
    <ListPage
      breadcrumbKey="nav.groups.records"
      titleKey="complex.title"
      primaryActionKey="complex.add"
      columns={columns}
      rows={complexes}
      rowKey={(row) => row.id}
      total={18}
      emptyTitleKey="empty.noComplexes"
      // A complex belongs to a customer, so there is nothing to create until
      // one exists — the empty state points there instead of offering "add".
      prerequisite={{ labelKey: "customer.add", to: "/customers" }}
    />
  );
}

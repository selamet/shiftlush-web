import { Link } from "@tanstack/react-router";
import buildings from "@fixtures/demo-buildings.json";
import { enumLabel } from "@/lib/i18n";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";

type Building = (typeof buildings)[number];

const columns: ListColumn<Building>[] = [
  {
    key: "building.fields.name",
    sticky: true,
    cell: (row) => (
      <Link to="/elevators" className="hover:underline">
        <Stacked primary={row.name} secondary={row.complex ?? row.customer} />
      </Link>
    ),
  },
  {
    key: "building.fields.type",
    hideOnMobile: true,
    cell: (row) => enumLabel("building.type", row.type),
  },
  {
    key: "address.fields.neighborhood",
    hideOnMobile: true,
    cell: (row) => <Stacked primary={row.neighborhood} secondary={row.district} />,
  },
  { key: "building.fields.floorCount", numeric: true, cell: (row) => row.floor_count ?? "—" },
  { key: "building.fields.unitCount", numeric: true, cell: (row) => row.unit_count ?? "—" },
  { key: "customer.elevatorCount", numeric: true, cell: (row) => row.elevator_count },
];

export function BuildingListScreen() {
  return (
    <ListPage
      breadcrumbKey="nav.groups.records"
      titleKey="building.title"
      primaryActionKey="building.add"
      primaryActionTo="/buildings/new"
      exportable
      filters={[
        { labelKey: "building.fields.type" },
        { labelKey: "customer.singular" },
        { labelKey: "complex.singular" },
      ]}
      columns={columns}
      rows={buildings}
      rowKey={(row) => row.id}
      total={104}
      emptyTitleKey="empty.noBuildings"
      prerequisite={{ labelKey: "customer.add", to: "/customers" }}
    />
  );
}

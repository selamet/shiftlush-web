import {
  Building2,
  Users,
  LayoutGrid,
  ArrowUpDown,
  FileText,
  QrCode,
  UserCog,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export type Role = "owner" | "admin" | "operations" | "technician" | "accountant";

export const ROLES: Role[] = ["owner", "admin", "operations", "technician", "accountant"];

export interface NavItem {
  to: string;
  /** Translation key, never a literal — see the language rule in the README. */
  labelKey: string;
  icon: LucideIcon;
  roles: Role[];
  /** Marks a value the system scoped for the user rather than one they chose. */
  badgeKey?: string;
  badgeRoles?: Role[];
  /** Per-role label override, e.g. the technician's scoped customer list. */
  labelOverride?: Partial<Record<Role, string>>;
}

export interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

/**
 * The sidebar narrows by dropping whole groups, not by disabling items.
 *
 * A greyed-out entry would remind the user every day of something they can
 * never reach; an absent one simply is not part of their product. A group whose
 * items are all hidden disappears with its heading — no empty headings.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.groups.records",
    items: [
      {
        to: "/customers",
        labelKey: "customer.title",
        icon: Users,
        roles: ["owner", "admin", "operations", "technician", "accountant"],
        // The technician sees only assigned customers, so the label says so and
        // the dashed chip marks it as system-scoped. An empty list is then a
        // stated condition rather than a failure.
        labelOverride: { technician: "nav.myCustomers" },
        badgeKey: "nav.assigned",
        badgeRoles: ["technician"],
      },
      {
        to: "/complexes",
        labelKey: "complex.title",
        icon: LayoutGrid,
        roles: ["owner", "admin", "operations"],
      },
      {
        to: "/buildings",
        labelKey: "building.title",
        icon: Building2,
        roles: ["owner", "admin", "operations", "technician"],
      },
      {
        to: "/elevators",
        labelKey: "elevator.title",
        icon: ArrowUpDown,
        roles: ["owner", "admin", "operations", "technician"],
      },
    ],
  },
  {
    labelKey: "nav.groups.commercial",
    items: [
      {
        to: "/contracts",
        labelKey: "contract.title",
        icon: FileText,
        roles: ["owner", "admin", "operations", "accountant"],
      },
    ],
  },
  {
    labelKey: "nav.groups.tools",
    items: [
      {
        to: "/qr-labels",
        labelKey: "qr.title",
        icon: QrCode,
        roles: ["owner", "admin", "operations", "technician"],
      },
    ],
  },
  {
    labelKey: "nav.groups.administration",
    items: [
      {
        to: "/users",
        labelKey: "user.title",
        icon: UserCog,
        roles: ["owner", "admin"],
      },
      {
        to: "/audit-logs",
        labelKey: "nav.auditLogs",
        icon: ScrollText,
        roles: ["owner", "admin"],
      },
    ],
  },
];

export function visibleGroups(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

export function itemLabelKey(item: NavItem, role: Role): string {
  return item.labelOverride?.[role] ?? item.labelKey;
}

export function itemBadgeKey(item: NavItem, role: Role): string | undefined {
  return item.badgeRoles?.includes(role) ? item.badgeKey : undefined;
}

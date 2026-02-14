import { RouteGuard } from "@/components/auth/route-guard";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard allowRoles={["admin", "election_officer"]}>{children}</RouteGuard>;
}

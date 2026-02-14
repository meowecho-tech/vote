import { RouteGuard } from "@/components/auth/route-guard";

export default function VoterDashboardLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard allowRoles={["voter", "admin"]}>{children}</RouteGuard>;
}

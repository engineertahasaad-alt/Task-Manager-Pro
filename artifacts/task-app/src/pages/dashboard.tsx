import { useGetMe, useGetDashboardSummary, useGetMyTasks } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Inbox, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

function ManagerDashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary({});

  const stats = [
    { label: "Total Tasks", value: summary?.total ?? 0, icon: Inbox, color: "text-muted-foreground" },
    { label: "Open", value: summary?.open ?? 0, icon: Clock, color: "text-blue-500" },
    { label: "Completed", value: summary?.completed ?? 0, icon: CheckCircle2, color: "text-green-500" },
    { label: "Overdue", value: summary?.overdue ?? 0, icon: AlertTriangle, color: "text-red-500", highlight: (summary?.overdue ?? 0) > 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Manager Dashboard</h1>
        <p className="text-muted-foreground">Overview of team progress and workload.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color, highlight }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-8 w-12 rounded bg-gray-100 animate-pulse" />
              ) : (
                <div className={`text-2xl font-bold ${highlight ? "text-red-600" : ""}`}>{value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Quick Links</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/tasks">
            <span className="px-4 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer">View All Tasks</span>
          </Link>
          <Link href="/team">
            <span className="px-4 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer">Manage Team</span>
          </Link>
          <Link href="/reports">
            <span className="px-4 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer">Reports</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  completed: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  reopened: "bg-orange-100 text-orange-800",
};

function EmployeeDashboard() {
  const { data: tasks, isLoading } = useGetMyTasks();

  const sections = [
    { key: "today" as const, label: "Due Today", items: tasks?.today ?? [] },
    { key: "overdue" as const, label: "Overdue", items: tasks?.overdue ?? [], urgent: true },
    { key: "upcoming" as const, label: "Upcoming", items: tasks?.upcoming ?? [] },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Tasks</h1>
        <p className="text-muted-foreground">What you need to focus on.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {sections.map(({ key, label, items, urgent }) => (
          <Card key={key} className={urgent && items.length > 0 ? "border-red-200" : ""}>
            <CardHeader className="pb-3">
              <CardTitle className={`text-base font-semibold flex items-center gap-2 ${urgent && items.length > 0 ? "text-red-700" : ""}`}>
                {urgent && items.length > 0 && <AlertTriangle className="h-4 w-4" />}
                {label}
                {items.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs">{items.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2].map(i => <div key={i} className="h-12 rounded bg-gray-100 animate-pulse" />)}
                </div>
              ) : items.length > 0 ? (
                <div className="space-y-2">
                  {items.map(task => (
                    <Link key={task.id} href={`/tasks/${task.id}`} className="block border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-medium text-sm leading-snug truncate">{task.title}</p>
                          <p className="text-xs text-muted-foreground">
                            Due {format(new Date(task.deadline), "MMM d")}
                          </p>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 text-xs rounded-full ${statusColors[task.status] ?? "bg-gray-100 text-gray-800"}`}>
                          {task.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">No tasks here.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: user, isLoading } = useGetMe();
  const isManager = user?.role === "owner" || user?.role === "deputy";

  return (
    <AppLayout>
      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>
      ) : isManager ? (
        <ManagerDashboard />
      ) : (
        <EmployeeDashboard />
      )}
    </AppLayout>
  );
}

import { useState } from "react";
import {
  useGetMe, useGetDashboardSummary, useGetMyTasks,
  useGetWorkloadByEmployee, useListTasks, useListUsers,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Clock, Inbox, AlertTriangle, ThumbsUp } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

const PIE_COLORS = { Open: "#3b82f6", Done: "#22c55e", Overdue: "#ef4444", Pending: "#f59e0b" };

function StatCard({ label, value, icon: Icon, color, highlight, loading }: {
  label: string; value: number; icon: any; color: string; highlight?: boolean; loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        {loading
          ? <div className="h-8 w-12 rounded bg-gray-100 animate-pulse" />
          : <div className={`text-2xl font-bold ${highlight ? "text-red-600" : ""}`}>{value}</div>}
      </CardContent>
    </Card>
  );
}

function ManagerDashboard() {
  const [dateFilter, setDateFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [assigneeId, setAssigneeId] = useState<number | undefined>();

  const { data: users } = useListUsers();

  const filterBase = {
    dateFilter: dateFilter !== "all" ? dateFilter : undefined,
    startDate: dateFilter === "custom" ? startDate || undefined : undefined,
    endDate: dateFilter === "custom" ? endDate || undefined : undefined,
  };

  const { data: summary, isLoading } = useGetDashboardSummary({
    ...filterBase,
    assigneeId: assigneeId,
  });

  const { data: workload } = useGetWorkloadByEmployee(filterBase);

  const doneCount = (summary?.completed ?? 0);

  const pieData = [
    { name: "Open", value: summary?.open ?? 0 },
    { name: "Done", value: doneCount },
    { name: "Overdue", value: summary?.overdue ?? 0 },
  ].filter((d) => d.value > 0);

  const workloadData = (workload ?? []).map((w) => ({
    name: w.fullName.split(" ")[0],
    Open: w.open,
    Done: (w.completed ?? 0),
    Overdue: w.overdue,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Manager Dashboard</h1>
        <p className="text-muted-foreground">Track team progress, filter by member or time period.</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Period</p>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateFilter === "custom" && (
              <>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">From</p>
                  <Input type="date" className="h-9 w-36" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">To</p>
                  <Input type="date" className="h-9 w-36" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </>
            )}

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Member</p>
              <Select
                value={assigneeId ? String(assigneeId) : "all"}
                onValueChange={(v) => setAssigneeId(v === "all" ? undefined : parseInt(v))}
              >
                <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  {users?.filter((u) => u.isActive).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Tasks" value={summary?.total ?? 0} icon={Inbox} color="text-muted-foreground" loading={isLoading} />
        <StatCard label="Open" value={summary?.open ?? 0} icon={Clock} color="text-blue-500" loading={isLoading} />
        <StatCard label="Done (incl. approved)" value={doneCount} icon={CheckCircle2} color="text-green-500" loading={isLoading} />
        <StatCard label="Overdue" value={summary?.overdue ?? 0} icon={AlertTriangle} color="text-red-500" highlight={(summary?.overdue ?? 0) > 0} loading={isLoading} />
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No tasks yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={PIE_COLORS[entry.name as keyof typeof PIE_COLORS] ?? "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Workload by Member</CardTitle>
          </CardHeader>
          <CardContent>
            {workloadData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No members yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={workloadData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="Open" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Done" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Overdue" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-3">
        <Link href="/tasks">
          <span className="px-4 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer">All Tasks</span>
        </Link>
        <Link href="/team">
          <span className="px-4 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer">Manage Team</span>
        </Link>
        <Link href="/reports">
          <span className="px-4 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 transition-colors cursor-pointer">Reports</span>
        </Link>
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  completed: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  reopened: "bg-orange-100 text-orange-800",
};

function EmployeeDashboard() {
  const { data: myTasks, isLoading: myLoading } = useGetMyTasks();
  const { data: allTasks, isLoading: allLoading } = useListTasks();
  const isLoading = myLoading || allLoading;

  const total = allTasks?.length ?? 0;
  const openCount = allTasks?.filter((t) => t.status === "open" || t.status === "reopened").length ?? 0;
  const doneCount = allTasks?.filter((t) => t.status === "completed" || t.status === "approved").length ?? 0;
  const approvedCount = allTasks?.filter((t) => t.status === "approved").length ?? 0;

  const pieData = [
    { name: "Open", value: openCount },
    { name: "Done", value: doneCount },
  ].filter((d) => d.value > 0);

  const sections = [
    { key: "overdue", label: "Overdue", items: myTasks?.overdue ?? [], urgent: true },
    { key: "today", label: "Due Today", items: myTasks?.today ?? [] },
    { key: "upcoming", label: "Upcoming", items: myTasks?.upcoming ?? [] },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Dashboard</h1>
        <p className="text-muted-foreground">Your task progress at a glance.</p>
      </div>

      {/* Counters */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Tasks" value={total} icon={Inbox} color="text-muted-foreground" loading={isLoading} />
        <StatCard label="Open" value={openCount} icon={Clock} color="text-blue-500" loading={isLoading} />
        <StatCard label="Done" value={doneCount} icon={CheckCircle2} color="text-green-500" loading={isLoading} />
        <StatCard label="Approved" value={approvedCount} icon={ThumbsUp} color="text-emerald-500" loading={isLoading} />
      </div>

      {/* Chart + lists */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Pie */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Task Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">No tasks yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={PIE_COLORS[entry.name as keyof typeof PIE_COLORS] ?? "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Task lists */}
        <div className="md:col-span-2 space-y-4">
          {sections.map(({ key, label, items, urgent }) => (
            <Card key={key} className={urgent && items.length > 0 ? "border-red-200" : ""}>
              <CardHeader className="py-3 px-4">
                <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${urgent && items.length > 0 ? "text-red-700" : ""}`}>
                  {urgent && items.length > 0 && <AlertTriangle className="h-4 w-4" />}
                  {label}
                  {items.length > 0 && <Badge variant="secondary" className="ml-auto text-xs">{items.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-3">
                {isLoading ? (
                  <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-10 rounded bg-gray-100 animate-pulse" />)}</div>
                ) : items.length > 0 ? (
                  <div className="space-y-1.5">
                    {items.map((task) => (
                      <Link key={task.id} href={`/tasks/${task.id}`} className="flex justify-between items-center rounded-lg border px-3 py-2 hover:bg-gray-50 transition-colors">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{task.title}</p>
                          <p className="text-xs text-muted-foreground">Due {format(new Date(task.deadline), "MMM d")}</p>
                        </div>
                        <span className={`shrink-0 ml-2 px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[task.status] ?? "bg-gray-100 text-gray-800"}`}>
                          {task.status}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-1">None</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: user, isLoading } = useGetMe();
  const isManager = user?.role === "owner" || user?.role === "deputy";

  return (
    <AppLayout>
      {isLoading
        ? <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>
        : isManager
          ? <ManagerDashboard />
          : <EmployeeDashboard />}
    </AppLayout>
  );
}

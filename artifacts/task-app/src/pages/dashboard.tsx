import { useState } from "react";
import {
  useGetMe, useGetDashboardSummary, useGetMyTasks,
  useGetWorkloadByEmployee, useListTasks, useListUsers,
  GetDashboardSummaryDateFilter, GetWorkloadByEmployeeDateFilter,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Inbox, AlertTriangle, ThumbsUp, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadialBarChart, RadialBar, LineChart, Line,
} from "recharts";

const PALETTE = {
  open:    "#6366f1",
  approved: "#22c55e",
  overdue: "#ef4444",
  pending: "#f59e0b",
  total:   "#64748b",
};

const CUSTOM_TOOLTIP = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-lg rounded-lg px-3 py-2 text-sm">
      {label && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

function StatCard({ label, value, icon: Icon, colorClass, highlight, loading, trend }: {
  label: string; value: number; icon: any; colorClass: string; highlight?: boolean; loading?: boolean; trend?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-0 opacity-5 ${colorClass.replace("text-", "bg-")}`} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${colorClass.replace("text-", "bg-").replace("-600", "-100").replace("-500", "-100")}`}>
          <Icon className={`h-4 w-4 ${colorClass}`} />
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        {loading
          ? <div className="h-9 w-16 rounded bg-gray-100 animate-pulse" />
          : <div className={`text-3xl font-bold tracking-tight ${highlight ? "text-red-600" : "text-gray-900"}`}>{value}</div>}
        {trend && <p className="text-xs text-muted-foreground mt-1">{trend}</p>}
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
    dateFilter: dateFilter !== "all"
      ? dateFilter as GetDashboardSummaryDateFilter
      : undefined,
    startDate: dateFilter === "custom" ? startDate || undefined : undefined,
    endDate: dateFilter === "custom" ? endDate || undefined : undefined,
  };

  const workloadFilter = {
    ...filterBase,
    dateFilter: filterBase.dateFilter as GetWorkloadByEmployeeDateFilter | undefined,
  };

  const { data: summary, isLoading } = useGetDashboardSummary({
    ...filterBase,
    assigneeId,
  });

  const { data: workload } = useGetWorkloadByEmployee(workloadFilter);

  const approved = summary?.approved ?? 0;
  const open = summary?.open ?? 0;
  const overdue = summary?.overdue ?? 0;
  const total = summary?.total ?? 0;

  const completionRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  const pieData = [
    { name: "Open",     value: open,     fill: PALETTE.open },
    { name: "Approved", value: approved, fill: PALETTE.approved },
    { name: "Overdue",  value: overdue,  fill: PALETTE.overdue },
  ].filter(d => d.value > 0);

  const radialData = [{ name: "Completion", value: completionRate, fill: "#6366f1" }];

  const workloadData = (workload ?? []).map(w => ({
    name: w.fullName.split(" ")[0],
    Open:     w.open,
    Approved: w.approved ?? 0,
    Overdue:  w.overdue,
  }));

  const efficiencyData = (workload ?? []).map(w => ({
    name: w.fullName.split(" ")[0],
    rate: w.total > 0 ? Math.round(((w.approved ?? 0) / w.total) * 100) : 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Team performance overview.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5">
          <TrendingUp className="h-4 w-4 text-indigo-500" />
          <span>{completionRate}% approval rate</span>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Period</p>
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
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From</p>
                  <Input type="date" className="h-9 w-36" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">To</p>
                  <Input type="date" className="h-9 w-36" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member</p>
              <Select value={assigneeId ? String(assigneeId) : "all"} onValueChange={v => setAssigneeId(v === "all" ? undefined : parseInt(v))}>
                <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  {users?.filter(u => u.isActive).map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Tasks"  value={total}    icon={Inbox}          colorClass="text-slate-500"  loading={isLoading} />
        <StatCard label="Open"         value={open}     icon={Clock}          colorClass="text-indigo-600" loading={isLoading} />
        <StatCard label="Approved"     value={approved} icon={ThumbsUp}       colorClass="text-green-600"  loading={isLoading} />
        <StatCard label="Overdue"      value={overdue}  icon={AlertTriangle}  colorClass="text-red-600"    highlight={overdue > 0} loading={isLoading} />
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Donut */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold">Status Split</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">No tasks yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip content={<CUSTOM_TOOLTIP />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Radial completion gauge */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold">Approval Rate</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height={160}>
              <RadialBarChart cx="50%" cy="80%" innerRadius="70%" outerRadius="100%" startAngle={180} endAngle={0} data={radialData}>
                <RadialBar dataKey="value" cornerRadius={8} fill="#6366f1" background={{ fill: "#f1f5f9" }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <p className="text-3xl font-bold -mt-6 text-indigo-600">{completionRate}%</p>
            <p className="text-xs text-muted-foreground">of tasks approved</p>
          </CardContent>
        </Card>

        {/* Member efficiency */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold">Approval Rate by Member</CardTitle>
          </CardHeader>
          <CardContent>
            {efficiencyData.length === 0 ? (
              <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={efficiencyData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={55} />
                  <Tooltip formatter={(v: any) => `${v}%`} content={<CUSTOM_TOOLTIP />} />
                  <Bar dataKey="rate" name="Approval %" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 — Workload grouped bar */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-semibold">Workload by Member</CardTitle>
        </CardHeader>
        <CardContent>
          {workloadData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No members yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={workloadData} margin={{ top: 5, right: 16, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip content={<CUSTOM_TOOLTIP />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Open"     fill={PALETTE.open}     radius={[3,3,0,0]} />
                <Bar dataKey="Approved" fill={PALETTE.approved} radius={[3,3,0,0]} />
                <Bar dataKey="Overdue"  fill={PALETTE.overdue}  radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="flex flex-wrap gap-3">
        <Link href="/tasks">
          <span className="px-4 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-indigo-50 hover:border-indigo-200 transition-colors cursor-pointer">All Tasks</span>
        </Link>
        <Link href="/team">
          <span className="px-4 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-indigo-50 hover:border-indigo-200 transition-colors cursor-pointer">Manage Team</span>
        </Link>
        <Link href="/reports">
          <span className="px-4 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-indigo-50 hover:border-indigo-200 transition-colors cursor-pointer">Reports</span>
        </Link>
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  open:      "bg-indigo-100 text-indigo-800",
  completed: "bg-amber-100 text-amber-800",
  approved:  "bg-green-100 text-green-800",
  reopened:  "bg-orange-100 text-orange-800",
};

function EmployeeDashboard() {
  const { data: myTasks, isLoading: myLoading } = useGetMyTasks();
  const { data: allTasks, isLoading: allLoading } = useListTasks();
  const isLoading = myLoading || allLoading;

  const total    = allTasks?.length ?? 0;
  const open     = allTasks?.filter(t => t.status === "open" || t.status === "reopened").length ?? 0;
  const approved = allTasks?.filter(t => t.status === "approved").length ?? 0;
  const overdue  = myTasks?.overdue?.length ?? 0;

  const completionRate = total > 0 ? Math.round((approved / total) * 100) : 0;

  const pieData = [
    { name: "Open",     value: open,     fill: PALETTE.open },
    { name: "Approved", value: approved, fill: PALETTE.approved },
    { name: "Overdue",  value: overdue,  fill: PALETTE.overdue },
  ].filter(d => d.value > 0);

  const statusBarData = [
    { label: "Open",     value: open,     fill: PALETTE.open },
    { label: "Approved", value: approved, fill: PALETTE.approved },
    { label: "Overdue",  value: overdue,  fill: PALETTE.overdue },
  ];

  const sections = [
    { key: "overdue",  label: "Overdue",    items: myTasks?.overdue   ?? [], urgent: true },
    { key: "today",    label: "Due Today",  items: myTasks?.today     ?? [] },
    { key: "upcoming", label: "Upcoming",   items: myTasks?.upcoming  ?? [] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Dashboard</h1>
          <p className="text-muted-foreground text-sm">Your task progress at a glance.</p>
        </div>
        {completionRate > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-green-50 border border-green-100 rounded-lg px-3 py-1.5">
            <ThumbsUp className="h-4 w-4 text-green-500" />
            <span>{completionRate}% approval rate</span>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total"    value={total}    icon={Inbox}         colorClass="text-slate-500"  loading={isLoading} />
        <StatCard label="Open"     value={open}     icon={Clock}         colorClass="text-indigo-600" loading={isLoading} />
        <StatCard label="Approved" value={approved} icon={ThumbsUp}      colorClass="text-green-600"  loading={isLoading} />
        <StatCard label="Overdue"  value={overdue}  icon={AlertTriangle} colorClass="text-red-600"    highlight={overdue > 0} loading={isLoading} />
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold">Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">No tasks yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip content={<CUSTOM_TOOLTIP />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold">Task Counts</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusBarData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip content={<CUSTOM_TOOLTIP />} />
                <Bar dataKey="value" name="Tasks" radius={[4,4,0,0]}>
                  {statusBarData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Task lists */}
      <div className="space-y-4">
        {sections.map(({ key, label, items, urgent }) => (
          <Card key={key} className={urgent && items.length > 0 ? "border-red-200 bg-red-50/30" : ""}>
            <CardHeader className="py-3 px-4">
              <CardTitle className={`text-sm font-semibold flex items-center gap-2 ${urgent && items.length > 0 ? "text-red-700" : ""}`}>
                {urgent && items.length > 0 && <AlertTriangle className="h-4 w-4" />}
                {label}
                {items.length > 0 && <Badge variant="secondary" className="ml-auto text-xs">{items.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-3">
              {isLoading ? (
                <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-10 rounded bg-gray-100 animate-pulse" />)}</div>
              ) : items.length > 0 ? (
                <div className="space-y-1.5">
                  {items.map(task => (
                    <Link key={task.id} href={`/tasks/${task.id}`} className="flex justify-between items-center rounded-lg border px-3 py-2 hover:bg-white hover:shadow-sm transition-all bg-white/60">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{task.title}</p>
                        <p className="text-xs text-muted-foreground">Due {format(new Date(task.deadline), "MMM d")}</p>
                      </div>
                      <span className={`shrink-0 ml-2 px-2 py-0.5 text-xs rounded-full capitalize ${STATUS_COLORS[task.status] ?? "bg-gray-100 text-gray-800"}`}>
                        {task.status}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-1">None 🎉</p>
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
      {isLoading
        ? <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>
        : isManager ? <ManagerDashboard /> : <EmployeeDashboard />}
    </AppLayout>
  );
}

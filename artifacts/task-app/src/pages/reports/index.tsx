import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useGetDailyReport, useGetEmployeeReport, useListUsers, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Printer, Calendar, Users, FileText } from "lucide-react";
import { Redirect } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  reopened: "bg-orange-100 text-orange-800 border-orange-200",
};

const BAR_COLORS = ["#6b7280", "#22c55e", "#3b82f6", "#ef4444"];

export default function Reports() {
  const { data: user } = useGetMe();
  const isManager = user?.role === "owner" || user?.role === "deputy";
  if (!isManager && user) return <Redirect to="/dashboard" />;

  const [reportType, setReportType] = useState<"daily" | "employee">("daily");
  const [dailyDate, setDailyDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: users } = useListUsers();
  const { data: dailyReport, isLoading: dailyLoading } = useGetDailyReport(
    { date: dailyDate },
    { query: { enabled: reportType === "daily" && !!dailyDate } }
  );
  const { data: employeeReport, isLoading: employeeLoading } = useGetEmployeeReport(
    { employeeId: parseInt(employeeId), startDate, endDate },
    { query: { enabled: reportType === "employee" && !!employeeId && !!startDate && !!endDate } }
  );

  const reportData = reportType === "daily" ? dailyReport : employeeReport;
  const isLoading = reportType === "daily" ? dailyLoading : employeeLoading;

  const chartData = reportData
    ? [
        { label: "Total", value: reportData.total, color: "#6b7280" },
        { label: "Done", value: (reportData.completed ?? 0) + (reportData.approved ?? 0), color: "#22c55e" },
        { label: "Approved", value: reportData.approved ?? 0, color: "#3b82f6" },
        { label: "Overdue", value: reportData.overdue ?? 0, color: "#ef4444" },
      ]
    : [];

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto print:max-w-none print:m-0 print:p-0">
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
            <p className="text-muted-foreground">Generate and export performance insights.</p>
          </div>
          <Button onClick={() => window.print()} variant="outline">
            <Printer className="mr-2 h-4 w-4" /> Print / PDF
          </Button>
        </div>

        {/* Controls */}
        <Card className="print:hidden">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row gap-3 mb-6 pb-6 border-b">
              <Button variant={reportType === "daily" ? "default" : "outline"} onClick={() => setReportType("daily")} className="w-full sm:w-auto">
                <Calendar className="mr-2 h-4 w-4" /> Daily Report
              </Button>
              <Button variant={reportType === "employee" ? "default" : "outline"} onClick={() => setReportType("employee")} className="w-full sm:w-auto">
                <Users className="mr-2 h-4 w-4" /> Employee Report
              </Button>
            </div>

            {reportType === "daily" ? (
              <div className="space-y-2 w-full sm:w-auto">
                <label className="text-sm font-medium">Select Date</label>
                <Input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="w-48" />
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4 items-end flex-wrap">
                <div className="space-y-2 w-full sm:w-64">
                  <label className="text-sm font-medium">Select Employee</label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger><SelectValue placeholder="Choose member" /></SelectTrigger>
                    <SelectContent>
                      {users?.filter((u) => u.isActive).map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Start Date</label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">End Date</label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Report Content */}
        <div className="bg-white rounded-lg border p-6 sm:p-8 print:border-none print:p-0 shadow-sm print:shadow-none min-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">Generating report...</div>
          ) : !reportData ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <FileText className="h-12 w-12 text-gray-300 mb-4" />
              <p>Select parameters to view report</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Header */}
              <div className="border-b pb-6">
                <h2 className="text-2xl font-bold">{reportData.title}</h2>
                <div className="flex flex-wrap gap-4 mt-2 text-muted-foreground text-sm">
                  <span>Period: {reportData.period}</span>
                  {reportData.employeeName && <span>• Employee: {reportData.employeeName}</span>}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 print:gap-8">
                {[
                  { label: "Total Tasks", value: reportData.total, bg: "bg-gray-50", text: "text-gray-900", sub: "text-gray-500" },
                  { label: "Done", value: (reportData.completed ?? 0) + (reportData.approved ?? 0), bg: "bg-green-50", text: "text-green-900", sub: "text-green-700" },
                  { label: "Approved", value: reportData.approved ?? 0, bg: "bg-blue-50", text: "text-blue-900", sub: "text-blue-700" },
                  { label: "Overdue", value: reportData.overdue ?? 0, bg: "bg-red-50", text: "text-red-900", sub: "text-red-700" },
                ].map(({ label, value, bg, text, sub }) => (
                  <div key={label} className={`${bg} p-4 rounded-lg`}>
                    <p className={`text-sm font-medium ${sub}`}>{label}</p>
                    <p className={`text-3xl font-bold ${text} mt-1`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className="print:hidden">
                <h3 className="text-base font-semibold mb-3">Summary Chart</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Task Table */}
              <div>
                <h3 className="text-lg font-bold mb-4">Task Details</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      {reportType === "daily" && <TableHead>Assignee</TableHead>}
                      <TableHead>Status</TableHead>
                      <TableHead>Deadline</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.tasks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No tasks found for this period</TableCell>
                      </TableRow>
                    ) : reportData.tasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        {reportType === "daily" && <TableCell>{task.assignee?.fullName}</TableCell>}
                        <TableCell>
                          <span className={`px-2 py-0.5 text-xs rounded-full border capitalize ${STATUS_COLORS[task.status] ?? "bg-gray-100 text-gray-800"}`}>
                            {task.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {format(new Date(task.deadline), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

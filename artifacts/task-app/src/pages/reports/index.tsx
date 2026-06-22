import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useGetDailyReport, useGetEmployeeReport, useListUsers, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Printer, Download, Calendar, Users, FileText } from "lucide-react";
import { Redirect } from "wouter";

export default function Reports() {
  const { data: user } = useGetMe();
  const isManager = user?.role === 'owner' || user?.role === 'deputy';
  
  if (!isManager && user) return <Redirect to="/dashboard" />;

  const [reportType, setReportType] = useState<"daily" | "employee">("daily");
  
  // Daily form
  const [dailyDate, setDailyDate] = useState(format(new Date(), "yyyy-MM-dd"));
  
  // Employee form
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: users } = useListUsers();

  const { data: dailyReport, isLoading: dailyLoading } = useGetDailyReport({ date: dailyDate }, { query: { enabled: reportType === 'daily' && !!dailyDate } });
  
  const { data: employeeReport, isLoading: employeeLoading } = useGetEmployeeReport(
    { employeeId: parseInt(employeeId), startDate, endDate }, 
    { query: { enabled: reportType === 'employee' && !!employeeId && !!startDate && !!endDate } }
  );

  const reportData = reportType === 'daily' ? dailyReport : employeeReport;
  const isLoading = reportType === 'daily' ? dailyLoading : employeeLoading;

  const handlePrint = () => {
    window.print();
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto print:max-w-none print:m-0 print:p-0">
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
            <p className="text-muted-foreground">Generate and export performance insights.</p>
          </div>
          <Button onClick={handlePrint} variant="outline" className="print:hidden">
            <Printer className="mr-2 h-4 w-4" /> Print / PDF
          </Button>
        </div>

        <Card className="print:hidden">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row gap-4 mb-6 pb-6 border-b">
              <Button 
                variant={reportType === 'daily' ? 'default' : 'outline'} 
                onClick={() => setReportType('daily')}
                className="w-full sm:w-auto"
              >
                <Calendar className="mr-2 h-4 w-4" /> Daily Report
              </Button>
              <Button 
                variant={reportType === 'employee' ? 'default' : 'outline'} 
                onClick={() => setReportType('employee')}
                className="w-full sm:w-auto"
              >
                <Users className="mr-2 h-4 w-4" /> Employee Report
              </Button>
            </div>

            {reportType === 'daily' ? (
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="space-y-2 w-full sm:w-auto">
                  <label className="text-sm font-medium">Select Date</label>
                  <Input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4 items-end flex-wrap">
                <div className="space-y-2 w-full sm:w-64">
                  <label className="text-sm font-medium">Select Employee</label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger><SelectValue placeholder="Choose member" /></SelectTrigger>
                    <SelectContent>
                      {users?.filter(u => u.isActive).map(u => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 w-full sm:w-auto">
                  <label className="text-sm font-medium">Start Date</label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2 w-full sm:w-auto">
                  <label className="text-sm font-medium">End Date</label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Print Layout / Report View */}
        <div className="bg-white rounded-lg border p-6 sm:p-8 print:border-none print:p-0 shadow-sm print:shadow-none min-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">Generating report...</div>
          ) : !reportData ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileText className="h-12 w-12 text-gray-300 mb-4" />
              <p>Select parameters to view report</p>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="border-b pb-6">
                <h2 className="text-2xl font-bold">{reportData.title}</h2>
                <div className="flex gap-4 mt-2 text-muted-foreground text-sm">
                  <span>Period: {reportData.period}</span>
                  {reportData.employeeName && <span>• Employee: {reportData.employeeName}</span>}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 print:gap-8">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-gray-500">Total Tasks</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{reportData.total}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-green-700">Completed</p>
                  <p className="text-3xl font-bold text-green-900 mt-1">{reportData.completed}</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-blue-700">Approved</p>
                  <p className="text-3xl font-bold text-blue-900 mt-1">{reportData.approved}</p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-red-700">Overdue</p>
                  <p className="text-3xl font-bold text-red-900 mt-1">{reportData.overdue}</p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold mb-4">Task Details</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      {reportType === 'daily' && <TableHead>Assignee</TableHead>}
                      <TableHead>Status</TableHead>
                      <TableHead>Deadline</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.tasks.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8">No tasks found for this period</TableCell></TableRow>
                    ) : reportData.tasks.map(task => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        {reportType === 'daily' && <TableCell>{task.assignee?.fullName}</TableCell>}
                        <TableCell>
                          <span className="capitalize text-sm font-medium">{task.status}</span>
                        </TableCell>
                        <TableCell className="text-sm text-gray-500">{format(new Date(task.deadline), "MMM d, yyyy")}</TableCell>
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
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useListTasks, useGetMe } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Filter, Clock, Share2, ChevronRight, CalendarDays, List, ChevronLeft } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, getDay } from "date-fns";

function AssigneeAvatars({ assignees, assignee }: { assignees?: any[]; assignee?: any }) {
  const list = assignees && assignees.length > 0 ? assignees : (assignee ? [assignee] : []);
  if (list.length === 0) return <span className="text-xs text-muted-foreground">Unassigned</span>;
  const shown = list.slice(0, 3);
  const extra = list.length - shown.length;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-1.5">
        {shown.map((u: any, i: number) => (
          <div key={u.id ?? i} title={u.fullName} className="h-6 w-6 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-[10px] font-semibold text-indigo-700">
            {u.fullName?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
        ))}
        {extra > 0 && (
          <div className="h-6 w-6 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-[10px] font-semibold text-gray-500">
            +{extra}
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground truncate max-w-[120px]">
        {shown.map((u: any) => u.fullName?.split(' ')[0]).join(', ')}{extra > 0 ? ` +${extra}` : ''}
      </span>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-green-100 text-green-800 border-green-200',
  reopened: 'bg-orange-100 text-orange-800 border-orange-200',
};

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  low:      { label: "Low",      className: "bg-slate-100 text-slate-700 border-slate-200" },
  medium:   { label: "Medium",   className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  high:     { label: "High",     className: "bg-orange-100 text-orange-800 border-orange-200" },
  critical: { label: "Critical", className: "bg-red-100 text-red-800 border-red-200" },
};

function PriorityBadge({ priority }: { priority?: string }) {
  const cfg = PRIORITY_CONFIG[priority ?? "medium"] ?? PRIORITY_CONFIG.medium;
  return (
    <Badge variant="outline" className={cfg.className + " text-[10px] px-1.5 py-0 font-semibold"}>
      {cfg.label}
    </Badge>
  );
}

type TabValue = "all" | "open" | "completed" | "approved" | "reopened" | "delegated";
type ViewMode = "list" | "calendar";

function CalendarView({ tasks }: { tasks: any[] }) {
  const [calMonth, setCalMonth] = useState(new Date());
  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  const tasksByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const task of tasks) {
      const key = format(new Date(task.deadline), "yyyy-MM-dd");
      if (!map[key]) map[key] = [];
      map[key].push(task);
    }
    return map;
  }, [tasks]);

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setCalMonth(m => subMonths(m, 1))} className="p-1.5 rounded hover:bg-muted">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="font-semibold text-base">{format(calMonth, "MMMM yyyy")}</h2>
        <button onClick={() => setCalMonth(m => addMonths(m, 1))} className="p-1.5 rounded hover:bg-muted">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 bg-muted/50">
          {dayNames.map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 divide-x divide-y border-t">
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} className="min-h-[72px] bg-muted/20 p-1" />
          ))}
          {days.map(day => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = tasksByDay[key] ?? [];
            const isToday = isSameDay(day, new Date());
            return (
              <div key={key} className={`min-h-[72px] p-1 ${isToday ? "bg-primary/5" : ""}`}>
                <p className={`text-xs font-medium mb-1 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {format(day, "d")}
                </p>
                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map((task: any) => (
                    <Link key={task.id} href={`/tasks/${task.id}`}>
                      <div className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80 ${STATUS_COLOR[task.status] ?? "bg-gray-100 text-gray-800"}`}>
                        {task.title}
                      </div>
                    </Link>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-[10px] text-muted-foreground px-1">+{dayTasks.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Tasks() {
  const [tab, setTab] = useState<TabValue>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const { data: user } = useGetMe();
  const isManager = user?.role === 'owner' || user?.role === 'deputy';
  const isDelegatedTab = tab === "delegated";

  const { data: tasks, isLoading } = useListTasks(
    isDelegatedTab
      ? ({ delegated: true } as any)
      : (tab !== "all" ? { status: tab as any } : {})
  );

  const filteredTasks = tasks?.filter(task => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority =
      priorityFilter === "all" || (task as any).priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
            <p className="text-muted-foreground">Manage and track your team's work.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                title="List view"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("calendar")}
                className={`p-2 transition-colors ${viewMode === "calendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                title="Calendar view"
              >
                <CalendarDays className="h-4 w-4" />
              </button>
            </div>
            {isManager && (
              <Link href="/tasks/new">
                <Button className="w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" /> New Task
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <Tabs value={tab} onValueChange={v => setTab(v as TabValue)} className="w-full sm:w-auto">
            <TabsList className={`w-full sm:w-auto grid h-auto ${isManager ? "grid-cols-6" : "grid-cols-5"}`}>
              <TabsTrigger value="all" className="text-xs sm:text-sm py-2">All</TabsTrigger>
              <TabsTrigger value="open" className="text-xs sm:text-sm py-2">Open</TabsTrigger>
              <TabsTrigger value="completed" className="text-xs sm:text-sm py-2">Done</TabsTrigger>
              <TabsTrigger value="approved" className="text-xs sm:text-sm py-2">OK'd</TabsTrigger>
              <TabsTrigger value="reopened" className="text-xs sm:text-sm py-2">Reop.</TabsTrigger>
              {isManager && (
                <TabsTrigger value="delegated" className="text-xs sm:text-sm py-2 flex items-center gap-1">
                  <Share2 className="h-3 w-3" /> Del.
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>

          <div className="flex gap-2 w-full sm:w-auto">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[130px] shrink-0">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                type="search"
                placeholder="Search tasks..."
                className="pl-9 w-full"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {isDelegatedTab && (
          <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-4 py-2.5">
            <Share2 className="h-4 w-4 shrink-0" />
            <span>Showing tasks you have delegated to other groups. Click a task to view its delegated sub-tasks and progress.</span>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading tasks...</div>
        ) : filteredTasks?.length === 0 ? (
          <div className="text-center py-16 border rounded-lg bg-gray-50/50 dark:bg-gray-900/20">
            <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              {isDelegatedTab ? <Share2 className="h-6 w-6 text-gray-400" /> : <Filter className="h-6 w-6 text-gray-400" />}
            </div>
            <h3 className="text-lg font-medium">
              {isDelegatedTab ? "No delegated tasks" : "No tasks found"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {isDelegatedTab
                ? "You haven't delegated any tasks to other groups yet."
                : "Try adjusting your filters or search query."}
            </p>
          </div>
        ) : viewMode === "calendar" ? (
          <CalendarView tasks={filteredTasks ?? []} />
        ) : (
          <div className="grid gap-4">
            {filteredTasks?.map(task => {
              const isOverdue = new Date(task.deadline) < new Date() && task.status !== 'approved';
              const delegatedTasks = (task as any).delegatedTasks as any[] | undefined;
              const hasDelegated = delegatedTasks && delegatedTasks.length > 0;
              const delegatedDone = hasDelegated
                ? delegatedTasks.filter((d: any) => d.status === 'approved' || d.status === 'completed').length
                : 0;
              const priority = (task as any).priority ?? "medium";

              return (
                <Link key={task.id} href={`/tasks/${task.id}`}>
                  <Card className={`hover:border-primary/50 transition-colors cursor-pointer ${isOverdue ? 'border-red-200 bg-red-50/30' : ''}`}>
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-lg leading-tight">{task.title}</h3>
                            <Badge variant="outline" className={STATUS_COLOR[task.status] ?? "bg-gray-100 text-gray-800"}>
                              {task.status.toUpperCase()}
                            </Badge>
                            <PriorityBadge priority={priority} />
                            {isOverdue && (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Overdue
                              </Badge>
                            )}
                            {hasDelegated && (
                              <Badge variant="outline" className="text-purple-700 border-purple-300 bg-purple-50 flex items-center gap-1">
                                <Share2 className="w-3 h-3" /> {delegatedDone}/{delegatedTasks.length} delegated
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                          {hasDelegated && isDelegatedTab && (
                            <div className="mt-2 space-y-1">
                              {delegatedTasks.slice(0, 3).map((dt: any) => (
                                <div key={dt.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <ChevronRight className="h-3 w-3" />
                                  <span>{dt.title}</span>
                                  <Badge className={`${STATUS_COLOR[dt.status] ?? "bg-gray-100 text-gray-800"} text-[10px] px-1.5 py-0`}>
                                    {dt.status}
                                  </Badge>
                                </div>
                              ))}
                              {delegatedTasks.length > 3 && (
                                <p className="text-xs text-muted-foreground pl-5">+{delegatedTasks.length - 3} more</p>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-start sm:items-end text-sm text-muted-foreground gap-2 sm:min-w-[160px]">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {format(new Date(task.deadline), "MMM d, yyyy")}
                          </div>
                          <AssigneeAvatars assignees={(task as any).assignees} assignee={task.assignee} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

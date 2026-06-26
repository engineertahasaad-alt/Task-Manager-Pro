import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useGetMe, useListUsers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ChevronLeft, ChevronRight, User, Filter, Clock, ExternalLink } from "lucide-react";
import { Redirect, Link } from "wouter";

const ACTION_LABELS: Record<string, string> = {
  user_created: "User Created",
  user_login: "Login",
  user_password_changed: "Password Changed",
  user_deactivated: "User Deactivated",
  group_created: "Group Created",
  member_joined: "Member Joined",
  member_approved: "Member Approved",
  member_removed: "Member Removed",
  role_changed: "Role Changed",
  task_created: "Task Created",
  task_assigned: "Task Assigned",
  task_delegated: "Task Delegated",
  task_completed: "Task Completed",
  task_approved: "Task Approved",
  task_reopened: "Task Reopened",
  task_reassign_requested: "Reassign Requested",
  task_reassign_rejected: "Reassign Rejected",
};

const ACTION_COLORS: Record<string, string> = {
  user_created: "bg-green-100 text-green-800",
  user_login: "bg-blue-100 text-blue-800",
  user_password_changed: "bg-yellow-100 text-yellow-800",
  user_deactivated: "bg-red-100 text-red-800",
  group_created: "bg-purple-100 text-purple-800",
  member_joined: "bg-green-100 text-green-800",
  member_approved: "bg-green-100 text-green-800",
  member_removed: "bg-red-100 text-red-800",
  role_changed: "bg-orange-100 text-orange-800",
  task_created: "bg-indigo-100 text-indigo-800",
  task_assigned: "bg-blue-100 text-blue-800",
  task_delegated: "bg-purple-100 text-purple-800",
  task_completed: "bg-green-100 text-green-800",
  task_approved: "bg-green-100 text-green-800",
  task_reopened: "bg-yellow-100 text-yellow-800",
  task_reassign_requested: "bg-orange-100 text-orange-800",
  task_reassign_rejected: "bg-red-100 text-red-800",
};

function describeEntry(entry: any): string {
  const actor = entry.actorName
    ? `${entry.actorName} (ID: ${entry.actorId})`
    : entry.actorId
    ? `User #${entry.actorId}`
    : "System";
  const meta = entry.metadata ?? {};
  switch (entry.action) {
    case "user_created":
      return `${actor} created user "${meta.fullName ?? ""}" with role ${meta.role ?? ""}`;
    case "user_login":
      return `${actor} logged in`;
    case "user_password_changed":
      return `${actor} changed password${meta.method === "forgot_password" ? " via forgot-password" : ""}`;
    case "user_deactivated":
      return `${actor} ${meta.isActive ? "activated" : "deactivated"} user #${entry.targetId}`;
    case "group_created":
      return `${actor} created group "${meta.groupName ?? ""}" (Group #${entry.targetId})`;
    case "member_joined":
      return `${actor} joined group "${meta.groupName ?? ""}"${meta.pendingApproval ? " — pending approval" : ""}`;
    case "member_approved":
      return `${actor} approved membership of user #${entry.targetId}`;
    case "member_removed":
      return `${actor} removed user #${entry.targetId} from group`;
    case "role_changed":
      return `${actor} changed role of user #${entry.targetId} to "${meta.newRole ?? ""}"`;
    case "task_created":
      return `${actor} created task "${meta.title ?? ""}" (Task #${entry.targetId})`;
    case "task_assigned":
      return `${actor} assigned Task #${entry.targetId}${meta.assigneeId ? ` to User #${meta.assigneeId}` : ""}${meta.reason === "reassignment_approved" ? " (reassignment approved)" : ""}`;
    case "task_delegated":
      return `${actor} delegated "${meta.title ?? `Task #${entry.targetId}`}" to Group #${meta.targetGroupId} (child Task #${meta.childTaskId})`;
    case "task_completed":
      return `${actor} marked "${meta.title ?? `Task #${entry.targetId}`}" as completed`;
    case "task_approved":
      return `${actor} approved "${meta.title ?? `Task #${entry.targetId}`}"`;
    case "task_reopened":
      return `${actor} reopened "${meta.title ?? `Task #${entry.targetId}`}"`;
    case "task_deleted":
      return `${actor} deleted Task #${entry.targetId}`;
    case "permission_changed":
      return `${actor} changed permissions`;
    default:
      return `${actor} performed "${entry.action}"`;
  }
}

const ALL_ACTIONS = Object.keys(ACTION_LABELS);

type Filters = {
  startDate: string;
  endDate: string;
  action: string;
  actorId: string;
};

const EMPTY_FILTERS: Filters = { startDate: "", endDate: "", action: "all", actorId: "all" };

export default function AuditLog() {
  const { data: user } = useGetMe();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);

  const { data: users } = useListUsers({ query: { enabled: !!user && user.role !== "member" } });

  if (user && user.role === "member") {
    return <Redirect to="/settings" />;
  }

  const params = new URLSearchParams({ page: String(page), limit: "25" });
  if (applied.startDate) params.set("startDate", applied.startDate);
  if (applied.endDate) params.set("endDate", applied.endDate + "T23:59:59");
  if (applied.action && applied.action !== "all") params.set("action", applied.action);
  if (applied.actorId && applied.actorId !== "all") params.set("actorId", applied.actorId);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", page, applied],
    queryFn: async () => {
      const token = localStorage.getItem("taskaya_token");
      const res = await fetch(`/api/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json() as Promise<{
        data: any[];
        total: number;
        page: number;
        pages: number;
        limit: number;
      }>;
    },
    enabled: !!user && user.role !== "member",
  });

  function applyFilters() {
    setPage(1);
    setApplied({ ...draft });
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setPage(1);
    setApplied(EMPTY_FILTERS);
  }

  const hasActiveFilters =
    applied.startDate || applied.endDate || applied.action !== "all" || applied.actorId !== "all";

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-indigo-600" />
              Audit Log
            </h1>
            <p className="text-muted-foreground">
              Complete, append-only record of all actions in this group.
            </p>
          </div>
          {data && (
            <span className="text-sm text-muted-foreground">
              {data.total.toLocaleString()} {data.total === 1 ? "entry" : "entries"}
              {hasActiveFilters && " (filtered)"}
            </span>
          )}
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">From date</label>
                <Input
                  type="date"
                  value={draft.startDate}
                  onChange={e => setDraft(d => ({ ...d, startDate: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">To date</label>
                <Input
                  type="date"
                  value={draft.endDate}
                  onChange={e => setDraft(d => ({ ...d, endDate: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Action type</label>
                <Select value={draft.action} onValueChange={v => setDraft(d => ({ ...d, action: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    {ALL_ACTIONS.map(a => (
                      <SelectItem key={a} value={a}>{ACTION_LABELS[a]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Actor / user</label>
                <Select value={draft.actorId} onValueChange={v => setDraft(d => ({ ...d, actorId: v }))}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All users</SelectItem>
                    {users?.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.fullName} (#{u.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={applyFilters} className="h-8">Apply filters</Button>
              {hasActiveFilters && (
                <Button size="sm" variant="outline" onClick={clearFilters} className="h-8">Clear</Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center h-32 text-muted-foreground text-sm">
                Loading audit entries…
              </div>
            ) : !data || data.data.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
                <ShieldCheck className="h-8 w-8 opacity-30" />
                <span className="text-sm">No audit entries match the current filters</span>
              </div>
            ) : (
              <div className="divide-y">
                {data.data.map((entry: any) => (
                  <div key={entry.id} className="flex items-start gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                    {/* Actor avatar */}
                    <div className="mt-0.5 flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                        <User className="h-4 w-4 text-indigo-600" />
                      </div>
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      {/* Top row: badge + actor */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={`text-xs font-medium shrink-0 ${ACTION_COLORS[entry.action] ?? "bg-gray-100 text-gray-700"}`}>
                          {ACTION_LABELS[entry.action] ?? entry.action}
                        </Badge>
                        {entry.actorName ? (
                          <span className="text-sm font-medium text-foreground">
                            {entry.actorName}{" "}
                            <span className="text-xs text-muted-foreground font-normal">(#{entry.actorId})</span>
                          </span>
                        ) : entry.actorId ? (
                          <span className="text-sm text-muted-foreground">User #{entry.actorId}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">System</span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-sm text-muted-foreground">{describeEntry(entry)}</p>

                      {/* Target context */}
                      {entry.targetType && entry.targetId && (
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-xs text-muted-foreground capitalize">
                            {entry.targetType} #{entry.targetId}
                          </span>
                          {entry.targetType === "task" && (
                            <Link href={`/tasks/${entry.targetId}`}>
                              <span className="inline-flex items-center gap-0.5 text-xs text-indigo-600 hover:underline cursor-pointer">
                                <ExternalLink className="h-3 w-3" /> View task
                              </span>
                            </Link>
                          )}
                          {entry.groupId && (
                            <span className="text-xs text-muted-foreground">
                              · Group #{entry.groupId}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                      <Clock className="h-3 w-3" />
                      {new Date(entry.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Page {data.page} of {data.pages} · {data.total.toLocaleString()} total
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.pages}
                onClick={() => setPage(p => p + 1)}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetTask, useCompleteTask, useApproveTask, useReopenTask, useGetMe,
  useListMessages, useSendMessage, useDelegateTask, useListGroups,
  getGetTaskQueryKey, getListMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  Send, CheckCircle2, ArrowLeft, Paperclip, FileIcon, Download,
  RefreshCw, Users, Share2, ChevronRight, Loader2, X, ArrowUpRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function AssigneeAvatarStack({ assignees, assignee }: { assignees?: any[]; assignee?: any }) {
  const list = assignees && assignees.length > 0 ? assignees : (assignee ? [assignee] : []);
  if (list.length === 0) return <span className="text-sm text-muted-foreground">Unassigned</span>;
  return (
    <div className="flex flex-col gap-1.5">
      {list.map((u: any, i: number) => (
        <div key={u.id ?? i} className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700 shrink-0">
            {u.fullName?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <span className="text-sm font-medium">{u.fullName}</span>
        </div>
      ))}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  completed: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  reopened: "bg-orange-100 text-orange-800",
};

function DelegatedTaskCard({ dt }: { dt: any }) {
  const [, setLocation] = useLocation();
  const completed = dt.status === "approved" || dt.status === "completed";
  return (
    <button
      onClick={() => setLocation(`/tasks/${dt.id}`)}
      className="w-full text-left p-3 rounded-lg border hover:border-primary/50 transition-colors bg-gray-50 hover:bg-gray-100 group"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{dt.title}</span>
            <Badge className={`${STATUS_COLOR[dt.status] ?? "bg-gray-100 text-gray-800"} text-xs`}>
              {dt.status.toUpperCase()}
            </Badge>
          </div>
          {dt.assignees && dt.assignees.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {dt.assignees.map((a: any) => a.fullName).join(", ")}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary" />
      </div>
    </button>
  );
}

function DelegateModal({
  taskId,
  open,
  onClose,
}: {
  taskId: number;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: groups = [] } = useListGroups();
  const delegateMutation = useDelegateTask();

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<number[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Active group is the one marked isActive; exclude it so we only show OTHER managed groups
  const activeGroup = groups.find(g => g.isActive);
  const managerGroups = groups.filter(
    g => (g.role === "owner" || g.role === "deputy") && g.id !== activeGroup?.id
  );

  async function loadGroupMembers(groupId: number) {
    setLoadingMembers(true);
    setSelectedAssignees([]);
    try {
      const token = localStorage.getItem("taskaya_token");
      const res = await fetch(`/api/users?groupId=${groupId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGroupMembers(data.filter((u: any) => u.isActive));
      }
    } catch {
      setGroupMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }

  function handleSelectGroup(gid: number) {
    setSelectedGroupId(gid);
    loadGroupMembers(gid);
  }

  function toggleAssignee(uid: number) {
    setSelectedAssignees(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  }

  async function handleDelegate() {
    if (!selectedGroupId || selectedAssignees.length === 0) return;
    try {
      await delegateMutation.mutateAsync({
        id: taskId,
        data: { targetGroupId: selectedGroupId, assigneeIds: selectedAssignees },
      });
      toast({ title: "Task delegated successfully" });
      queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed to delegate", description: e.message, variant: "destructive" });
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-semibold text-lg">Delegate to Another Group</h2>
            <p className="text-sm text-muted-foreground">Select a group you manage and assign members</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <h3 className="text-sm font-medium mb-2">Select Target Group</h3>
            <div className="space-y-2">
              {managerGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">You are not a manager in any other group.</p>
              ) : managerGroups.map(g => (
                <button
                  key={g.id}
                  onClick={() => handleSelectGroup(g.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedGroupId === g.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/40"
                  }`}
                >
                  <div className="font-medium text-sm">{g.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{g.role}</div>
                </button>
              ))}
            </div>
          </div>

          {selectedGroupId && (
            <div>
              <h3 className="text-sm font-medium mb-2">Select Assignees</h3>
              {loadingMembers ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : groupMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active members in this group.</p>
              ) : (
                <div className="space-y-2">
                  {groupMembers.map((u: any) => (
                    <button
                      key={u.id}
                      onClick={() => toggleAssignee(u.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-3 ${
                        selectedAssignees.includes(u.id)
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/40"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                        {u.fullName?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{u.fullName}</div>
                        <div className="text-xs text-muted-foreground capitalize">{u.role}</div>
                      </div>
                      {selectedAssignees.includes(u.id) && (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1"
            onClick={handleDelegate}
            disabled={!selectedGroupId || selectedAssignees.length === 0 || delegateMutation.isPending}
          >
            {delegateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Delegate Task
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TaskDetail() {
  const { id } = useParams();
  const taskId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDelegateModal, setShowDelegateModal] = useState(false);

  const { data: user } = useGetMe();
  const { data: task, isLoading } = useGetTask(taskId, { query: { enabled: !!taskId } });
  const { data: messages } = useListMessages(taskId, { query: { enabled: !!taskId, refetchInterval: 3000 } });

  const completeMutation = useCompleteTask();
  const approveMutation = useApproveTask();
  const reopenMutation = useReopenTask();
  const sendMessageMutation = useSendMessage();

  const [messageContent, setMessageContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isManager = user?.role === 'owner' || user?.role === 'deputy';
  const assignees = (task as any)?.assignees as any[] | undefined;
  const isAssignee = user && (
    task?.assigneeId === user.id ||
    (assignees && assignees.some((a: any) => a.id === user.id))
  );
  const delegatedTasks = (task as any)?.delegatedTasks as any[] | undefined;
  const parentTaskId = (task as any)?.parentTaskId as number | null | undefined;
  const isChildTask = !!parentTaskId;
  const canDelegate = isManager && !isChildTask;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStatusChange = (mutation: any, statusLabel: string) => {
    mutation.mutate({ id: taskId }, {
      onSuccess: () => {
        toast({ title: `Task ${statusLabel}` });
        queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) });
      }
    });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageContent.trim()) return;
    sendMessageMutation.mutate({ id: taskId, data: { content: messageContent } }, {
      onSuccess: () => {
        setMessageContent("");
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(taskId) });
      }
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = localStorage.getItem("taskaya_token");
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        toast({ title: "File uploaded successfully" });
        queryClient.invalidateQueries({ queryKey: getGetTaskQueryKey(taskId) });
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(taskId) });
      }
    } catch {
      toast({ title: "Failed to upload file", variant: "destructive" });
    }
  };

  const getStatusColor = (status: string) => STATUS_COLOR[status] ?? "bg-gray-100 text-gray-800";

  if (isLoading || !task) return <AppLayout><div className="flex justify-center p-12">Loading...</div></AppLayout>;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-100px)] md:h-[calc(100vh-60px)]">
        <div className="flex items-center gap-2 mb-4 shrink-0 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/tasks")}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-xl font-bold tracking-tight truncate flex-1">{task.title}</h1>
          <Badge className={getStatusColor(task.status)}>{task.status.toUpperCase()}</Badge>
          {isChildTask && (
            <Badge variant="outline" className="text-purple-700 border-purple-300 bg-purple-50 flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3" /> Delegated
            </Badge>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-4 min-h-0 flex-1 overflow-hidden">
          <div className="md:col-span-1 overflow-y-auto pr-2 space-y-4">
            <Card>
              <CardContent className="p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                  <p className="text-sm whitespace-pre-wrap">{task.description}</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {assignees && assignees.length > 1 ? `Assignees (${assignees.length})` : 'Assignee'}
                    </h3>
                    <AssigneeAvatarStack assignees={assignees} assignee={task.assignee} />
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Creator</h3>
                    <p className="text-sm font-medium">{task.creator?.fullName}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Deadline</h3>
                    <p className="text-sm font-medium">{format(new Date(task.deadline), "MMM d, yyyy h:mm a")}</p>
                  </div>
                  {isChildTask && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-1">Parent Task</h3>
                      <button
                        onClick={() => setLocation(`/tasks/${parentTaskId}`)}
                        className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                      >
                        View original task <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {task.attachments && task.attachments.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Attachments</h3>
                    <div className="space-y-2">
                      {task.attachments.map(att => (
                        <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center p-2 rounded border hover:bg-gray-50 transition-colors">
                          <FileIcon className="h-4 w-4 text-primary mr-2" />
                          <span className="text-xs truncate flex-1">{att.originalName}</span>
                          <Download className="h-3 w-3 text-muted-foreground ml-2" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t space-y-2">
                  {(task.status === 'open' || task.status === 'reopened') && isAssignee && (
                    <Button className="w-full" onClick={() => handleStatusChange(completeMutation, "marked complete")}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {task.status === 'reopened' ? 'Resubmit as Complete' : 'Mark Complete'}
                    </Button>
                  )}
                  {task.status === 'completed' && isManager && (
                    <>
                      <Button className="w-full bg-green-600 hover:bg-green-700" onClick={() => handleStatusChange(approveMutation, "approved")}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Approve Task
                      </Button>
                      <Button variant="outline" className="w-full text-orange-600 hover:bg-orange-50" onClick={() => handleStatusChange(reopenMutation, "reopened")}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Reopen Task
                      </Button>
                    </>
                  )}
                  {task.status === 'approved' && isManager && (
                    <Button variant="outline" className="w-full text-orange-600 hover:bg-orange-50" onClick={() => handleStatusChange(reopenMutation, "reopened")}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Reopen Task
                    </Button>
                  )}
                  {canDelegate && (
                    <Button
                      variant="outline"
                      className="w-full text-purple-700 border-purple-300 hover:bg-purple-50"
                      onClick={() => setShowDelegateModal(true)}
                    >
                      <Share2 className="mr-2 h-4 w-4" /> Delegate to Group
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {delegatedTasks && delegatedTasks.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Share2 className="h-3.5 w-3.5 text-purple-600" />
                    Delegated Tasks ({delegatedTasks.length})
                  </h3>
                  <div className="space-y-2">
                    {delegatedTasks.map((dt: any) => (
                      <DelegatedTaskCard key={dt.id} dt={dt} />
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t">
                    <div className="text-xs text-muted-foreground flex items-center justify-between">
                      <span>Progress</span>
                      <span>
                        {delegatedTasks.filter((d: any) => d.status === 'approved' || d.status === 'completed').length} / {delegatedTasks.length} done
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${(delegatedTasks.filter((d: any) => d.status === 'approved' || d.status === 'completed').length / delegatedTasks.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="md:col-span-2 flex flex-col bg-gray-50/50 rounded-xl border overflow-hidden">
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {messages?.map(msg => {
                const isMe = msg.senderId === user?.id;
                const isFromParent = (msg as any).fromParentTask;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe && !isFromParent ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-600">
                        {isFromParent ? msg.sender?.fullName : (!isMe ? msg.sender?.fullName : 'You')}
                      </span>
                      <span className="text-[10px] text-gray-400">{format(new Date(msg.createdAt), "h:mm a")}</span>
                      {isFromParent && (
                        <span className="text-[10px] text-purple-500 italic">from original task</span>
                      )}
                    </div>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                      isFromParent
                        ? 'bg-purple-50 border border-purple-100 text-gray-700 rounded-tl-sm shadow-sm'
                        : isMe
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : 'bg-white border rounded-tl-sm text-gray-900 shadow-sm'
                    }`}>
                      {msg.attachmentUrl ? (
                        <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 mb-1 text-sm underline underline-offset-2 opacity-90 hover:opacity-100">
                          <FileIcon className="h-4 w-4" />
                          <span className="truncate max-w-[200px]">{msg.attachmentName}</span>
                        </a>
                      ) : null}
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 bg-white border-t mt-auto">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-full" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-4 w-4 text-gray-500" />
                </Button>
                <Input
                  className="flex-1 rounded-full bg-gray-100 border-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-white"
                  placeholder="Type a message..."
                  value={messageContent}
                  onChange={e => setMessageContent(e.target.value)}
                />
                <Button type="submit" size="icon" className="shrink-0 rounded-full" disabled={!messageContent.trim() || sendMessageMutation.isPending}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <DelegateModal
        taskId={taskId}
        open={showDelegateModal}
        onClose={() => setShowDelegateModal(false)}
      />
    </AppLayout>
  );
}

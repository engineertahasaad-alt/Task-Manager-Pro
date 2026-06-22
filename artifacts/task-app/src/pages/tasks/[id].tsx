import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useGetTask, useCompleteTask, useApproveTask, useReopenTask, useGetMe, useListMessages, useSendMessage, getGetTaskQueryKey, getListMessagesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Send, CheckCircle2, XCircle, ArrowLeft, Paperclip, FileIcon, Download, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TaskDetail() {
  const { id } = useParams();
  const taskId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
  const isAssignee = user?.id === task?.assigneeId;

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

    const token = localStorage.getItem("taskflow_token");
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
    } catch (err) {
      toast({ title: "Failed to upload file", variant: "destructive" });
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-amber-100 text-amber-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'reopened': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading || !task) return <AppLayout><div className="flex justify-center p-12">Loading...</div></AppLayout>;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-100px)] md:h-[calc(100vh-60px)]">
        <div className="flex items-center gap-2 mb-4 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/tasks")}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-xl font-bold tracking-tight truncate flex-1">{task.title}</h1>
          <Badge className={getStatusColor(task.status)}>{task.status.toUpperCase()}</Badge>
        </div>

        <div className="grid md:grid-cols-3 gap-4 min-h-0 flex-1 overflow-hidden">
          {/* Task Info Sidebar */}
          <div className="md:col-span-1 overflow-y-auto pr-2 space-y-4">
            <Card>
              <CardContent className="p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                  <p className="text-sm whitespace-pre-wrap">{task.description}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Assignee</h3>
                    <p className="text-sm font-medium">{task.assignee?.fullName}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Creator</h3>
                    <p className="text-sm font-medium">{task.creator?.fullName}</p>
                  </div>
                  <div className="col-span-2">
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Deadline</h3>
                    <p className="text-sm font-medium">{format(new Date(task.deadline), "MMM d, yyyy h:mm a")}</p>
                  </div>
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
                  {task.status === 'open' && isAssignee && (
                    <Button className="w-full" onClick={() => handleStatusChange(completeMutation, "marked complete")}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Complete
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
                  {task.status === 'reopened' && isAssignee && (
                    <Button className="w-full" onClick={() => handleStatusChange(completeMutation, "marked complete")}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Resubmit as Complete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chat Section */}
          <div className="md:col-span-2 flex flex-col bg-gray-50/50 rounded-xl border overflow-hidden">
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {messages?.map(msg => {
                const isMe = msg.senderId === user?.id;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-600">{!isMe ? msg.sender?.fullName : 'You'}</span>
                      <span className="text-[10px] text-gray-400">{format(new Date(msg.createdAt), "h:mm a")}</span>
                    </div>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${isMe ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-white border rounded-tl-sm text-gray-900 shadow-sm'}`}>
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
    </AppLayout>
  );
}
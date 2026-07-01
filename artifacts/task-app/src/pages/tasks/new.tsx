import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateTask, useListUsers } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppLayout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { Check } from "lucide-react";

const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  assigneeIds: z.array(z.number()).min(1, "At least one assignee is required"),
  deadlineDate: z.string().min(1, "Deadline date is required"),
  deadlineTime: z.string().min(1, "Deadline time is required"),
  priority: z.enum(["low", "medium", "high", "critical"]),
});

const PRIORITY_OPTIONS = [
  { value: "low",      label: "Low",      color: "text-slate-600" },
  { value: "medium",   label: "Medium",   color: "text-yellow-700" },
  { value: "high",     label: "High",     color: "text-orange-700" },
  { value: "critical", label: "Critical", color: "text-red-700" },
];

export default function NewTask() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createTaskMutation = useCreateTask();
  const { data: users, isLoading: usersLoading } = useListUsers();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const form = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      assigneeIds: [],
      deadlineDate: format(new Date(), "yyyy-MM-dd"),
      deadlineTime: "17:00",
      priority: "medium",
    },
  });

  const uploadFile = async (taskId: number, file: File) => {
    const token = localStorage.getItem("taskaya_token");
    const formData = new FormData();
    formData.append('file', file);
    try {
      await fetch(`/api/tasks/${taskId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
    } catch (e) {
      console.error("File upload failed", e);
    }
  };

  const onSubmit = (values: z.infer<typeof taskSchema>) => {
    const deadline = new Date(`${values.deadlineDate}T${values.deadlineTime}`).toISOString();
    createTaskMutation.mutate({
      data: {
        title: values.title,
        description: values.description,
        assigneeIds: values.assigneeIds,
        deadline,
        priority: values.priority,
      } as any
    }, {
      onSuccess: async (task) => {
        if (selectedFile) {
          await uploadFile(task.id, selectedFile);
        }
        toast({ title: "Task created successfully" });
        setLocation("/tasks");
      },
      onError: () => {
        toast({ title: "Failed to create task", variant: "destructive" });
      }
    });
  };

  const toggleAssignee = (userId: number, current: number[]) => {
    if (current.includes(userId)) return current.filter(id => id !== userId);
    return [...current, userId];
  };

  const activeUsers = users?.filter(u => u.isActive) ?? [];

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Task</h1>
          <p className="text-muted-foreground">Assign a new task to one or more team members.</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl><Input placeholder="Task title" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Detailed task description..." className="min-h-[120px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="priority" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className={opt.color + " font-medium"}>{opt.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField
                  control={form.control}
                  name="assigneeIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assignees <span className="text-muted-foreground font-normal">(select one or more)</span></FormLabel>
                      <div className="border rounded-lg divide-y overflow-hidden">
                        {usersLoading ? (
                          <div className="p-4 text-sm text-muted-foreground">Loading members...</div>
                        ) : activeUsers.length === 0 ? (
                          <div className="p-4 text-sm text-muted-foreground">No active members</div>
                        ) : activeUsers.map(u => {
                          const isSelected = field.value.includes(u.id);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${isSelected ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''}`}
                              onClick={() => field.onChange(toggleAssignee(u.id, field.value))}
                            >
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                {isSelected ? <Check className="h-4 w-4" /> : u.fullName.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{u.fullName}</p>
                                <p className="text-xs text-muted-foreground capitalize">{u.role}</p>
                              </div>
                              {isSelected && <span className="text-xs font-medium text-indigo-600 shrink-0">Selected</span>}
                            </button>
                          );
                        })}
                      </div>
                      {field.value.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {field.value.length} {field.value.length === 1 ? 'person' : 'people'} selected
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="deadlineDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deadline Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="deadlineTime" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deadline Time</FormLabel>
                      <FormControl><Input type="time" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Attachment (optional)</label>
                  <Input type="file" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setLocation("/tasks")}>Cancel</Button>
                  <Button type="submit" disabled={createTaskMutation.isPending}>
                    {createTaskMutation.isPending ? "Creating..." : "Create Task"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

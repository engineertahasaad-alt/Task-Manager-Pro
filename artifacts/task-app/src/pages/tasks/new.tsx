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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  assigneeId: z.coerce.number().min(1, "Assignee is required"),
  deadlineDate: z.string().min(1, "Deadline date is required"),
  deadlineTime: z.string().min(1, "Deadline time is required"),
});

export default function NewTask() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createTaskMutation = useCreateTask();
  const { data: users, isLoading: usersLoading } = useListUsers();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const form = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: "", description: "", assigneeId: 0, deadlineDate: format(new Date(), "yyyy-MM-dd"), deadlineTime: "17:00" },
  });

  const uploadFile = async (taskId: number, file: File) => {
    const token = localStorage.getItem("taskflow_token");
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
        assigneeId: values.assigneeId,
        deadline,
      }
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

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Task</h1>
          <p className="text-muted-foreground">Assign a new task to a team member.</p>
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
                    <FormControl><Textarea placeholder="Detailed task description..." className="min-h-[120px]" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                
                <FormField control={form.control} name="assigneeId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ? String(field.value) : undefined}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select team member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users?.filter(u => u.isActive).map(u => (
                          <SelectItem key={u.id} value={String(u.id)}>{u.fullName} ({u.role})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

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

                <FormItem>
                  <FormLabel>Attachment (optional)</FormLabel>
                  <FormControl>
                    <Input type="file" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                  </FormControl>
                </FormItem>

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
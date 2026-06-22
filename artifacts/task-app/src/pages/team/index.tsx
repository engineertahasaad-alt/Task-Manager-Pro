import { useState } from "react";
import { useGetMe, useListUsers, useCreateUser, useUpdateUser, useDisableUser, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { UserPlus, Edit, Ban, CheckCircle } from "lucide-react";
import { Redirect } from "wouter";

const userSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  mobile: z.string().min(1, "Mobile is required"),
  role: z.enum(["owner", "deputy", "member"]),
});

export default function Team() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetMe();
  const { data: users, isLoading } = useListUsers();
  
  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const disableUserMutation = useDisableUser();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: { fullName: "", mobile: "", role: "member" },
  });

  const isManager = currentUser?.role === 'owner' || currentUser?.role === 'deputy';

  if (!isManager && currentUser) return <Redirect to="/dashboard" />;

  const onSubmit = (values: z.infer<typeof userSchema>) => {
    if (editingUser) {
      updateUserMutation.mutate({ id: editingUser.id, data: values }, {
        onSuccess: () => {
          toast({ title: "User updated successfully" });
          setEditingUser(null);
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        }
      });
    } else {
      createUserMutation.mutate({ data: values }, {
        onSuccess: () => {
          toast({ title: "User created successfully", description: "Default password is '123'" });
          setIsCreateOpen(false);
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        }
      });
    }
  };

  const handleToggleStatus = (id: number) => {
    disableUserMutation.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "User status updated" });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      }
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team Members</h1>
            <p className="text-muted-foreground">Manage roles, access, and team details.</p>
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => form.reset()}><UserPlus className="mr-2 h-4 w-4" /> Add Member</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Team Member</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="fullName" render={({ field }) => (
                    <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="mobile" render={({ field }) => (
                    <FormItem><FormLabel>Mobile Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="role" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {currentUser?.role === 'owner' && <SelectItem value="owner">Owner</SelectItem>}
                          <SelectItem value="deputy">Deputy</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full" disabled={createUserMutation.isPending}>Create User</Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Team Member</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="fullName" render={({ field }) => (
                  <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="mobile" render={({ field }) => (
                  <FormItem><FormLabel>Mobile Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {currentUser?.role === 'owner' && <SelectItem value="owner">Owner</SelectItem>}
                        <SelectItem value="deputy">Deputy</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={updateUserMutation.isPending}>Save Changes</Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <div className="rounded-md border bg-white overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center h-24">Loading...</TableCell></TableRow>
              ) : users?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.fullName}</TableCell>
                  <TableCell>{u.mobile}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">{u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    {u.isActive ? (
                      <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-gray-100 text-gray-500">Disabled</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => {
                      setEditingUser(u);
                      form.reset({ fullName: u.fullName, mobile: u.mobile, role: u.role as any });
                    }} disabled={u.id === currentUser?.id || (currentUser?.role !== 'owner' && u.role === 'owner')}>
                      <Edit className="h-4 w-4 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(u.id)} disabled={u.id === currentUser?.id || (currentUser?.role !== 'owner' && u.role === 'owner')}>
                      {u.isActive ? <Ban className="h-4 w-4 text-red-500" /> : <CheckCircle className="h-4 w-4 text-green-500" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}
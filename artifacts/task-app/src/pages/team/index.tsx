import { useState } from "react";
import { useGetMe, useListUsers, useCreateUser, useUpdateUser, useDisableUser, useResetUserPassword, getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { UserPlus, Edit, Ban, CheckCircle, KeyRound } from "lucide-react";
import { Redirect } from "wouter";
import type { User } from "@workspace/api-client-react";

const userSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  mobile: z.string().min(1, "Mobile is required"),
  role: z.enum(["owner", "deputy", "member"]),
});

const resetPwSchema = z.object({
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm"),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function Team() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: currentUser } = useGetMe();
  const { data: users, isLoading } = useListUsers();

  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const disableUserMutation = useDisableUser();
  const resetPasswordMutation = useResetUserPassword();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);

  const form = useForm<z.infer<typeof userSchema>>({
    resolver: zodResolver(userSchema),
    defaultValues: { fullName: "", mobile: "", role: "member" },
  });

  const resetPwForm = useForm<z.infer<typeof resetPwSchema>>({
    resolver: zodResolver(resetPwSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const isManager = currentUser?.role === "owner" || currentUser?.role === "deputy";

  if (!isManager && currentUser) return <Redirect to="/dashboard" />;

  const onSubmitUser = (values: z.infer<typeof userSchema>) => {
    if (editingUser) {
      updateUserMutation.mutate({ id: editingUser.id, data: values }, {
        onSuccess: () => {
          toast({ title: "User updated" });
          setEditingUser(null);
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.data?.error ?? "Could not update user.", variant: "destructive" });
        }
      });
    } else {
      createUserMutation.mutate({ data: values }, {
        onSuccess: () => {
          toast({ title: "User created", description: "Default password is '123' — they must change it on first login." });
          setIsCreateOpen(false);
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.data?.error ?? "Could not create user.", variant: "destructive" });
        }
      });
    }
  };

  const onSubmitResetPw = (values: z.infer<typeof resetPwSchema>) => {
    if (!resetTargetUser) return;
    resetPasswordMutation.mutate({ id: resetTargetUser.id, data: { newPassword: values.newPassword } }, {
      onSuccess: () => {
        toast({ title: "Password reset", description: `${resetTargetUser.fullName} must change their password on next login.` });
        setResetTargetUser(null);
        resetPwForm.reset();
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err?.data?.error ?? "Could not reset password.", variant: "destructive" });
      }
    });
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
          <Button onClick={() => { form.reset(); setIsCreateOpen(true); }}>
            <UserPlus className="mr-2 h-4 w-4" /> Add Member
          </Button>
        </div>

        {/* Create User Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add New Team Member</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitUser)} className="space-y-4">
                <FormField control={form.control} name="fullName" render={({ field }) => (
                  <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="mobile" render={({ field }) => (
                  <FormItem><FormLabel>Mobile Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {currentUser?.role === "owner" && <SelectItem value="deputy">Deputy</SelectItem>}
                        <SelectItem value="member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? "Creating..." : "Create User"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Team Member</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitUser)} className="space-y-4">
                <FormField control={form.control} name="fullName" render={({ field }) => (
                  <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="mobile" render={({ field }) => (
                  <FormItem><FormLabel>Mobile Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {currentUser?.role === "owner" && <SelectItem value="owner">Owner</SelectItem>}
                        {currentUser?.role === "owner" && <SelectItem value="deputy">Deputy</SelectItem>}
                        <SelectItem value="member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={updateUserMutation.isPending}>
                  {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={!!resetTargetUser} onOpenChange={(open) => { if (!open) { setResetTargetUser(null); resetPwForm.reset(); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password — {resetTargetUser?.fullName}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Set a temporary password. The user will be required to change it on their next login.</p>
            <Form {...resetPwForm}>
              <form onSubmit={resetPwForm.handleSubmit(onSubmitResetPw)} className="space-y-4">
                <FormField control={resetPwForm.control} name="newPassword" render={({ field }) => (
                  <FormItem><FormLabel>New Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={resetPwForm.control} name="confirmPassword" render={({ field }) => (
                  <FormItem><FormLabel>Confirm Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={resetPasswordMutation.isPending}>
                  {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <div className="rounded-md border bg-white overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Mobile</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : users?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No team members yet.</TableCell></TableRow>
              ) : users?.map((u) => {
                const canManage = u.id !== currentUser?.id && !(currentUser?.role !== "owner" && u.role === "owner");
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.fullName}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{u.mobile}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-500">Disabled</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Edit user" onClick={() => {
                          setEditingUser(u);
                          form.reset({ fullName: u.fullName, mobile: u.mobile, role: u.role as any });
                        }} disabled={!canManage}>
                          <Edit className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Reset password" onClick={() => {
                          setResetTargetUser(u);
                          resetPwForm.reset();
                        }} disabled={!canManage}>
                          <KeyRound className="h-4 w-4 text-amber-500" />
                        </Button>
                        <Button variant="ghost" size="icon" title={u.isActive ? "Disable user" : "Enable user"} onClick={() => handleToggleStatus(u.id)} disabled={!canManage}>
                          {u.isActive ? <Ban className="h-4 w-4 text-red-500" /> : <CheckCircle className="h-4 w-4 text-green-500" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}

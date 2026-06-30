import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useChangePassword } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, LogOut, User, Users, Copy, Check, ShieldCheck, UserPlus, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password")
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const joinGroupSchema = z.object({
  inviteCode: z.string().min(1, "Invite code is required"),
});

export default function Settings() {
  const { data: user } = useGetMe();
  const { toast } = useToast();
  const changePasswordMutation = useChangePassword();
  const [copied, setCopied] = useState(false);
  const isOwner = user?.role === "owner";
  const [joinSuccess, setJoinSuccess] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const joinGroupMutation = useMutation({
    mutationFn: async (values: z.infer<typeof joinGroupSchema>) => {
      const token = localStorage.getItem("taskaya_token");
      const res = await fetch("/api/auth/join-group", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ inviteCode: values.inviteCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send request");
      return data;
    },
    onSuccess: () => {
      setJoinSuccess(true);
      joinForm.reset();
    },
    onError: (err: any) => {
      toast({ title: "Could not join group", description: err.message, variant: "destructive" });
    },
  });

  const joinForm = useForm<z.infer<typeof joinGroupSchema>>({
    resolver: zodResolver(joinGroupSchema),
    defaultValues: { inviteCode: "" },
  });

  const { data: teamInfo } = useQuery({
    queryKey: ["team-info"],
    queryFn: async () => {
      const token = localStorage.getItem("taskaya_token");
      const res = await fetch("/api/team/info", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json() as Promise<{ id: number; name: string; inviteCode: string }>;
    },
    enabled: !!user,
  });

  const handleCopyCode = () => {
    if (teamInfo?.inviteCode) {
      navigator.clipboard.writeText(teamInfo.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Invite code copied!" });
    }
  };

  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = (values: z.infer<typeof passwordSchema>) => {
    changePasswordMutation.mutate({ 
      data: { currentPassword: values.currentPassword, newPassword: values.newPassword } 
    }, {
      onSuccess: () => {
        toast({ title: "Password updated successfully" });
        form.reset();
      },
      onError: (err: any) => {
        toast({ title: "Failed to update password", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleLogout = () => {
    localStorage.removeItem("taskaya_token");
    window.location.href = "/login";
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences.</p>
        </div>

        {teamInfo && (
          <Card className="border-indigo-100 bg-indigo-50/30">
            <CardHeader>
              <CardTitle className="flex items-center"><Users className="mr-2 h-5 w-5 text-indigo-600" /> Team</CardTitle>
              <CardDescription>Share the invite code so others can join your team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Team Name</label>
                <p className="text-md font-medium">{teamInfo.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500 block mb-1">Invite Code</label>
                <div className="flex items-center gap-2">
                  <div className="bg-white border-2 border-indigo-200 rounded-lg px-4 py-2 font-mono text-xl font-bold tracking-widest text-indigo-700 select-all">
                    {teamInfo.inviteCode}
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCopyCode} className="shrink-0">
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              Appearance
            </CardTitle>
            <CardDescription>Switch between light and dark mode.</CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-3 w-full rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-center h-9 w-9 rounded-full bg-muted shrink-0">
                {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{theme === "dark" ? "Dark mode" : "Light mode"}</p>
                <p className="text-xs text-muted-foreground">Click to switch to {theme === "dark" ? "light" : "dark"} mode</p>
              </div>
              <div className={`relative h-5 w-9 rounded-full transition-colors ${theme === "dark" ? "bg-primary" : "bg-muted-foreground/30"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${theme === "dark" ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center"><User className="mr-2 h-5 w-5" /> Profile Information</CardTitle>
            <CardDescription>Your personal details in the system.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Full Name</label>
                <p className="text-md font-medium">{user?.fullName}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Mobile</label>
                <p className="text-md font-medium">{user?.mobile}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Role</label>
                <p className="text-md font-medium capitalize">{user?.role}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-indigo-100 bg-indigo-50/30">
          <CardHeader>
            <CardTitle className="flex items-center"><UserPlus className="mr-2 h-5 w-5 text-indigo-600" /> Join Another Group</CardTitle>
            <CardDescription>Enter an invite code to request access to a different group.</CardDescription>
          </CardHeader>
          <CardContent>
            {joinSuccess ? (
              <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
                <Check className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="font-medium">Request sent!</p>
                  <p className="text-sm text-green-700">Waiting for the owner to approve you.</p>
                </div>
              </div>
            ) : (
              <Form {...joinForm}>
                <form onSubmit={joinForm.handleSubmit((v) => joinGroupMutation.mutate(v))} className="flex items-end gap-3">
                  <FormField control={joinForm.control} name="inviteCode" render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Invite Code</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. A1B2C3D4"
                          className="font-mono uppercase"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" disabled={joinGroupMutation.isPending}>
                    {joinGroupMutation.isPending ? "Sending…" : "Send Request"}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center"><KeyRound className="mr-2 h-5 w-5" /> Change Password</CardTitle>
            <CardDescription>Ensure your account is using a long, random password to stay secure.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="currentPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl><Input type="password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="newPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl><Input type="password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl><Input type="password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" disabled={changePasswordMutation.isPending}>
                  {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {(user?.role === "owner" || user?.role === "deputy") && (
          <Card className="border-indigo-100 bg-indigo-50/30">
            <CardHeader>
              <CardTitle className="flex items-center">
                <ShieldCheck className="mr-2 h-5 w-5 text-indigo-600" /> Administration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link href="/settings/audit-log">
                <Button variant="outline" className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-indigo-600" />
                  View Audit Log
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        <Card className="border-red-100 bg-red-50/30">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" /> Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
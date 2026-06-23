import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSignup } from "@workspace/api-client-react";
import { CheckSquare, Users, UserPlus } from "lucide-react";

const createSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  mobile: z.string().min(1, "Mobile number is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  teamName: z.string().min(2, "Team name must be at least 2 characters"),
});

const joinSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  mobile: z.string().min(1, "Mobile number is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  inviteCode: z.string().min(4, "Enter the invite code from your team owner"),
});

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const signupMutation = useSignup();
  const [mode, setMode] = useState<"create" | "join">("create");

  const createForm = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { fullName: "", mobile: "", password: "", teamName: "" },
  });

  const joinForm = useForm<z.infer<typeof joinSchema>>({
    resolver: zodResolver(joinSchema),
    defaultValues: { fullName: "", mobile: "", password: "", inviteCode: "" },
  });

  const handleSubmit = (values: any) => {
    signupMutation.mutate({ data: values }, {
      onSuccess: (res: any) => {
        localStorage.setItem("taskflow_token", res.token);
        if (res.team) {
          toast({
            title: mode === "create" ? `Team "${res.team.name}" created!` : `Joined team "${res.team.name}"`,
            description: mode === "create" ? `Your invite code is: ${res.team.inviteCode}` : "Welcome to the team!",
          });
        }
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        const message = err?.response?.data?.error ?? "Could not create account.";
        toast({ title: "Signup failed", description: message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4">
      <div className="w-full max-w-md space-y-4">
        {/* Logo */}
        <div className="text-center mb-2">
          <div className="flex justify-center mb-3">
            <div className="h-14 w-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <CheckSquare className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Taskaya</h1>
          <p className="text-sm text-gray-500">Professional Team Task Management</p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setMode("create")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
              mode === "create" ? "bg-white shadow text-indigo-700" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Users className="h-4 w-4" />
            Create a Team
          </button>
          <button
            onClick={() => setMode("join")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
              mode === "join" ? "bg-white shadow text-indigo-700" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <UserPlus className="h-4 w-4" />
            Join a Team
          </button>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-4">
            {mode === "create" ? (
              <>
                <CardTitle className="text-xl font-bold">Create your team</CardTitle>
                <CardDescription>You'll be the team owner and can invite members.</CardDescription>
              </>
            ) : (
              <>
                <CardTitle className="text-xl font-bold">Join an existing team</CardTitle>
                <CardDescription>Enter the invite code your team owner shared with you.</CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {mode === "create" ? (
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField control={createForm.control} name="teamName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Name</FormLabel>
                      <FormControl><Input placeholder="e.g. Acme Corp, Marketing Team" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="fullName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Full Name</FormLabel>
                      <FormControl><Input placeholder="Enter your full name" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="mobile" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile Number</FormLabel>
                      <FormControl><Input placeholder="Enter your mobile number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={createForm.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl><Input type="password" placeholder="Choose a strong password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={signupMutation.isPending}>
                    {signupMutation.isPending ? "Creating team..." : "Create Team & Sign Up"}
                  </Button>
                </form>
              </Form>
            ) : (
              <Form {...joinForm}>
                <form onSubmit={joinForm.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField control={joinForm.control} name="inviteCode" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invite Code</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. A1B2C3D4"
                          className="font-mono uppercase tracking-widest text-lg text-center"
                          {...field}
                          onChange={e => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={joinForm.control} name="fullName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Full Name</FormLabel>
                      <FormControl><Input placeholder="Enter your full name" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={joinForm.control} name="mobile" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile Number</FormLabel>
                      <FormControl><Input placeholder="Enter your mobile number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={joinForm.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl><Input type="password" placeholder="Choose a password" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={signupMutation.isPending}>
                    {signupMutation.isPending ? "Joining..." : "Join Team & Sign Up"}
                  </Button>
                </form>
              </Form>
            )}

            <p className="text-center text-sm text-muted-foreground mt-4">
              Already have an account?{" "}
              <Link href="/login" className="text-indigo-600 hover:underline font-medium">Sign in</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe } from "@workspace/api-client-react";
import { ThemeProvider } from "@/hooks/use-theme";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Signup from "@/pages/signup";
import ForgotPassword from "@/pages/forgot-password";
import Dashboard from "@/pages/dashboard";
import ChangePassword from "@/pages/change-password";
import Tasks from "@/pages/tasks/index";
import NewTask from "@/pages/tasks/new";
import TaskDetail from "@/pages/tasks/[id]";
import Team from "@/pages/team/index";
import Notifications from "@/pages/notifications/index";
import Reports from "@/pages/reports/index";
import Settings from "@/pages/settings/index";
import AuditLog from "@/pages/settings/audit-log";

const queryClient = new QueryClient();

function PrivateRoute({ component: Component, ...rest }: any) {
  const { data: user, isLoading, isError } = useGetMe({ query: { retry: false } as any });

  if (isLoading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (isError || !user) return <Redirect to="/login" />;

  if (user.mustChangePassword && window.location.pathname !== "/change-password") {
    return <Redirect to="/change-password" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/change-password"><PrivateRoute component={ChangePassword} /></Route>
      <Route path="/dashboard"><PrivateRoute component={Dashboard} /></Route>
      
      <Route path="/tasks"><PrivateRoute component={Tasks} /></Route>
      <Route path="/tasks/new"><PrivateRoute component={NewTask} /></Route>
      <Route path="/tasks/:id"><PrivateRoute component={TaskDetail} /></Route>
      
      <Route path="/team"><PrivateRoute component={Team} /></Route>
      <Route path="/notifications"><PrivateRoute component={Notifications} /></Route>
      <Route path="/reports"><PrivateRoute component={Reports} /></Route>
      <Route path="/settings"><PrivateRoute component={Settings} /></Route>
      <Route path="/settings/audit-log"><PrivateRoute component={AuditLog} /></Route>
      
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;

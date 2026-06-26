import { Link, useLocation } from "wouter";
import { CheckSquare, Home, Users, Bell, FileText, Settings, LogOut, Menu } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useNotifications } from "@/hooks/use-notifications";
import { GroupSwitcher } from "@/components/group-switcher";
import { useQuery } from "@tanstack/react-query";

function NotificationBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user } = useGetMe();
  const isLoggedIn = !!user;

  const { unreadCount } = useNotifications(isLoggedIn);
  const isManager = user?.role === "owner" || user?.role === "deputy";

  const { data: joinRequests } = useQuery({
    queryKey: ["join-requests"],
    queryFn: async () => {
      const token = localStorage.getItem("taskaya_token");
      const res = await fetch("/api/team/join-requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [] as { id: number }[];
      return res.json() as Promise<{ id: number }[]>;
    },
    enabled: isManager && isLoggedIn,
    refetchInterval: 30_000,
  });
  const pendingCount = joinRequests?.length ?? 0;

  const navItems = [
    { icon: Home, label: "Dashboard", href: "/dashboard" },
    { icon: CheckSquare, label: "Tasks", href: "/tasks" },
    ...(isManager ? [{ icon: Users, label: "Team", href: "/team", badge: pendingCount }] : []),
    { icon: Bell, label: "Notifications", href: "/notifications", badge: unreadCount },
    ...(isManager ? [{ icon: FileText, label: "Reports", href: "/reports" }] : []),
    { icon: Settings, label: "Settings", href: "/settings" },
  ];

  const handleLogout = () => {
    localStorage.removeItem("taskaya_token");
    window.location.href = "/login";
  };

  return (
    <div className="flex min-h-screen bg-gray-50/50 flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-white">
        <div className="flex h-16 items-center border-b px-6 gap-2">
          <CheckSquare className="h-6 w-6 text-primary mr-2" />
          <span className="font-bold text-lg tracking-tight">Taskaya</span>
        </div>
        <div className="px-4 py-2 border-b">
          <GroupSwitcher />
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  location.startsWith(item.href) ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <span className="relative mr-3">
                  <item.icon className="h-5 w-5" />
                  {"badge" in item && <NotificationBadge count={item.badge ?? 0} />}
                </span>
                {item.label}
                {"badge" in item && item.badge > 0 && (
                  <span className="ml-auto h-5 min-w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-t p-4">
          <div className="flex items-center mb-4 px-2">
            <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold mr-3">
              {user?.fullName?.charAt(0) || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.fullName}</p>
              <p className="text-xs text-gray-500 truncate capitalize">{user?.role}</p>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden flex h-16 items-center justify-between border-b bg-white px-4 sticky top-0 z-30">
        <div className="flex items-center">
          <CheckSquare className="h-6 w-6 text-primary mr-2" />
          <span className="font-bold text-lg">Taskaya</span>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Link href="/notifications">
              <span className="relative inline-flex">
                <Bell className="h-6 w-6 text-gray-600" />
                <NotificationBadge count={unreadCount} />
              </span>
            </Link>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 p-0">
              <div className="flex h-16 items-center border-b px-6">
                <span className="font-bold text-lg">Menu</span>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                <nav className="space-y-1 px-4">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center rounded-md px-3 py-3 text-sm font-medium ${
                        location.startsWith(item.href) ? "bg-primary/10 text-primary" : "text-gray-600"
                      }`}
                    >
                      <span className="relative mr-3">
                        <item.icon className="h-5 w-5" />
                      </span>
                      {item.label}
                      {"badge" in item && item.badge > 0 && (
                        <span className="ml-auto h-5 min-w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      )}
                    </Link>
                  ))}
                </nav>
              </div>
              <div className="absolute bottom-0 left-0 right-0 border-t p-4 bg-white">
                <Button variant="outline" className="w-full justify-start text-red-600" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 md:pb-0 pb-16 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-4 md:p-8">{children}</div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-white flex justify-around items-center h-16 pb-safe z-30">
        {navItems.slice(0, 4).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              location.startsWith(item.href) ? "text-primary" : "text-gray-500"
            }`}
          >
            <span className="relative">
              <item.icon className="h-5 w-5" />
              {"badge" in item && <NotificationBadge count={item.badge ?? 0} />}
            </span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

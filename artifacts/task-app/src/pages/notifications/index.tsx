import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle2, Inbox, MessageSquare, CheckSquare, RotateCcw, ThumbsUp, UserCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useLocation } from "wouter";
import { useMarkAllRead } from "@workspace/api-client-react";

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  task_assigned:   { icon: Bell,          color: "text-blue-600",   bg: "bg-blue-100" },
  task_completed:  { icon: CheckSquare,   color: "text-amber-600",  bg: "bg-amber-100" },
  task_approved:   { icon: ThumbsUp,      color: "text-green-600",  bg: "bg-green-100" },
  task_reopened:   { icon: RotateCcw,     color: "text-orange-600", bg: "bg-orange-100" },
  deadline_approaching: { icon: Bell,     color: "text-red-600",    bg: "bg-red-100" },
  join_request:    { icon: UserCheck,     color: "text-indigo-600", bg: "bg-indigo-100" },
};

export default function Notifications() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: notifications, isLoading } = useListNotifications();
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  const handleMarkRead = (id: number) => {
    markReadMutation.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() })
    });
  };

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() })
    });
  };

  const handleClick = (notif: any) => {
    if (!notif.isRead) handleMarkRead(notif.id);
    if (notif.taskId) setLocation(`/tasks/${notif.taskId}`);
    else if (notif.type === "join_request") setLocation("/settings");
  };

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;
  const sorted = [...(notifications ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "All caught up!"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" onClick={handleMarkAllRead} disabled={markAllReadMutation.isPending}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark all read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-20 border rounded-2xl bg-gray-50/50">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Inbox className="h-8 w-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700">You're all caught up!</h3>
            <p className="mt-1 text-sm text-gray-400">No notifications yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((notif) => {
              const cfg = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.task_assigned;
              const Icon = cfg.icon;
              const isClickable = !!notif.taskId || notif.type === "join_request";
              const clickHint = notif.type === "join_request"
                ? "Go to settings to switch groups →"
                : "Tap to open task →";
              return (
                <div
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={[
                    "flex gap-4 items-start p-4 rounded-xl border transition-all",
                    !notif.isRead ? "bg-indigo-50/60 border-indigo-200" : "bg-white border-gray-100 opacity-75",
                    isClickable ? "cursor-pointer hover:shadow-sm hover:border-indigo-300" : "",
                  ].join(" ")}
                >
                  <div className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${cfg.bg}`}>
                    <Icon className={`h-5 w-5 ${cfg.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${!notif.isRead ? "font-semibold text-gray-900" : "text-gray-600"}`}>
                      {notif.message}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                    </p>
                    {isClickable && (
                      <p className="text-xs text-indigo-500 mt-1 font-medium">{clickHint}</p>
                    )}
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-2">
                    {!notif.isRead && (
                      <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 mt-1" />
                    )}
                    {!notif.isRead && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 px-2"
                        onClick={(e) => { e.stopPropagation(); handleMarkRead(notif.id); }}
                      >
                        Dismiss
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

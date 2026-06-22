import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, CheckCircle2, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

export default function Notifications() {
  const queryClient = useQueryClient();
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

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            <p className="text-muted-foreground">Stay updated on your tasks.</p>
          </div>
          {unreadCount > 0 && (
            <Button variant="outline" onClick={handleMarkAllRead} disabled={markAllReadMutation.isPending}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark all as read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : notifications?.length === 0 ? (
          <div className="text-center py-16 border rounded-lg bg-gray-50/50">
            <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Inbox className="h-6 w-6 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">You're all caught up!</h3>
            <p className="mt-1 text-sm text-gray-500">No new notifications at this time.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications?.map((notif) => (
              <Card key={notif.id} className={`${!notif.isRead ? 'border-primary/30 bg-primary/5' : 'opacity-70'} transition-all`}>
                <CardContent className="p-4 flex gap-4">
                  <div className="mt-1">
                    <div className={`h-2 w-2 rounded-full ${!notif.isRead ? 'bg-primary' : 'bg-transparent'}`} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className={`text-sm ${!notif.isRead ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                      {notif.message}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                    </p>
                    {notif.taskId && (
                      <Link href={`/tasks/${notif.taskId}`} className="inline-block mt-2 text-sm text-primary hover:underline font-medium">
                        View Task
                      </Link>
                    )}
                  </div>
                  {!notif.isRead && (
                    <Button variant="ghost" size="sm" onClick={() => handleMarkRead(notif.id)} className="shrink-0 text-xs h-8">
                      Mark read
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
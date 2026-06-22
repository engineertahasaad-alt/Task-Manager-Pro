import { useState } from "react";
import { Link } from "wouter";
import { useListTasks, useGetMe } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Filter, Clock } from "lucide-react";
import { format } from "date-fns";

export default function Tasks() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: user } = useGetMe();
  const isManager = user?.role === 'owner' || user?.role === 'deputy';

  const { data: tasks, isLoading } = useListTasks({ 
    ...(statusFilter !== "all" && { status: statusFilter as any }) 
  });

  const filteredTasks = tasks?.filter(task => 
    task.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    task.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'open': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'approved': return 'bg-green-100 text-green-800 border-green-200';
      case 'reopened': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
            <p className="text-muted-foreground">Manage and track your team's work.</p>
          </div>
          {isManager && (
            <Link href="/tasks/new">
              <Button className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" /> New Task
              </Button>
            </Link>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
          <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto">
            <TabsList className="w-full sm:w-auto grid grid-cols-5 h-auto">
              <TabsTrigger value="all" className="text-xs sm:text-sm py-2">All</TabsTrigger>
              <TabsTrigger value="open" className="text-xs sm:text-sm py-2">Open</TabsTrigger>
              <TabsTrigger value="completed" className="text-xs sm:text-sm py-2">Done</TabsTrigger>
              <TabsTrigger value="approved" className="text-xs sm:text-sm py-2">OK'd</TabsTrigger>
              <TabsTrigger value="reopened" className="text-xs sm:text-sm py-2">Reop.</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input 
              type="search" 
              placeholder="Search tasks..." 
              className="pl-9 w-full"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading tasks...</div>
        ) : filteredTasks?.length === 0 ? (
          <div className="text-center py-16 border rounded-lg bg-gray-50/50">
            <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Filter className="h-6 w-6 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No tasks found</h3>
            <p className="mt-1 text-sm text-gray-500">Try adjusting your filters or search query.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredTasks?.map(task => {
              const isOverdue = new Date(task.deadline) < new Date() && task.status !== 'approved';
              
              return (
                <Link key={task.id} href={`/tasks/${task.id}`}>
                  <Card className={`hover:border-primary/50 transition-colors cursor-pointer ${isOverdue ? 'border-red-200 bg-red-50/30' : ''}`}>
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-lg leading-tight">{task.title}</h3>
                            <Badge variant="outline" className={getStatusColor(task.status)}>
                              {task.status.toUpperCase()}
                            </Badge>
                            {isOverdue && (
                              <Badge variant="destructive" className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Overdue
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2">{task.description}</p>
                        </div>
                        
                        <div className="flex flex-col items-start sm:items-end text-sm text-gray-500 gap-1 sm:min-w-[140px]">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {format(new Date(task.deadline), "MMM d, yyyy")}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                              {task.assignee?.fullName?.charAt(0) || '?'}
                            </div>
                            <span className="text-xs">{task.assignee?.fullName || 'Unassigned'}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
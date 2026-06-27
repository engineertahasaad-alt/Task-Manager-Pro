import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check, Layers, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface GroupSummary {
  id: number;
  name: string;
  role: string;
  isActive?: boolean;
  pendingApproval?: boolean;
}

async function fetchGroups(): Promise<GroupSummary[]> {
  const token = localStorage.getItem("taskaya_token");
  const res = await fetch("/api/auth/groups", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return res.json();
}

async function switchGroup(groupId: number): Promise<{ token: string; user: any; activeGroupId: number }> {
  const token = localStorage.getItem("taskaya_token");
  const res = await fetch("/api/auth/switch-group", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ groupId }),
  });
  if (!res.ok) throw new Error("Failed to switch group");
  return res.json();
}

export function GroupSwitcher() {
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(false);

  const { data: groups = [] } = useQuery({
    queryKey: ["auth-groups"],
    queryFn: fetchGroups,
    refetchInterval: 30_000,
  });

  const activeGroups = groups.filter((g) => !g.pendingApproval);
  const pendingGroups = groups.filter((g) => g.pendingApproval);

  if (groups.length <= 1 && pendingGroups.length === 0) return null;

  const activeGroup = groups.find((g) => g.isActive) ?? activeGroups[0];
  const hasPending = pendingGroups.length > 0;

  async function handleSwitch(groupId: number) {
    if (switching || activeGroup?.id === groupId) return;
    setSwitching(true);
    try {
      const data = await switchGroup(groupId);
      localStorage.setItem("taskaya_token", data.token);
      await queryClient.invalidateQueries();
    } catch {
    } finally {
      setSwitching(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium relative" disabled={switching}>
          <Layers className="h-3.5 w-3.5 text-indigo-600" />
          <span className="max-w-[120px] truncate">{activeGroup?.name ?? "Switch Group"}</span>
          {hasPending && (
            <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-amber-400 border-2 border-background" />
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Your Groups</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {activeGroups.map((g) => (
          <DropdownMenuItem
            key={g.id}
            onClick={() => handleSwitch(g.id)}
            className="flex items-center justify-between gap-2 cursor-pointer"
          >
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium text-sm">{g.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{g.role}</p>
            </div>
            {g.isActive && <Check className="h-4 w-4 text-indigo-600 shrink-0" />}
          </DropdownMenuItem>
        ))}
        {pendingGroups.length > 0 && activeGroups.length > 0 && <DropdownMenuSeparator />}
        {pendingGroups.map((g) => (
          <DropdownMenuItem
            key={g.id}
            disabled
            className="flex items-center justify-between gap-2 opacity-60 cursor-default"
          >
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium text-sm">{g.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{g.role}</p>
            </div>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-600 bg-amber-50 shrink-0 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              Pending
            </Badge>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

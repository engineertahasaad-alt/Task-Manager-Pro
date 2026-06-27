import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface GroupSummary {
  id: number;
  name: string;
  role: string;
  isActive?: boolean;
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
  });

  if (groups.length <= 1) return null;

  const activeGroup = groups.find((g) => g.isActive) ?? groups[0];

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
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium" disabled={switching}>
          <Layers className="h-3.5 w-3.5 text-indigo-600" />
          <span className="max-w-[120px] truncate">{activeGroup?.name ?? "Switch Group"}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Your Groups</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {groups.map((g) => (
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { useNavigate } from "@tanstack/react-router";
import { LogOut, User as UserIcon, Building2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const roleLabel: Record<string, string> = {
  administrador: "Administrador",
  financeiro: "Financeiro",
  gestor: "Gestor",
  motorista: "Motorista",
};

export function UserMenu() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const initials =
    (user?.email ?? "??")
      .split("@")[0]
      .split(/[._-]/)
      .map((s) => s.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??";

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut({ scope: "local" });
    navigate({ to: "/auth", replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar className="size-8">
            <AvatarFallback className="bg-brand text-brand-foreground text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-1">
            <span className="truncate text-sm font-medium">{user?.email}</span>
            {role && (
              <Badge variant="outline" className="w-fit text-[10px]">
                {roleLabel[role]}
              </Badge>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <UserIcon className="mr-2 size-4" />
          Meu perfil
        </DropdownMenuItem>
        {role === "administrador" && (
          <DropdownMenuItem onSelect={() => navigate({ to: "/app/empresa" })}>
            <Building2 className="mr-2 size-4" />
            Empresa
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

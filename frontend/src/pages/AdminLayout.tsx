import { useEffect } from "react";
import { Link, Outlet, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@heroui/react";

import { api, ApiError } from "../api/client";
import { AppHeader } from "../components/AppHeader";
import { SiteFooter } from "../components/SiteFooter";

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </svg>
  );
}

export function AdminLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { isError, error } = useQuery({
    queryKey: ["admin-session"],
    queryFn: api.session,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isError && error instanceof ApiError && error.status === 401) {
      navigate("/login", { replace: true });
    }
  }, [isError, error, navigate]);

  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.clear();
      navigate("/", { replace: true });
    },
  });

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader
        actions={
          <>
            <Link to="/admin/einstellungen" aria-label="Einstellungen">
              <Button variant="ghost" size="sm" isIconOnly>
                <SettingsIcon />
              </Button>
            </Link>
            <Button variant="ghost" size="sm" isIconOnly aria-label="Abmelden" onPress={() => logout.mutate()}>
              <LogoutIcon />
            </Button>
          </>
        }
      />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

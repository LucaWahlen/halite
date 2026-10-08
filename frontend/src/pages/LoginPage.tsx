import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card, toast } from "@heroui/react";

import { api, ApiError } from "../api/client";
import { AppHeader } from "../components/AppHeader";

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: () => api.login(password),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      navigate("/admin", { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "rate_limited") {
        toast.danger("Zu viele Anmeldeversuche. Bitte später erneut versuchen.");
      } else {
        toast.danger("Falsches Passwort.");
      }
    },
  });

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
        <Card>
          <Card.Content className="gap-5 p-6">
            <div>
              <h1 className="font-display text-xl font-bold">Anmelden</h1>
            </div>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                login.mutate();
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Passwort</span>
                <input
                  type="password"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  value={password}
                  autoComplete="current-password"
                  autoFocus
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <Button type="submit" isDisabled={login.isPending || password.length === 0}>
                Anmelden
              </Button>
            </form>
          </Card.Content>
        </Card>
      </main>
    </div>
  );
}

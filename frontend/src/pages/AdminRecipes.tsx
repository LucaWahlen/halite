import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Modal, toast, useOverlayState } from "@heroui/react";

import { api } from "../api/client";
import type { RecipeSummary } from "../api/client";
import { apiErrorMessage } from "../lib/errors";
import { formatMinutes, formatServings } from "../lib/format";

const PAGE_SIZE = 12;

export function AdminRecipes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deleteModal = useOverlayState();
  const [target, setTarget] = useState<RecipeSummary | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [searchInput, setSearchInput] = useState(q);

  useEffect(() => setSearchInput(q), [q]);

  useEffect(() => {
    if (searchInput === q) return;
    const id = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (searchInput) params.set("q", searchInput);
          else params.delete("q");
          params.delete("page");
          return params;
        },
        { replace: true },
      );
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput, q, setSearchParams]);

  const params = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, sort: "updated" as const, q: q.trim() || undefined }),
    [page, q],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-recipes", params],
    queryFn: () => api.listRecipes(params),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRecipe(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-recipes"] });
      void queryClient.invalidateQueries({ queryKey: ["recipes"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      deleteModal.close();
      toast.success("Rezept gelöscht.");
    },
    onError: (err) => toast.danger(apiErrorMessage(err)),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Rezepte verwalten</h1>
          <p className="mt-1 text-sm text-muted" aria-live="polite">
            {data ? `${total} ${total === 1 ? "Rezept" : "Rezepte"}` : ""}
          </p>
        </div>
        <Link to="/admin/neu">
          <Button>Neues Rezept</Button>
        </Link>
      </div>

      <input
        type="search"
        name="admin-search"
        autoComplete="off"
        className="w-full rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
        placeholder="Suchen …"
        aria-label="Rezepte durchsuchen"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
      />

      {isLoading ? <p className="text-muted">Wird geladen …</p> : null}

      {data && total === 0 ? (
        <Card>
          <Card.Content className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="font-display text-lg font-semibold">
              {q ? "Keine Treffer" : "Noch keine Rezepte"}
            </p>
            <p className="max-w-sm text-sm text-muted">
              {q ? "Andere Suche versuchen." : "Lege dein erstes Rezept an."}
            </p>
            {q ? (
              <Button variant="secondary" onPress={() => setSearchInput("")}>
                Suche zurücksetzen
              </Button>
            ) : (
              <Link to="/admin/neu">
                <Button>Rezept anlegen</Button>
              </Link>
            )}
          </Card.Content>
        </Card>
      ) : null}

      {items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {items.map((recipe) => (
            <li key={recipe.id}>
              <Card>
                <Card.Content className="flex flex-row items-center gap-4">
                  <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-surface-secondary">
                    {recipe.has_image && recipe.image_url ? (
                      <img src={recipe.image_url} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/rezept/${recipe.id}`}
                      className="block truncate font-semibold focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {recipe.title}
                    </Link>
                    <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                      {recipe.servings > 0 ? <span>{formatServings(recipe.servings)}</span> : null}
                      {recipe.total_minutes > 0 ? <span className="tabular-nums">{formatMinutes(recipe.total_minutes)}</span> : null}
                      {recipe.tags.length > 0 ? <span>{recipe.tags.join(", ")}</span> : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="secondary" onPress={() => navigate(`/admin/rezept/${recipe.id}`)}>
                      Bearbeiten
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onPress={() => {
                        setTarget(recipe);
                        deleteModal.open();
                      }}
                    >
                      Löschen
                    </Button>
                  </div>
                </Card.Content>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      {data && totalPages > 1 ? (
        <nav className="flex items-center justify-between gap-2" aria-label="Seitennavigation">
          <Button
            size="sm"
            variant="secondary"
            isDisabled={page <= 1 || isFetching}
            onPress={() =>
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("page", String(page - 1));
                return next;
              })
            }
          >
            Zurück
          </Button>
          <span className="text-sm text-muted">
            Seite {page} von {totalPages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            isDisabled={page >= totalPages || isFetching}
            onPress={() =>
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("page", String(page + 1));
                return next;
              })
            }
          >
            Weiter
          </Button>
        </nav>
      ) : null}

      <Modal.Backdrop isOpen={deleteModal.isOpen} onOpenChange={deleteModal.setOpen}>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Rezept löschen?</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-muted">
                „{target?.title}“ wird mit seinem Bild dauerhaft entfernt. Das kann nicht rückgängig gemacht werden.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                Abbrechen
              </Button>
              <Button
                variant="danger"
                isDisabled={remove.isPending}
                onPress={() => target && remove.mutate(target.id)}
              >
                Löschen
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}

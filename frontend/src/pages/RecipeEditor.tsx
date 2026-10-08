import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Modal, toast, useOverlayState } from "@heroui/react";

import { api } from "../api/client";
import type { Ingredient, Recipe, RecipeInput } from "../api/client";
import { ImageCropper } from "../components/ImageCropper";
import { apiErrorMessage } from "../lib/errors";

type IngredientForm = { amount: string; unit: string; name: string };

type Form = {
  title: string;
  description: string;
  servings: string;
  prep: string;
  cook: string;
  ingredients: IngredientForm[];
  steps: string[];
  tags: string[];
};

const EMPTY_INGREDIENT: IngredientForm = { amount: "", unit: "", name: "" };

const EMPTY: Form = {
  title: "",
  description: "",
  servings: "",
  prep: "",
  cook: "",
  ingredients: [{ ...EMPTY_INGREDIENT }],
  steps: [""],
  tags: [],
};

function fromRecipe(recipe: Recipe): Form {
  return {
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings > 0 ? String(recipe.servings) : "",
    prep: recipe.prep_minutes > 0 ? String(recipe.prep_minutes) : "",
    cook: recipe.cook_minutes > 0 ? String(recipe.cook_minutes) : "",
    ingredients:
      recipe.ingredients.length > 0
        ? recipe.ingredients.map((ing) => ({
            amount: ing.amount > 0 ? String(ing.amount) : "",
            unit: ing.unit,
            name: ing.name,
          }))
        : [{ ...EMPTY_INGREDIENT }],
    steps: recipe.steps.length > 0 ? recipe.steps : [""],
    tags: recipe.tags,
  };
}

function clampInt(value: string, max: number): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.min(n, max);
}

function parseAmount(value: string): number {
  const n = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 1_000_000);
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function RecipeEditor() {
  const { id = "" } = useParams();
  const isNew = id === "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deleteModal = useOverlayState();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<Form>(EMPTY);
  const [tagInput, setTagInput] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["admin-recipe", id],
    queryFn: () => api.getRecipe(id),
    enabled: !isNew,
  });

  useEffect(() => {
    if (existing) {
      setForm(fromRecipe(existing));
      setPreviewUrl(existing.has_image && existing.image_url ? existing.image_url : null);
      setImageRemoved(false);
      setPendingImage(null);
    }
  }, [existing]);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-recipes"] });
    void queryClient.invalidateQueries({ queryKey: ["recipes"] });
    void queryClient.invalidateQueries({ queryKey: ["tags"] });
    void queryClient.invalidateQueries({ queryKey: ["recipe", id] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const ingredients: Ingredient[] = form.ingredients
        .map((ing) => ({
          amount: parseAmount(ing.amount),
          unit: ing.unit.trim(),
          name: ing.name.trim(),
        }))
        .filter((ing) => ing.name.length > 0);
      const input: RecipeInput = {
        title: form.title.trim(),
        description: form.description,
        servings: clampInt(form.servings, 1000),
        prep_minutes: clampInt(form.prep, 6000),
        cook_minutes: clampInt(form.cook, 6000),
        ingredients,
        steps: form.steps.map((s) => s.trim()).filter(Boolean),
        tags: form.tags,
      };
      const saved = isNew ? await api.createRecipe(input) : await api.updateRecipe(id, input);
      if (pendingImage) {
        await api.uploadImage(saved.id, pendingImage);
      } else if (imageRemoved && existing?.has_image) {
        await api.deleteImage(saved.id);
      }
      return saved;
    },
    onSuccess: (saved) => {
      invalidate();
      toast.success("Rezept gespeichert.");
      navigate(`/admin/rezept/${saved.id}`, { replace: true });
    },
    onError: (err) => toast.danger(apiErrorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteRecipe(id),
    onSuccess: () => {
      invalidate();
      toast.success("Rezept gelöscht.");
      navigate("/admin", { replace: true });
    },
    onError: (err) => toast.danger(apiErrorMessage(err)),
  });

  const setIngredient = (index: number, patch: Partial<IngredientForm>) => {
    setForm((f) => {
      const next = f.ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing));
      return { ...f, ingredients: next };
    });
  };
  const addIngredient = () =>
    setForm((f) => ({ ...f, ingredients: [...f.ingredients, { ...EMPTY_INGREDIENT }] }));
  const removeIngredient = (index: number) =>
    setForm((f) => {
      const next = f.ingredients.filter((_, i) => i !== index);
      return { ...f, ingredients: next.length > 0 ? next : [{ ...EMPTY_INGREDIENT }] };
    });

  const setStep = (index: number, value: string) =>
    setForm((f) => {
      const next = [...f.steps];
      next[index] = value;
      return { ...f, steps: next };
    });
  const addStep = () => setForm((f) => ({ ...f, steps: [...f.steps, ""] }));
  const removeStep = (index: number) =>
    setForm((f) => {
      const next = f.steps.filter((_, i) => i !== index);
      return { ...f, steps: next.length > 0 ? next : [""] };
    });

  const addTag = () => {
    const value = tagInput.trim();
    if (!value) return;
    setForm((f) =>
      f.tags.some((t) => t.toLowerCase() === value.toLowerCase()) ? f : { ...f, tags: [...f.tags, value] },
    );
    setTagInput("");
  };

  const onPickImage = (file: File | null) => {
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setCropFile(file);
  };

  const applyImage = (file: File) => {
    if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPendingImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setImageRemoved(false);
    setCropFile(null);
  };

  const clearImage = () => {
    if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPendingImage(null);
    setPreviewUrl(null);
    setImageRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!isNew && isLoading) {
    return <p className="text-muted">Wird geladen …</p>;
  }

  const canSave = form.title.trim().length > 0 && !save.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Link
          to="/admin"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Zurück zur Liste"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="font-display min-w-0 truncate text-2xl font-bold">
          {isNew ? "Neues Rezept" : "Rezept bearbeiten"}
        </h1>
      </div>

      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save.mutate();
        }}
      >
        <Card>
          <Card.Content className="gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Titel</span>
              <input
                name="recipe-title"
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
                value={form.title}
                placeholder="z. B. Salzige Kürbissuppe"
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                autoFocus={isNew}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Beschreibung</span>
              <textarea
                name="recipe-description"
                className="min-h-20 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Portionen</span>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  name="recipe-servings"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  value={form.servings}
                  placeholder="4"
                  onChange={(e) => setForm({ ...form, servings: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Vorbereitung (min)</span>
                <input
                  type="number"
                  min={0}
                  max={6000}
                  name="recipe-prep"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  value={form.prep}
                  onChange={(e) => setForm({ ...form, prep: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Kochzeit (min)</span>
                <input
                  type="number"
                  min={0}
                  max={6000}
                  name="recipe-cook"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  value={form.cook}
                  onChange={(e) => setForm({ ...form, cook: e.target.value })}
                />
              </label>
            </div>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content className="gap-4">
            <h2 className="font-display text-lg font-semibold">Bild</h2>
            <div className="flex flex-wrap items-center gap-4">
              <div className="size-32 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-surface-secondary">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center text-xs text-muted">Kein Bild</div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="text-sm"
                  onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted">JPEG, PNG oder WebP, max. 10 MB. Nach der Auswahl kannst du das Bild zuschneiden.</p>
                {previewUrl ? (
                  <Button variant="secondary" size="sm" type="button" onPress={clearImage}>
                    Bild entfernen
                  </Button>
                ) : null}
              </div>
            </div>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content className="gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">Zutaten</h2>
              <p className="text-sm text-muted">Mengen mit Einheit angeben, damit später umgerechnet werden kann.</p>
            </div>
            <div className="flex flex-col gap-2">
              {form.ingredients.map((ingredient, index) => (
                <div key={index} className="grid grid-cols-[4.5rem_4.5rem_minmax(0,1fr)_auto] items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.25"
                    inputMode="decimal"
                    className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    value={ingredient.amount}
                    placeholder="Menge"
                    aria-label={`Menge Zutat ${index + 1}`}
                    onChange={(e) => setIngredient(index, { amount: e.target.value })}
                  />
                  <input
                    className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    value={ingredient.unit}
                    placeholder="Einheit"
                    aria-label={`Einheit Zutat ${index + 1}`}
                    onChange={(e) => setIngredient(index, { unit: e.target.value })}
                  />
                  <input
                    className="min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    value={ingredient.name}
                    placeholder="Zutat"
                    aria-label={`Zutat ${index + 1}`}
                    onChange={(e) => setIngredient(index, { name: e.target.value })}
                  />
                  <button
                    type="button"
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-accent"
                    aria-label={`Zutat ${index + 1} entfernen`}
                    onClick={() => removeIngredient(index)}
                  >
                    <CloseIcon />
                  </button>
                </div>
              ))}
            </div>
            <Button variant="secondary" size="sm" type="button" className="self-start" onPress={addIngredient}>
              <span className="flex items-center gap-1.5">
                <PlusIcon /> Zutat hinzufügen
              </span>
            </Button>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content className="gap-4">
            <h2 className="font-display text-lg font-semibold">Zubereitung</h2>
            <div className="flex flex-col gap-2">
              {form.steps.map((step, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="font-display grid size-9 shrink-0 place-items-center rounded-full bg-surface-secondary text-sm font-semibold">
                    {index + 1}
                  </span>
                  <textarea
                    className="min-h-16 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    value={step}
                    aria-label={`Schritt ${index + 1}`}
                    onChange={(e) => setStep(index, e.target.value)}
                  />
                  <button
                    type="button"
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-accent"
                    aria-label={`Schritt ${index + 1} entfernen`}
                    onClick={() => removeStep(index)}
                  >
                    <CloseIcon />
                  </button>
                </div>
              ))}
            </div>
            <Button variant="secondary" size="sm" type="button" className="self-start" onPress={addStep}>
              <span className="flex items-center gap-1.5">
                <PlusIcon /> Schritt hinzufügen
              </span>
            </Button>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content className="gap-4">
            <h2 className="font-display text-lg font-semibold">Tags</h2>
            <div className="flex flex-wrap gap-1.5">
              {form.tags.length === 0 ? (
                <span className="text-sm text-muted">Noch keine Tags.</span>
              ) : (
                form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1.5 rounded-full bg-accent-soft py-1 pr-1 pl-3 text-sm text-accent-soft-foreground"
                  >
                    {tag}
                    <button
                      type="button"
                      className="grid size-5 place-items-center rounded-full transition-colors hover:bg-danger/15 hover:text-danger"
                      aria-label={`Tag ${tag} entfernen`}
                      onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }))}
                    >
                      <CloseIcon />
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                placeholder="Tag eingeben und Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button variant="secondary" size="sm" type="button" onPress={addTag}>
                Hinzufügen
              </Button>
            </div>
          </Card.Content>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {!isNew ? (
              <Button variant="danger" type="button" onPress={deleteModal.open}>
                Rezept löschen
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Link to="/admin">
              <Button variant="secondary" type="button">
                Abbrechen
              </Button>
            </Link>
            <Button type="submit" isDisabled={!canSave}>
              {save.isPending ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </div>
      </form>

      <Modal.Backdrop isOpen={deleteModal.isOpen} onOpenChange={deleteModal.setOpen}>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Rezept löschen?</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-muted">
                „{form.title}“ wird dauerhaft entfernt. Das kann nicht rückgängig gemacht werden.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                Abbrechen
              </Button>
              <Button variant="danger" isDisabled={remove.isPending} onPress={() => remove.mutate()}>
                Löschen
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {cropFile ? (
        <ImageCropper file={cropFile} onCancel={() => setCropFile(null)} onConfirm={applyImage} />
      ) : null}
    </div>
  );
}

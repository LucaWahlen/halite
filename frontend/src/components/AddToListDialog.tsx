import { useEffect, useState } from "react";
import { Button, Modal, toast } from "@heroui/react";

import { addItem } from "../lib/cart";

export interface AddToListTarget {
  id: string;
  title: string;
  servings: number;
}

export function AddToListDialog({
  recipe,
  initialPortions,
  isOpen,
  onOpenChange,
}: {
  recipe: AddToListTarget | null;
  initialPortions?: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const base = initialPortions && initialPortions > 0 ? initialPortions : recipe && recipe.servings > 0 ? recipe.servings : 1;
  const [portions, setPortions] = useState(base);

  useEffect(() => {
    if (isOpen) {
      setPortions(base);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, base]);

  const confirm = () => {
    if (recipe) {
      addItem(recipe.id, portions);
      toast.success("Zur Einkaufsliste hinzugefügt.");
    }
    onOpenChange(false);
  };

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container size="sm">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Zur Einkaufsliste</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted">„{recipe?.title}“</p>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Portionen</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={portions}
                  aria-label="Anzahl Portionen"
                  className="w-20 rounded-lg border border-border bg-surface px-3 py-2 text-center text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  onChange={(e) => {
                    const value = Number.parseInt(e.target.value, 10);
                    setPortions(Number.isNaN(value) ? 1 : Math.min(1000, Math.max(1, value)));
                  }}
                />
              </label>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button slot="close" variant="secondary">
              Abbrechen
            </Button>
            <Button onPress={confirm}>Hinzufügen</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

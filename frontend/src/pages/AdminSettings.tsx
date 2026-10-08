import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Modal, toast, useOverlayState } from "@heroui/react";

import { api } from "../api/client";
import { apiErrorMessage } from "../lib/errors";

export function AdminSettings() {
  const queryClient = useQueryClient();
  const confirmModal = useOverlayState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imprint, setImprint] = useState("");
  const [privacy, setPrivacy] = useState("");

  const { data } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: api.getAdminSettings,
    retry: false,
  });

  useEffect(() => {
    if (data) {
      setImprint(data.imprint_text);
      setPrivacy(data.privacy_text);
    }
  }, [data]);

  const dirty = data !== undefined && (imprint !== data.imprint_text || privacy !== data.privacy_text);

  const saveSettings = useMutation({
    mutationFn: () => api.putAdminSettings({ imprint_text: imprint, privacy_text: privacy }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["admin-settings"], saved);
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Einstellungen gespeichert.");
    },
    onError: (err) => toast.danger(apiErrorMessage(err)),
  });

  const upload = useMutation({
    mutationFn: (bundle: File) => api.importBundle(bundle),
    onSuccess: (result) => {
      confirmModal.close();
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.clear();
      void queryClient.invalidateQueries();
      toast.success(
        `Import abgeschlossen: ${result.imported.recipes} Rezepte, ${result.imported.images} Bilder.`,
      );
    },
    onError: (err) => toast.danger(apiErrorMessage(err)),
  });

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
        <h1 className="font-display text-2xl font-bold">Einstellungen</h1>
      </div>

      <Card>
        <Card.Content className="gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Rechtliches</h2>
            <p className="text-sm text-muted">
              Impressum und Datenschutzerklärung werden im Footer verlinkt und beim Backup mitgesichert.
            </p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Impressum</span>
            <textarea
              className="min-h-32 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
              value={imprint}
              placeholder="Angaben gemäß § 5 TMG …"
              onChange={(e) => setImprint(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Datenschutzerklärung</span>
            <textarea
              className="min-h-32 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
              value={privacy}
              placeholder="Welche Daten werden verarbeitet und warum …"
              onChange={(e) => setPrivacy(e.target.value)}
            />
          </label>
          <div>
            <Button isDisabled={!dirty || saveSettings.isPending} onPress={() => saveSettings.mutate()}>
              {saveSettings.isPending ? "Speichern …" : "Speichern"}
            </Button>
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Backup</h2>
            <p className="text-sm text-muted">
              Lädt ein ZIP-Archiv mit allen Rezepten, Bildern und Einstellungen herunter.
            </p>
          </div>
          <a href={api.exportUrl} download className="self-start">
            <Button>Backup herunterladen (.zip)</Button>
          </a>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Wiederherstellen</h2>
            <p className="text-sm text-muted">
              Spielt ein zuvor exportiertes ZIP-Archiv ein. <strong>Achtung:</strong> Alle aktuellen Rezepte, Bilder
              und Einstellungen werden dabei ersetzt.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/zip,.zip"
            className="text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div>
            <Button variant="danger" isDisabled={!file || upload.isPending} onPress={() => confirmModal.open()}>
              Import starten
            </Button>
          </div>
        </Card.Content>
      </Card>

      <Modal.Backdrop isOpen={confirmModal.isOpen} onOpenChange={confirmModal.setOpen}>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Wirklich importieren?</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-muted">
                Alle vorhandenen Rezepte, Bilder und Einstellungen werden gelöscht und durch den Inhalt von „{file?.name}“
                ersetzt. Dieser Vorgang kann nicht rückgängig gemacht werden.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                Abbrechen
              </Button>
              <Button variant="danger" isDisabled={upload.isPending} onPress={() => file && upload.mutate(file)}>
                {upload.isPending ? "Importiere …" : "Ersetzen und importieren"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}

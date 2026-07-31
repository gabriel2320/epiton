import { Button, Panel } from "@epiton/ui";
import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "../lib/store";

/** Sao-parity attachments: list / upload / download / link via ir.attachment. */
export function AttachmentsPanel(props: { model: string; recordId?: number }) {
  const client = useAppStore((s) => s.client);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const resource = props.recordId != null ? `${props.model},${props.recordId}` : null;

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const domain: unknown[] = resource
        ? [["resource", "=", resource]]
        : [["resource", "like", `${props.model},%`]];
      const result = await client.searchRead(
        "ir.attachment",
        domain as never,
        ["name", "resource", "type", "data_size", "link"],
        0,
        40,
      );
      setRows(result);
      setMessage(
        props.recordId != null
          ? `${result.length} attachment(s) for #${props.recordId}`
          : `${result.length} attachment(s)`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Attachments unavailable");
    }
  }, [client, props.model, props.recordId, resource]);

  useEffect(() => {
    if (props.recordId != null) void load();
  }, [props.recordId, load]);

  async function upload(file: File) {
    if (!client || !resource) {
      setMessage("Select a record before uploading");
      return;
    }
    setBusy(true);
    try {
      const b64 = await readFileBase64(file);
      await client.model(
        "ir.attachment",
        "create",
        [
          [
            {
              name: file.name,
              type: "data",
              resource,
              data: b64,
            },
          ],
        ],
        {},
      );
      setMessage(`Uploaded ${file.name}`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function addLink() {
    if (!client || !resource) {
      setMessage("Select a record before adding a link");
      return;
    }
    const url = linkUrl.trim();
    if (!url || url.startsWith("javascript:")) {
      setMessage("Enter a safe http(s) or relative link URL");
      return;
    }
    setBusy(true);
    try {
      await client.model(
        "ir.attachment",
        "create",
        [
          [
            {
              name: linkName.trim() || url,
              type: "link",
              resource,
              link: url,
            },
          ],
        ],
        {},
      );
      setMessage(`Linked ${url}`);
      setLinkName("");
      setLinkUrl("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Link create failed");
    } finally {
      setBusy(false);
    }
  }

  async function download(id: number, name: string) {
    if (!client) return;
    setBusy(true);
    try {
      const result = await client.model(
        "ir.attachment",
        "read",
        [[id], ["name", "data", "type", "link"]],
        {},
      );
      const row = Array.isArray(result) ? (result[0] as Record<string, unknown>) : null;
      if (row?.type === "link" && typeof row.link === "string") {
        if (row.link.startsWith("javascript:")) {
          setMessage("Blocked javascript: link");
          return;
        }
        window.open(row.link, "_blank", "noopener,noreferrer");
        setMessage(`Opened link ${row.name ?? name}`);
        return;
      }
      const data = row?.data;
      if (typeof data !== "string" || data.startsWith("javascript:")) {
        setMessage("No binary data on attachment");
        return;
      }
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = String(row?.name ?? name ?? `attachment-${id}`);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!client) return;
    if (!globalThis.confirm(`Delete attachment #${id}?`)) return;
    setBusy(true);
    try {
      await client.model("ir.attachment", "delete", [[id]], {});
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Attachments">
      {!props.recordId ? (
        <p role="status" style={{ color: "var(--epiton-muted)" }}>
          Select a record to scope attachments, or load all for this model.
        </p>
      ) : null}
      <div className="epiton-toolbar">
        <Button disabled={busy} onClick={() => void load()}>
          Load
        </Button>
        <label className="epiton-upload">
          <span>Upload</span>
          <input
            type="file"
            disabled={busy || !resource}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="epiton-toolbar" style={{ flexWrap: "wrap" }}>
        <input
          aria-label="Link name"
          placeholder="Link name"
          value={linkName}
          disabled={busy || !resource}
          onChange={(e) => setLinkName(e.target.value)}
        />
        <input
          aria-label="Link URL"
          placeholder="https://…"
          value={linkUrl}
          disabled={busy || !resource}
          onChange={(e) => setLinkUrl(e.target.value)}
          style={{ minWidth: "12rem" }}
        />
        <Button disabled={busy || !resource} onClick={() => void addLink()}>
          Add link
        </Button>
      </div>
      <div
        className={`epiton-dropzone${dragOver ? " epiton-dropzone-active" : ""}`}
        data-disabled={busy || !resource ? "true" : "false"}
        onDragEnter={(e) => {
          e.preventDefault();
          if (resource && !busy) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!resource || busy) return;
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
      >
        <p role="status">
          {resource
            ? dragOver
              ? "Drop file to attach…"
              : "Drag & drop a file here to attach"
            : "Select a record to enable drop upload"}
        </p>
      </div>
      <p role="status">{message}</p>
      <ul className="epiton-menu-list">
        {rows.map((r) => {
          const id = Number(r.id);
          const name = String(r.name ?? id);
          const kind = String(r.type ?? "data");
          return (
            <li key={String(id)}>
              <span>
                {name}
                {kind === "link" ? " · link" : ""}
                {r.data_size != null ? ` · ${String(r.data_size)} B` : ""}
              </span>
              <Button
                disabled={busy || !Number.isFinite(id)}
                onClick={() => void download(id, name)}
              >
                {kind === "link" ? "Open" : "Download"}
              </Button>
              <Button
                variant="danger"
                disabled={busy || !Number.isFinite(id)}
                onClick={() => void remove(id)}
              >
                Delete
              </Button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected file reader result"));
        return;
      }
      resolve(result.includes(",") ? (result.split(",")[1] ?? "") : result);
    };
    reader.readAsDataURL(file);
  });
}

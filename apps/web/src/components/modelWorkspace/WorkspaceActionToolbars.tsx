import { Badge, Button } from "@epiton/ui";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { RecordActionsMenu } from "../RecordActionsMenu";
import { listActionAvailability, recordActionAvailability } from "./actionToolbar";
import type { WorkspaceListViewMode } from "./workspaceNavigation";

export function WorkspaceListActionToolbar(props: {
  clientAvailable: boolean;
  hasFocusedRecord: boolean;
  multiSelectedCount: number;
  visibleRowCount: number;
  inlineEditActive: boolean;
  treeEditable: boolean;
  onNew: () => void;
  onRefresh: () => void;
  onSelectView: (mode: WorkspaceListViewMode) => void;
  onToggleInlineEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onExportCsv: () => void;
  onImportCsv: (file: File) => void;
}) {
  const { t } = useTranslation();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const availability = listActionAvailability(props);

  return (
    <div className="epiton-toolbar">
      <Button variant="primary" onClick={props.onNew}>
        {t("workspace.new")}
      </Button>
      <Button onClick={props.onRefresh}>{t("workspace.refresh")}</Button>
      <Button onClick={() => props.onSelectView("tree")}>{t("workspace.tree")}</Button>
      <Button
        variant={props.inlineEditActive || props.treeEditable ? "primary" : "default"}
        onClick={props.onToggleInlineEdit}
      >
        {t("workspace.inlineEdit")}
        {props.treeEditable ? " · on" : ""}
      </Button>
      <Button onClick={() => props.onSelectView("list-form")}>{t("workspace.listForm")}</Button>
      <Button onClick={() => props.onSelectView("calendar")}>{t("workspace.calendar")}</Button>
      <Button onClick={() => props.onSelectView("graph")}>{t("workspace.graph")}</Button>
      <Button variant="danger" disabled={availability.deleteDisabled} onClick={props.onDelete}>
        {t("workspace.delete")}
        {props.multiSelectedCount > 1 ? ` (${props.multiSelectedCount})` : ""}
      </Button>
      <Button disabled={availability.copyDisabled} onClick={props.onCopy}>
        {t("workspace.copy")}
      </Button>
      <Button disabled={availability.exportDisabled} onClick={props.onExportCsv}>
        {t("workspace.exportCsv")}
      </Button>
      <Button
        disabled={availability.importDisabled}
        onClick={() => importInputRef.current?.click()}
      >
        {t("workspace.importCsv")}
      </Button>
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        aria-label="Import CSV file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) props.onImportCsv(file);
        }}
      />
    </div>
  );
}

export function WorkspaceRecordActionToolbar(props: {
  mode: "read" | "write";
  isDirty: boolean;
  onChangePending: boolean;
  clientAvailable: boolean;
  hasFocusedRecord: boolean;
  canSave: boolean;
  savePending: boolean;
  onToggleMode: () => void;
  onSave: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onToggleHistory: () => void;
  onEmail: () => void;
}) {
  const { t } = useTranslation();
  const availability = recordActionAvailability(props);

  return (
    <div className="epiton-toolbar">
      <Button disabled={availability.modeDisabled} onClick={props.onToggleMode}>
        {t("workspace.mode")}: {t(`workspace.${props.mode}`)}
      </Button>
      <Badge tone={props.mode === "write" ? "accent" : "muted"}>
        {t(`workspace.${props.mode}`)}
      </Badge>
      {props.isDirty ? <Badge tone="accent">{t("workspace.unsaved")}</Badge> : null}
      {props.onChangePending ? <Badge tone="muted">{t("workspace.updatingFields")}</Badge> : null}
      <Button variant="primary" disabled={availability.saveDisabled} onClick={props.onSave}>
        {t("workspace.save")}
      </Button>
      <Button variant="danger" disabled={availability.deleteDisabled} onClick={props.onDelete}>
        {t("workspace.delete")}
      </Button>
      <Button disabled={availability.copyDisabled} onClick={props.onCopy}>
        {t("workspace.copy")}
      </Button>
      <Button disabled={availability.historyDisabled} onClick={props.onToggleHistory}>
        {t("workspace.history")}
      </Button>
      <Button disabled={availability.emailDisabled} onClick={props.onEmail}>
        {t("workspace.email")}
      </Button>
    </div>
  );
}

export function WorkspaceKeywordActions(props: {
  model: string;
  recordId: number | null;
  onOpen?: (ref: string, source: string) => void;
}) {
  if (!props.onOpen) return null;
  return <RecordActionsMenu model={props.model} recordId={props.recordId} onOpen={props.onOpen} />;
}

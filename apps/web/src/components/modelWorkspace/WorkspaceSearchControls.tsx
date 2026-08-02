import type { ActWindowDomainTab, ViewSearchRow } from "@epiton/protocol";
import { Button, Tab, Tabs } from "@epiton/ui";
import { useTranslation } from "react-i18next";
import { SavedSearchDialog } from "../SavedSearchDialog";

export function WorkspaceDomainTabs(props: {
  tabs: ActWindowDomainTab[];
  activeIndex: number;
  counts?: Record<number, number>;
  onSelect: (index: number) => void;
}) {
  if (!props.tabs.length) return null;

  return (
    <Tabs aria-label="Action domains" className="epiton-domain-tabs">
      <Tab active={props.activeIndex < 0} onClick={() => props.onSelect(-1)}>
        All
      </Tab>
      {props.tabs.map((tab, index) => (
        <Tab
          key={`${tab.name}-${index}`}
          active={props.activeIndex === index}
          onClick={() => props.onSelect(index)}
        >
          {tab.name}
          {tab.count && props.counts?.[index] != null ? ` (${props.counts[index]})` : ""}
        </Tab>
      ))}
    </Tabs>
  );
}

export function WorkspaceSearchControls(props: {
  searchInput: string;
  savedSearches?: ViewSearchRow[];
  savedSearchDialog: "save" | "delete" | null;
  canSaveSearch: boolean;
  onSearchInputChange: (value: string) => void;
  onApplySearch: () => void;
  onClearSearch: () => void;
  onApplySavedSearch: (row: ViewSearchRow) => void;
  onOpenSavedSearchDialog: (mode: "save" | "delete") => void;
  onCancelSavedSearchDialog: () => void;
  onSaveSearch: (name: string) => void;
  onDeleteSearch: (id: number) => void;
}) {
  const { t } = useTranslation();
  const hasSavedSearches = Boolean(props.savedSearches?.length);

  return (
    <>
      <div className="epiton-toolbar">
        <input
          value={props.searchInput}
          onChange={(event) => props.onSearchInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") props.onApplySearch();
          }}
          placeholder="Search name/code, id, or JSON domain"
          aria-label="Domain search"
          style={{ flex: 1, minWidth: "12rem" }}
        />
        <Button onClick={props.onApplySearch}>{t("workspace.filter")}</Button>
        <Button onClick={props.onClearSearch}>{t("workspace.clear")}</Button>
        <select
          aria-label="Saved searches"
          value=""
          disabled={!hasSavedSearches}
          onChange={(event) => {
            const id = Number(event.target.value);
            const row = props.savedSearches?.find((candidate) => candidate.id === id);
            if (row) props.onApplySavedSearch(row);
          }}
        >
          <option value="">Saved searches…</option>
          {(props.savedSearches ?? []).map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
              {row.user == null ? " (shared)" : ""}
            </option>
          ))}
        </select>
        <Button
          disabled={!props.canSaveSearch}
          onClick={() => props.onOpenSavedSearchDialog("save")}
        >
          Save filter
        </Button>
        <Button
          variant="ghost"
          disabled={!hasSavedSearches}
          onClick={() => props.onOpenSavedSearchDialog("delete")}
        >
          Delete filter
        </Button>
      </div>
      <SavedSearchDialog
        mode={props.savedSearchDialog === "delete" ? "delete" : "save"}
        open={props.savedSearchDialog != null}
        rows={props.savedSearches}
        onCancel={props.onCancelSavedSearchDialog}
        onSave={props.onSaveSearch}
        onDelete={props.onDeleteSearch}
      />
    </>
  );
}

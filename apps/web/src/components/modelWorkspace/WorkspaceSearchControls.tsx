import type { ActWindowDomainTab, ViewSearchRow } from "@epiton/protocol";
import { Button, Tab, Tabs } from "@epiton/ui";
import type { ViewField } from "@epiton/view-engine";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SavedSearchDialog } from "../SavedSearchDialog";
import { builderFilterFromText, DomainFilterBuilder } from "./DomainFilterBuilder";

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
  fields: ViewField[];
  searchError?: string | null;
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
  const [mode, setMode] = useState<"quick" | "builder">("quick");
  const [builderValid, setBuilderValid] = useState(false);
  const [builderKey, setBuilderKey] = useState(0);
  const applyDisabled = mode === "builder" ? !builderValid : Boolean(props.searchError);

  function showBuilder() {
    const decoded = builderFilterFromText(props.searchInput);
    setBuilderValid(Boolean(decoded?.clauses.length));
    setBuilderKey((current) => current + 1);
    setMode("builder");
  }

  function selectSavedSearch(row: ViewSearchRow) {
    const text = typeof row.domain === "string" ? row.domain : JSON.stringify(row.domain ?? []);
    const decoded = builderFilterFromText(text);
    if (decoded?.clauses.length) {
      setMode("builder");
      setBuilderValid(true);
    } else {
      setMode("quick");
      setBuilderValid(false);
    }
    setBuilderKey((current) => current + 1);
    props.onApplySavedSearch(row);
  }

  return (
    <>
      <div className="epiton-search-controls">
        <div className="epiton-toolbar epiton-search-toolbar">
          {mode === "quick" ? (
            <input
              className="epiton-search-input"
              value={props.searchInput}
              onChange={(event) => props.onSearchInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !applyDisabled) props.onApplySearch();
              }}
              placeholder="Search name/code, id, or JSON domain"
              aria-label="Domain search"
              aria-invalid={Boolean(props.searchError)}
              aria-describedby={props.searchError ? "epiton-search-error" : undefined}
            />
          ) : (
            <Button variant="ghost" aria-expanded onClick={() => setMode("quick")}>
              Quick / JSON
            </Button>
          )}
          {mode === "quick" ? (
            <Button variant="ghost" aria-expanded={false} onClick={showBuilder}>
              Filter builder
            </Button>
          ) : null}
          <Button disabled={applyDisabled} onClick={props.onApplySearch}>
            {t("workspace.filter")}
          </Button>
          <Button
            onClick={() => {
              setBuilderValid(false);
              setBuilderKey((current) => current + 1);
              props.onClearSearch();
            }}
          >
            {t("workspace.clear")}
          </Button>
          <select
            aria-label="Saved searches"
            value=""
            disabled={!hasSavedSearches}
            onChange={(event) => {
              const id = Number(event.target.value);
              const row = props.savedSearches?.find((candidate) => candidate.id === id);
              if (row) selectSavedSearch(row);
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
        {mode === "builder" ? (
          <DomainFilterBuilder
            key={builderKey}
            fields={props.fields}
            initialText={props.searchInput}
            onChange={props.onSearchInputChange}
            onValidityChange={setBuilderValid}
          />
        ) : null}
        {mode === "quick" && props.searchError ? (
          <p id="epiton-search-error" className="epiton-filter-error" role="alert">
            {props.searchError}
          </p>
        ) : null}
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

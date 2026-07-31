export type ViewType =
  | "form"
  | "tree"
  | "list-form"
  | "board"
  | "calendar"
  | "graph"
  | "wizard"
  | "unknown";

export type FieldType =
  | "char"
  | "text"
  | "integer"
  | "float"
  | "numeric"
  | "boolean"
  | "date"
  | "datetime"
  | "many2one"
  | "one2many"
  | "many2many"
  | "selection"
  | "reference"
  | "binary"
  | "unknown";

export interface ViewField {
  name: string;
  string?: string;
  type: FieldType;
  readonly?: boolean;
  required?: boolean;
  relation?: string;
  selection?: Array<[string, string]>;
  help?: string;
  /** Static or PYSON-encoded domain from fields_view_get. */
  domain?: unknown;
  on_change?: string[];
  on_change_with?: string[];
}

export interface ViewNode {
  tag: string;
  attrs: Record<string, string>;
  children: ViewNode[];
  text?: string;
}

export interface ParsedView {
  type: ViewType;
  arch: ViewNode;
  fields: Record<string, ViewField>;
  buttons: Array<{ name: string; string?: string; confirm?: string }>;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([:@A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null = re.exec(raw);
  while (match) {
    const key = match[1] ?? "";
    const value = match[3] ?? match[4] ?? "";
    attrs[key] = decodeEntities(value);
    match = re.exec(raw);
  }
  return attrs;
}

/** Minimal XML parser for Tryton view arch (no eval, no scripts). */
export function parseXml(xml: string): ViewNode {
  const cleaned = xml.replace(/<\?xml[^?]*\?>/g, "").trim();
  const tokens = cleaned.split(/(<[^>]+>)/g).filter((t) => t.length > 0);
  const root: ViewNode = { tag: "#root", attrs: {}, children: [] };
  const stack: ViewNode[] = [root];

  for (const token of tokens) {
    if (token.startsWith("</")) {
      stack.pop();
      continue;
    }
    if (token.startsWith("<") && token.endsWith("/>")) {
      const inner = token.slice(1, -2).trim();
      const space = inner.search(/\s/);
      const tag = space === -1 ? inner : inner.slice(0, space);
      const attrs = space === -1 ? {} : parseAttrs(inner.slice(space));
      stack[stack.length - 1]?.children.push({ tag, attrs, children: [] });
      continue;
    }
    if (token.startsWith("<")) {
      const inner = token.slice(1, -1).trim();
      const space = inner.search(/\s/);
      const tag = space === -1 ? inner : inner.slice(0, space);
      const attrs = space === -1 ? {} : parseAttrs(inner.slice(space));
      const node: ViewNode = { tag, attrs, children: [] };
      stack[stack.length - 1]?.children.push(node);
      stack.push(node);
      continue;
    }
    const text = decodeEntities(token).trim();
    if (text) {
      const parent = stack[stack.length - 1];
      if (parent) parent.text = `${parent.text ?? ""}${text}`;
    }
  }

  const first = root.children[0];
  if (!first) {
    throw new Error("Empty view arch");
  }
  return first;
}

function mapFieldType(raw: unknown): FieldType {
  const t = String(raw ?? "unknown");
  const allowed: FieldType[] = [
    "char",
    "text",
    "integer",
    "float",
    "numeric",
    "boolean",
    "date",
    "datetime",
    "many2one",
    "one2many",
    "many2many",
    "selection",
    "reference",
    "binary",
  ];
  return (allowed.includes(t as FieldType) ? t : "unknown") as FieldType;
}

export function parseFieldsViewGet(payload: Record<string, unknown>): ParsedView {
  const archRaw = payload.arch ?? payload.arch_tree ?? payload.arch_form;
  if (typeof archRaw !== "string") {
    throw new Error("fields_view_get missing arch");
  }
  const arch = parseXml(archRaw);
  const typeAttr = (arch.attrs.type ?? arch.tag) as ViewType;
  const type: ViewType = [
    "form",
    "tree",
    "list-form",
    "board",
    "calendar",
    "graph",
    "wizard",
  ].includes(typeAttr)
    ? typeAttr
    : arch.tag === "tree"
      ? "tree"
      : arch.tag === "form"
        ? "form"
        : "unknown";

  const fields: Record<string, ViewField> = {};
  const fieldsPayload = (payload.fields ?? {}) as Record<string, Record<string, unknown>>;
  for (const [name, meta] of Object.entries(fieldsPayload)) {
    fields[name] = {
      name,
      string: typeof meta.string === "string" ? meta.string : name,
      type: mapFieldType(meta.type),
      readonly: Boolean(meta.readonly),
      required: Boolean(meta.required),
      relation: typeof meta.relation === "string" ? meta.relation : undefined,
      help: typeof meta.help === "string" ? meta.help : undefined,
      selection: Array.isArray(meta.selection)
        ? (meta.selection as Array<[string, string]>)
        : undefined,
      domain: meta.domain,
      on_change: Array.isArray(meta.on_change) ? meta.on_change.map(String) : undefined,
      on_change_with: Array.isArray(meta.on_change_with)
        ? meta.on_change_with.map(String)
        : undefined,
    };
  }

  const buttons: ParsedView["buttons"] = [];
  const walk = (node: ViewNode) => {
    if (node.tag === "button") {
      buttons.push({
        name: node.attrs.name ?? "",
        string: node.attrs.string,
        confirm: node.attrs.confirm,
      });
    }
    for (const child of node.children) walk(child);
  };
  walk(arch);

  return { type, arch, fields, buttons };
}

export function collectFieldNames(node: ViewNode): string[] {
  const names: string[] = [];
  const walk = (n: ViewNode) => {
    if ((n.tag === "field" || n.tag === "label") && n.attrs.name) {
      names.push(n.attrs.name);
    }
    for (const c of n.children) walk(c);
  };
  walk(node);
  return [...new Set(names)];
}

export function isRelationField(field: ViewField): boolean {
  return field.type === "many2one" || field.type === "one2many" || field.type === "many2many";
}

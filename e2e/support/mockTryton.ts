import type { Page, Route } from "@playwright/test";

type RpcRequest = {
  id: number | string | null;
  method: string;
  params: unknown[];
};

type SyntheticRecord = {
  id: number;
  rec_name: string;
  name: string;
  code: string;
  active: boolean;
  addresses: number[];
};

type SyntheticAddress = {
  id: number;
  rec_name: string;
  street: string;
  city: string;
};

const partyFields = {
  name: { name: "name", string: "Name", type: "char", required: true },
  code: { name: "code", string: "Code", type: "char" },
  active: { name: "active", string: "Active", type: "boolean" },
  addresses: {
    name: "addresses",
    string: "Addresses",
    type: "one2many",
    relation: "party.address",
    relation_field: "party",
  },
};

const partyTree = {
  arch: '<tree string="Parties"><field name="name"/><field name="code"/><field name="active"/></tree>',
  fields: partyFields,
};

const partyForm = {
  arch: '<form string="Party"><group string="Identity"><field name="name"/><field name="code"/><field name="active"/><field name="addresses"/></group></form>',
  fields: partyFields,
};

const addressFields = {
  street: { name: "street", string: "Street", type: "char", required: true },
  city: { name: "city", string: "City", type: "char" },
};

const addressTree = {
  arch: '<tree string="Addresses"><field name="street"/><field name="city"/></tree>',
  fields: addressFields,
};

const addressForm = {
  arch: '<form string="Address"><group><field name="street"/><field name="city"/></group></form>',
  fields: addressFields,
};

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

type PartyReadGate = {
  started: Deferred;
  released: Deferred;
  fulfilled: Deferred;
};

export type MockTrytonOptions = {
  /** Hold selected party reads until the test releases them explicitly. */
  holdPartyReadIds?: number[];
};

export type MockTryton = {
  calls: RpcRequest[];
  records: Map<number, SyntheticRecord>;
  addresses: Map<number, SyntheticAddress>;
  waitForPartyRead: (id: number) => Promise<void>;
  releasePartyRead: (id: number) => Promise<void>;
};

function deferred(): Deferred {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function idsFrom(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter(Number.isFinite);
}

function valuesFrom(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function domainIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  for (const clause of value) {
    if (!Array.isArray(clause)) continue;
    if (clause[0] === "id" && clause[1] === "in") return idsFrom(clause[2]);
    if (clause[0] === "id" && clause[1] === "=") {
      const id = Number(clause[2]);
      return Number.isFinite(id) ? [id] : [];
    }
    const nested = domainIds(clause);
    if (nested != null) return nested;
  }
  return null;
}

function projectRows<T extends { id: number }>(
  rows: T[],
  value: unknown,
): Record<string, unknown>[] {
  const fields = Array.isArray(value) ? value.map(String) : [];
  if (!fields.length) return rows.map((row) => ({ ...row }));
  return rows.map((row) => {
    const source = row as T & Record<string, unknown>;
    return Object.fromEntries(
      ["id", ...fields]
        .filter((field, index, all) => all.indexOf(field) === index && field in source)
        .map((field) => [field, source[field]]),
    );
  });
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

async function rpcRequest(route: Route): Promise<RpcRequest | null> {
  try {
    const value = route.request().postDataJSON() as Partial<RpcRequest>;
    if (typeof value.method !== "string" || !Array.isArray(value.params)) return null;
    return {
      id: value.id ?? null,
      method: value.method,
      params: value.params,
    };
  } catch {
    return null;
  }
}

/** Deterministic JSON-RPC boundary for browser tests. It contains synthetic data only. */
export async function installMockTryton(
  page: Page,
  options: MockTrytonOptions = {},
): Promise<MockTryton> {
  const records = new Map<number, SyntheticRecord>([
    [
      1,
      {
        id: 1,
        rec_name: "Synthetic Alpha",
        name: "Synthetic Alpha",
        code: "SYN-001",
        active: true,
        addresses: [10],
      },
    ],
    [
      2,
      {
        id: 2,
        rec_name: "Synthetic Beta",
        name: "Synthetic Beta",
        code: "SYN-002",
        active: true,
        addresses: [],
      },
    ],
  ]);
  const addresses = new Map<number, SyntheticAddress>([
    [
      10,
      {
        id: 10,
        rec_name: "Synthetic Road",
        street: "Synthetic Road",
        city: "Old City",
      },
    ],
  ]);
  const partyReadGates = new Map<number, PartyReadGate>(
    (options.holdPartyReadIds ?? []).map((id) => [
      id,
      { started: deferred(), released: deferred(), fulfilled: deferred() },
    ]),
  );
  const attachments: Array<Record<string, unknown>> = [];
  const calls: RpcRequest[] = [];
  let nextPartyId = 3;
  let nextAddressId = 50;
  let nextAttachmentId = 100;

  function applyAddressCommands(currentIds: number[], value: unknown): number[] {
    if (!Array.isArray(value)) return currentIds;
    const nextIds = [...currentIds];
    for (const command of value) {
      if (!Array.isArray(command) || typeof command[0] !== "string") continue;
      const operation = command[0];
      const commandIds = idsFrom(command[1]);
      if (operation === "create") {
        const values = valuesFrom(command[1]);
        const id = nextAddressId++;
        const street = text(values.street, `Synthetic street ${id}`);
        addresses.set(id, {
          id,
          rec_name: street,
          street,
          city: text(values.city),
        });
        nextIds.push(id);
      } else if (operation === "add") {
        for (const id of commandIds) if (!nextIds.includes(id)) nextIds.push(id);
      } else if (operation === "remove" || operation === "delete") {
        for (const id of commandIds) {
          const index = nextIds.indexOf(id);
          if (index >= 0) nextIds.splice(index, 1);
          if (operation === "delete") addresses.delete(id);
        }
      } else if (operation === "write") {
        const values = valuesFrom(command[2]);
        for (const id of commandIds) {
          const current = addresses.get(id);
          if (!current) continue;
          const street = text(values.street, current.street);
          addresses.set(id, {
            ...current,
            ...values,
            street,
            rec_name: street,
            city: text(values.city, current.city),
          });
        }
      }
    }
    return nextIds;
  }

  async function dispatch(request: RpcRequest): Promise<unknown> {
    const { method, params } = request;

    if (method === "common.server.version") return "7.0.0";
    if (method === "common.db.list") return ["epiton_lab"];
    if (method === "common.db.login") return [1, "synthetic-e2e-session"];
    if (method === "common.db.logout") return true;
    if (method === "model.res.user.get_preferences") {
      return { language: "en", context: { language: "en" }, groups: [] };
    }
    if (method === "model.ir.translation.search_read") return [];
    if (method === "model.ir.ui.menu.search_read") {
      return [
        {
          id: 1,
          name: "Parties",
          parent: null,
          action: "party.party",
          favorite: true,
        },
      ];
    }
    if (method === "model.ir.ui.view_search.search_read") return [];
    if (method === "model.ir.model.access.search_read") return [{ id: 1 }];
    if (method === "model.ir.action.keyword.get_keyword") return [];

    if (method === "model.party.party.fields_view_get") {
      return params[1] === "tree" ? partyTree : partyForm;
    }
    if (method === "model.party.party.search_read") return [...records.values()];
    if (method === "model.party.party.search_count") return records.size;
    if (method === "model.party.party.read") {
      const ids = idsFrom(params[0]);
      for (const id of ids) partyReadGates.get(id)?.started.resolve();
      await Promise.all(ids.map((id) => partyReadGates.get(id)?.released.promise));
      return ids.flatMap((id) => {
        const record = records.get(id);
        return record ? [record] : [];
      });
    }
    if (method === "model.party.party.default_get") return { active: true };
    if (method === "model.party.party.create") {
      const values = valuesFrom(Array.isArray(params[0]) ? params[0][0] : null);
      const id = nextPartyId++;
      const name = text(values.name, `Synthetic ${id}`);
      records.set(id, {
        id,
        rec_name: name,
        name,
        code: text(values.code),
        active: values.active !== false,
        addresses: [],
      });
      return [id];
    }
    if (method === "model.party.party.write") {
      const values = valuesFrom(params[1]);
      for (const id of idsFrom(params[0])) {
        const current = records.get(id);
        if (!current) continue;
        const nextName = text(values.name, current.name);
        const nextAddresses = applyAddressCommands(current.addresses, values.addresses);
        records.set(id, {
          ...current,
          ...values,
          name: nextName,
          rec_name: nextName,
          code: text(values.code, current.code),
          active: values.active == null ? current.active : Boolean(values.active),
          addresses: nextAddresses,
        });
      }
      return true;
    }
    if (method === "model.party.party.delete") {
      for (const id of idsFrom(params[0])) records.delete(id);
      return true;
    }
    if (method === "model.party.party.copy") {
      const created: number[] = [];
      for (const sourceId of idsFrom(params[0])) {
        const source = records.get(sourceId);
        if (!source) continue;
        const id = nextPartyId++;
        records.set(id, {
          ...source,
          id,
          name: `${source.name} copy`,
          rec_name: `${source.name} copy`,
          addresses: [...source.addresses],
        });
        created.push(id);
      }
      return created;
    }
    if (method === "model.party.party.export_data") {
      const ids = idsFrom(params[0]);
      const fields = Array.isArray(params[1]) ? params[1].map(String) : ["id", "rec_name"];
      const header = params[2] !== false;
      const rows = (ids.length ? ids : [...records.keys()]).flatMap((id) => {
        const record = records.get(id);
        if (!record) return [];
        return [fields.map((field) => record[field as keyof SyntheticRecord] ?? "")];
      });
      return header ? [fields, ...rows] : rows;
    }
    if (method === "model.party.party.export_data_domain") {
      const fields = Array.isArray(params[1]) ? params[1].map(String) : ["id", "rec_name"];
      return [
        fields,
        ...[...records.values()].map((record) =>
          fields.map((field) => record[field as keyof SyntheticRecord] ?? ""),
        ),
      ];
    }
    if (method === "model.party.party.import_data") {
      const fields = Array.isArray(params[0]) ? params[0].map(String) : [];
      const rows = Array.isArray(params[1]) ? params[1] : [];
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        const values = Object.fromEntries(fields.map((field, index) => [field, row[index]]));
        const id = nextPartyId++;
        const name = text(values.name, `Synthetic ${id}`);
        records.set(id, {
          id,
          rec_name: name,
          name,
          code: text(values.code),
          active: values.active !== false,
          addresses: [],
        });
      }
      return rows.length;
    }
    if (method === "model.party.party.on_change" || method === "model.party.party.on_change_with") {
      return {};
    }

    if (method === "model.party.address.fields_view_get") {
      return params[1] === "tree" ? addressTree : addressForm;
    }
    if (method === "model.party.address.search_read") {
      const requestedIds = domainIds(params[0]);
      const offset = Number(params[1]) || 0;
      const requestedLimit = params[2] == null ? addresses.size : Number(params[2]);
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : addresses.size;
      const rows = [...addresses.values()]
        .filter((row) => requestedIds == null || requestedIds.includes(row.id))
        .slice(offset, offset + limit);
      return projectRows(rows, params[4]);
    }
    if (method === "model.party.address.search_count") return addresses.size;
    if (method === "model.party.address.read") {
      return idsFrom(params[0]).flatMap((id) => {
        const record = addresses.get(id);
        return record ? [record] : [];
      });
    }
    if (method === "model.party.address.default_get") return {};
    if (
      method === "model.party.address.on_change" ||
      method === "model.party.address.on_change_with"
    ) {
      return {};
    }

    if (method === "model.ir.attachment.search_read") return attachments;
    if (method === "model.ir.attachment.create") {
      const values = valuesFrom(Array.isArray(params[0]) ? params[0][0] : null);
      attachments.push({ id: nextAttachmentId++, ...values });
      return [nextAttachmentId - 1];
    }
    if (method === "model.ir.attachment.delete") {
      const ids = new Set(idsFrom(params[0]));
      for (let index = attachments.length - 1; index >= 0; index -= 1) {
        if (ids.has(Number(attachments[index]?.id))) attachments.splice(index, 1);
      }
      return true;
    }

    if (method.endsWith(".search_read")) return [];
    if (method.endsWith(".search_count")) return 0;
    return true;
  }

  await page.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8080\//, async (route) => {
    const request = await rpcRequest(route);
    if (!request) {
      await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      return;
    }
    calls.push(request);
    const result = await dispatch(request);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: request.id, result }),
    });
    if (request.method === "model.party.party.read") {
      for (const id of idsFrom(request.params[0])) partyReadGates.get(id)?.fulfilled.resolve();
    }
  });

  return {
    calls,
    records,
    addresses,
    waitForPartyRead: async (id: number) => {
      const gate = partyReadGates.get(id);
      if (!gate) throw new Error(`Party read #${id} is not configured to be held`);
      await gate.started.promise;
    },
    releasePartyRead: async (id: number) => {
      const gate = partyReadGates.get(id);
      if (!gate) throw new Error(`Party read #${id} is not configured to be held`);
      gate.released.resolve();
      await gate.fulfilled.promise;
    },
  };
}

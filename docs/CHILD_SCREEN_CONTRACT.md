# Child Screen contract

Status: **L3.3 evidence-qualified**, 2026-08-01. The pure L3.1 contract remains
frozen, its L3.2 web integration is unchanged, and the relation boundary now
has deterministic Many2Many browser evidence plus a disposable Tryton 7 live
receipt. This document narrows the architecture
in [`THREE_LAYER_ARCHITECTURE.md`](THREE_LAYER_ARCHITECTURE.md); it does not
raise the compatibility claim beyond [`COMPATIBILITY.md`](COMPATIBILITY.md).

## Ownership boundary

```text
web relation host
  └─ owns RPC, metadata queries, debounce and presentation
       └─ ChildScreenState (pure @epiton/view-engine draft)
            └─ commit/remove returns a new parent RelationCommandQueue
                 └─ parent Screen save emits one model.create/model.write
                      └─ trytond validates and commits the transaction
```

A child Screen is an editable, process-local snapshot. It never calls RPC,
stores business data, or writes a related record independently. Accepting a
line produces a `create` or `write` command in the parent-owned relation queue;
removing a line produces `remove` or `delete`, according to server view policy.
The parent Screen remains the single mutation boundary.

The implementation is
[`packages/view-engine/src/childScreen.ts`](../packages/view-engine/src/childScreen.ts).
Its public symbols are exported only through `@epiton/view-engine`.

## Stable lifecycle

| Operation | Contract | Result |
|-----------|----------|--------|
| `createChildScreen` | Start `new`, persisted `record`, or `queued-create` target | New drafts are ready; persisted targets without a snapshot are not ready |
| `hydrateChildScreen` | Apply defaults/read data only to a pristine matching child | User edits win over a delayed snapshot |
| `updateChildScreenValues` | Replace the local values snapshot immutably | No parent or RPC side effect |
| `setChildScreenRelationQueue` | Attach a nested child queue immutably | Nested changes participate in dirty/validation/save projection |
| `beginChildScreenOnChange` | Increment a request revision and return an identity token | Host may start one async `on_change` request |
| `applyChildScreenOnChange` | Merge a patch only for the current generation, identity, and latest revision | Stale responses are ignored by reference |
| `validateChildScreen` | Check local required shape and prefix nested issues | Machine-readable field paths; no translated UI text |
| `commitChildScreen` | Validate and project values through `screenValuesForSave` | Returns a new parent queue plus one create/write command |
| `childScreenExitDecision` | Inspect unsaved values and nested queues | Clean exits are allowed; dirty exits require confirmation |
| `cancelChildScreen` | Restore baseline values/queues and bump generation | Pending async responses become stale |
| `removeChildScreen` | Remove/delete a persisted target or discard a queued create | Returns a new queue; a discarded create emits no server command |

Targets are explicit instead of being inferred from a temporary UI row id:

- `new` appends one `create` command;
- `record(id)` appends one `write` only while the id still belongs to the
  relation queue;
- `queued-create(commandIndex)` replaces that exact pending `create` and fails
  as stale if the queue changed underneath it.

Every operation returns new arrays and queue objects. The caller may retain the
old parent queue for React state comparison, cancellation, or race checks.

## Validation and server authority

Local validation is deliberately structural:

- required scalar and relation presence;
- recursive child issue paths such as `moves.location`;
- readiness and stale-target checks before command creation.

trytond remains authoritative for PYSON state, domains, access rules,
`pre_validate`, business constraints, workflows, and final create/write
validation. `RelationLineForm` calls the strict protocol `pre_validate` path
when the relation view requests it and does not accept the child when the
server rejects. React and `view-engine` do not reproduce those rules.

## `on_change` boundary

The child lifecycle freezes request identity and ordering, not transport. The
web host still obtains field metadata, builds the canonical Tryton arguments,
and calls the existing protocol helper. A response may update scalar values or
carry relation-shaped values, but only the newest applicable response may
publish.

The web host translates returned x2many replacement arrays and
add/update/remove/delete patches into the same nested queues before commit.
It also invalidates stale requests on Cancel/switch and accepts only the latest
applicable response. This receipt covers the wired line-form path; it does not
claim that every relation-heavy third-party module has completed live-series
or browser qualification.

## Relation serialization

One2Many and Many2Many use the same neutral command vocabulary:
`create`, `write`, `delete`, `add`, and `remove`. Many2Many serialization now
preserves nested record mutations while deriving membership add/remove from
the baseline and current id sets. A `delete` does not also emit a duplicate
`remove` for the same id.

The queue-to-wire mapping is deterministic and remains inside
`@epiton/view-engine`; React components must not construct raw command tuples.

## Evidence and completion receipt

Focused unit tests live in
[`packages/view-engine/src/childScreen.test.ts`](../packages/view-engine/src/childScreen.test.ts)
and cover create, persisted update, queued-create update, remove, delete/discard
semantics, readiness, required/nested validation, cancel/navigation, stale
`on_change`, immutability, and nested Many2Many serialization.

L3.2 completed all five host obligations:

1. `RelationLineForm` and `RelationLinesEditor` consume the frozen API without
   a second Screen implementation;
2. pending child `on_change` work is invalidated before Cancel/switch and
   flushed before accept;
3. x2many patches enter nested queues and server `pre_validate` is honored;
4. `PartyWorkspace` is a thin deprecated adapter over `ModelWorkspace`;
5. the deterministic `workspace.spec.ts` relation scenario proves queued child
   create + edit become exactly one parent `write`, after `pre_validate`, with
   no independent child `create` or `write`.

L3.3 then qualified that frozen implementation without changing its API:

1. a deterministic M2M browser scenario adds category `22`, removes category
   `20`, and emits exactly one `party.party.write` with
   `[["add", [22]], ["remove", [20]]]` and zero child category mutations;
2. the disposable Tryton 7 lab discovers `identifiers -> party.identifier`
   from live metadata, exercises transient child `on_change_with` for `type`
   and its `code` / `type_address` dependents, and obtains server acceptance
   from metadata-requested `pre_validate` with `id = -1`;
3. the resulting live compatibility protocol is 21/21.

These receipts qualify the stock Tryton 7 boundary and the deterministic mock
shape. They do not claim that every relation-heavy third-party module or every
supported series has completed equivalent deep qualification. The frozen
ownership contract remains unchanged.

The contract was independently translated from documented Tryton behavior. No
Sao or GTK source code is copied into Epitón.

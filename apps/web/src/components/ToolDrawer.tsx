import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

export function ToolDrawer(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  triggerLabel: string;
}) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Trigger asChild>
        <button type="button" className="epiton-drawer-trigger">
          {props.triggerLabel}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="epiton-drawer-overlay" />
        <Dialog.Content className="epiton-drawer-content" aria-describedby={undefined}>
          <Dialog.Title className="epiton-drawer-title">{props.title}</Dialog.Title>
          <div className="epiton-drawer-body">{props.children}</div>
          <Dialog.Close asChild>
            <button type="button" className="epiton-drawer-close">
              Close
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

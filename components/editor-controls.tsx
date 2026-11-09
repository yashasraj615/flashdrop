"use client"
import { Menu } from "@base-ui/react/menu"
import { Select } from "@base-ui/react/select"
import { Toolbar } from "@base-ui/react/toolbar"
import { Check, ChevronDown, type LucideIcon } from "lucide-react"
export type EditorAction = {
  label: string
  icon: LucideIcon
  action: () => void
  description?: string
  danger?: boolean
  disabled?: boolean
}
export function ActionMenu({
  label,
  icon: Icon,
  items,
  toolbar = false,
}: {
  label: string
  icon: LucideIcon
  items: EditorAction[]
  toolbar?: boolean
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="editor-menu-trigger"
        render={toolbar ? <Toolbar.Button /> : undefined}
      >
        <Icon size={16} aria-hidden />
        <span>{label}</span>
        <ChevronDown size={13} className="opacity-50" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          sideOffset={8}
          align="end"
          className="z-[100] outline-none"
        >
          <Menu.Popup
            className="editor-menu"

            aria-label={label}
          >
            <Menu.Group>
              <Menu.GroupLabel className="editor-menu-label">
                {label}
              </Menu.GroupLabel>
              {items.map(
                ({
                  label,
                  icon: ItemIcon,
                  action,
                  description,
                  danger,
                  disabled,
                }) => (
                  <Menu.Item
                    key={label}
                    onClick={action}
                    disabled={disabled}
                    className={`editor-menu-item ${danger ? "text-rose-300" : ""}`}
                  >
                    <span className="editor-menu-icon">
                      <ItemIcon size={17} aria-hidden />
                    </span>
                    <span>
                      <span className="block font-medium">{label}</span>
                      {description && (
                        <span className="mt-0.5 block text-xs text-white/40">
                          {description}
                        </span>
                      )}
                    </span>
                  </Menu.Item>
                )
              )}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
export function EditorSelect({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { label: string; value: string }[]
  disabled?: boolean
}) {
  return (
    <Select.Root
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v)
      }}
      items={options}
      disabled={disabled}
    >
      <Select.Trigger className="editor-select" aria-label={label}>
        <Select.Value />
        <Select.Icon>
          <ChevronDown size={15} aria-hidden />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          sideOffset={8}
          alignItemWithTrigger={false}
          className="z-[100]"
        >
          <Select.Popup className="editor-menu min-w-[var(--anchor-width)]">
            <Select.List>
              {options.map((o) => (
                <Select.Item
                  key={o.value}
                  value={o.value}
                  className="editor-select-item"
                >
                  <Select.ItemText>{o.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={15} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

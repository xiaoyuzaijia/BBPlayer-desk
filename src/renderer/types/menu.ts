// 菜单项通用类型（数据层）：参考 BBPlayer 的 TrackMenuItem { title, leadingIcon, onPress, danger }
// 菜单项自带回调，容器（MD3Menu）保持哑组件，父级无需写 switch 分发
export interface MenuItem {
  label: string
  /** Iconify 图标名，从 utils/icons.ts 的 Icons 取 */
  icon?: string
  /** 语义标志：容器染成 --md-error（对应 BBPlayer 的 danger） */
  danger?: boolean
  disabled?: boolean
  onSelect?: () => void
}

import { React } from '@revenge-mod/react'
import { instead } from '@revenge-mod/patcher'

type Message = Record<string, any>
type Props = Record<string, any>

const edited = new Map<string, string>()
const hidden = new Set<string>()

const MESSAGE_KEYS = ['message', 'msg', 'messageData', 'item'] as const
const TEXT_KEYS = ['content', 'messageContent', 'text'] as const

function getRevenge(): any {
  return (globalThis as any).revenge
}

function getMessageFromProps(props: Props | null | undefined): { key: string; message: Message } | null {
  if (!props || typeof props !== 'object') return null

  for (const key of MESSAGE_KEYS) {
    const value = props[key]
    if (isMessage(value)) return { key, message: value }
  }

  // Some Discord components pass the message object one level deeper.
  for (const value of Object.values(props)) {
    if (!value || typeof value !== 'object') continue
    if (isMessage(value)) return { key: '__direct__', message: value }
  }

  return null
}

function isMessage(value: any): value is Message {
  if (!value || typeof value !== 'object') return false
  if (typeof value.id !== 'string' && typeof value.id !== 'number') return false

  const looksLikeMessage =
    typeof value.content === 'string' ||
    Array.isArray(value.attachments) ||
    Array.isArray(value.embeds) ||
    value.author?.id != null ||
    value.channel_id != null

  return looksLikeMessage
}

function idOf(message: Message): string | null {
  return message?.id != null ? String(message.id) : null
}

function visibleContent(message: Message): string {
  const id = idOf(message)
  if (!id) return String(message.content ?? '')
  return edited.has(id) ? edited.get(id)! : String(message.content ?? '')
}

function cloneMessageWithLocalOverride(message: Message): Message {
  const id = idOf(message)
  if (!id || !edited.has(id)) return message

  return {
    ...message,
    content: edited.get(id),
  }
}

function componentName(type: any): string {
  if (typeof type === 'string') return type
  return String(type?.displayName || type?.name || '')
}

function closeAlert(): void {
  const revenge = getRevenge()
  const candidates = [
    revenge?.discord?.actions?.AlertActionCreators,
    revenge?.discord?.Actions?.AlertActionCreators,
    revenge?.discord?.common?.AlertActionCreators,
    revenge?.discord?.common?.Actions?.AlertActionCreators,
  ]

  for (const creator of candidates) {
    if (!creator) continue
    for (const name of ['closeAlert', 'hideAlert', 'dismissAlert', 'close']) {
      if (typeof creator[name] === 'function') {
        try {
          creator[name]()
          return
        } catch {}
      }
    }
  }
}

function openAlert(element: any): boolean {
  const revenge = getRevenge()
  const candidates = [
    revenge?.discord?.actions?.AlertActionCreators,
    revenge?.discord?.Actions?.AlertActionCreators,
    revenge?.discord?.common?.AlertActionCreators,
    revenge?.discord?.common?.Actions?.AlertActionCreators,
  ]

  for (const creator of candidates) {
    if (!creator) continue
    if (typeof creator.openAlert === 'function') {
      try {
        creator.openAlert('local-message-editor', element)
        return true
      } catch (error) {
        console.error('[LocalMessageEditor] openAlert failed', error)
      }
    }
  }

  console.warn('[LocalMessageEditor] AlertActionCreators.openAlert was not found.')
  return false
}

function ui(): { AlertModal: any; Button: any; TextInput: any; View: any; Text: any } {
  const revenge = getRevenge()
  const design = revenge?.discord?.design
  const rn = revenge?.react?.ReactNative

  return {
    AlertModal: design?.AlertModal,
    Button: design?.Button,
    TextInput: design?.TextInput || rn?.TextInput,
    View: rn?.View,
    Text: design?.Text || rn?.Text,
  }
}

function EditorModal(props: { message: Message }): any {
  const { AlertModal, Button, TextInput, View, Text } = ui()
  const [value, setValue] = React.useState(String(props.message.content ?? ''))

  const id = idOf(props.message)
  if (!id || !AlertModal || !Button || !TextInput || !View) {
    return null
  }

  const save = () => {
    edited.set(id, value)
    hidden.delete(id)
    closeAlert()
  }

  const del = () => {
    hidden.add(id)
    edited.delete(id)
    closeAlert()
  }

  const title = Text
    ? React.createElement(Text, { style: { marginBottom: 8 } }, 'ローカル編集')
    : null

  const input = React.createElement(TextInput, {
    value,
    onChangeText: (text: string) => setValue(text),
    multiline: true,
    autoFocus: true,
    placeholder: '表示するメッセージ内容',
    style: {
      minHeight: 120,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
  })

  const actions = React.createElement(
    View,
    {
      style: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
      },
    },
    React.createElement(Button, {
      text: '削除',
      variant: 'destructive',
      onPress: del,
      grow: true,
    }),
    React.createElement(Button, {
      text: 'キャンセル',
      variant: 'secondary',
      onPress: closeAlert,
      grow: true,
    }),
    React.createElement(Button, {
      text: '保存',
      variant: 'primary',
      onPress: save,
      grow: true,
    }),
  )

  return React.createElement(AlertModal, {
    title: 'ローカル編集',
    content: React.createElement(View, null, title, input, actions),
  })
}

function editMessage(message: Message): void {
  if (!idOf(message)) return
  openAlert(React.createElement(EditorModal, { message }))
}

function wrapLongPress(props: Props, message: Message): Props {
  if (typeof props.onLongPress !== 'function') return props
  if (props.__localMessageEditorWrapped) return props

  const original = props.onLongPress
  return {
    ...props,
    __localMessageEditorWrapped: true,
    onLongPress: (...args: any[]) => {
      editMessage(message)
      // Keep the normal Discord long-press behavior available only when
      // the local editor could not open.
      // The editor itself is intended to be the primary action.
      return undefined
    },
  }
}

function transformArgs(args: any[]): any[] | null {
  const [type, rawProps] = args
  if (!rawProps || typeof rawProps !== 'object') return args

  const props = rawProps as Props
  const found = getMessageFromProps(props)
  if (!found) return args

  const message = found.message
  const id = idOf(message)
  if (!id) return args

  const name = componentName(type)
  const messageComponent =
    /message|chat|thread/i.test(name) ||
    props.onLongPress != null ||
    props.message != null ||
    props.msg != null

  if (!messageComponent) return args

  if (hidden.has(id)) {
    return [type, { ...props, style: [{ display: 'none' }, props.style] }, args[2]]
  }

  const local = visibleContent(message)
  const patchedMessage = local !== String(message.content ?? '')
    ? cloneMessageWithLocalOverride(message)
    : message

  let nextProps: Props = props

  if (patchedMessage !== message && found.key !== '__direct__') {
    nextProps = { ...nextProps, [found.key]: patchedMessage }
  }

  nextProps = wrapLongPress(nextProps, patchedMessage)

  if (typeof nextProps.content === 'string' && edited.has(id)) {
    nextProps = { ...nextProps, content: local }
  }

  return [type, nextProps, args[2]]
}

let unpatchJsx: (() => void) | null = null

export default plugin({
  start() {
    const revenge = getRevenge()
    const runtime = revenge?.react?.ReactJSXRuntime

    if (!runtime?.jsx || !runtime?.jsxs) {
      console.warn('[LocalMessageEditor] ReactJSXRuntime was not available.')
      return
    }

    const handlers: Array<() => void> = []

    for (const method of ['jsx', 'jsxs'] as const) {
      handlers.push(
        instead(runtime, method, (args: any[], original: (...args: any[]) => any) => {
          const transformed = transformArgs(args)
          return original(...(transformed ?? args))
        }),
      )
    }

    unpatchJsx = () => {
      for (const unpatch of handlers.splice(0)) {
        try {
          unpatch()
        } catch {}
      }
    }

    console.log('[LocalMessageEditor] started — memory-only local overrides enabled')
  },

  stop() {
    unpatchJsx?.()
    unpatchJsx = null
    edited.clear()
    hidden.clear()
    closeAlert()
    console.log('[LocalMessageEditor] stopped — local overrides cleared')
  },
})

declare module '@monaco-editor/react' {
  import type { FC } from 'react'
  interface EditorProps {
    height?: number | string
    defaultLanguage?: string
    value?: string
    onChange?: (value?: string) => void
    options?: Record<string, any>
  }
  const Editor: FC<EditorProps>
  export default Editor
}



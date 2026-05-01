export interface CanvasNodeLayout {
  readonly nodeKey: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly zIndex: number
  readonly locked: boolean
  readonly collapsed: boolean
}

export interface CanvasViewportLayout {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

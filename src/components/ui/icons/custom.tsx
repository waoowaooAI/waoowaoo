import { forwardRef, type ForwardRefExoticComponent, type RefAttributes, type SVGProps } from 'react'
import { createLucideIcon as createLucideIconBase, type IconNode, type LucideProps } from 'lucide-react'

type CustomIconComponent = ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>

function createLucideIcon(name: string, iconNode: IconNode) {
  const keyedIconNode: IconNode = iconNode.map(([tag, attrs], index) => [
    tag,
    {
      ...attrs,
      key: `${name}-${index}`,
    },
  ])
  return createLucideIconBase(name, keyedIconNode)
}

const CustomIcon001Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M6 18L18 6M6 6l12 12", fill: "none", stroke: "currentColor" }],
]
const CustomIcon001Base = createLucideIcon('CustomIcon001', CustomIcon001Node)
export const CustomIcon001: CustomIconComponent = CustomIcon001Base

const CustomIcon002Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon002Base = createLucideIcon('CustomIcon002', CustomIcon002Node)
export const CustomIcon002: CustomIconComponent = CustomIcon002Base

const CustomIcon003Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16", fill: "none", stroke: "currentColor" }],
]
const CustomIcon003Base = createLucideIcon('CustomIcon003', CustomIcon003Node)
export const CustomIcon003: CustomIconComponent = CustomIcon003Base

const CustomIcon004Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M5 13l4 4L19 7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon004Base = createLucideIcon('CustomIcon004', CustomIcon004Node)
export const CustomIcon004: CustomIconComponent = CustomIcon004Base

const CustomIcon005Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15", fill: "none", stroke: "currentColor" }],
]
const CustomIcon005Base = createLucideIcon('CustomIcon005', CustomIcon005Node)
export const CustomIcon005: CustomIconComponent = CustomIcon005Base

const CustomIcon006Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 4v16m8-8H4", fill: "none", stroke: "currentColor" }],
]
const CustomIcon006Base = createLucideIcon('CustomIcon006', CustomIcon006Node)
export const CustomIcon006: CustomIconComponent = CustomIcon006Base

const CustomIcon007Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 9l-7 7-7-7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon007Base = createLucideIcon('CustomIcon007', CustomIcon007Node)
export const CustomIcon007: CustomIconComponent = CustomIcon007Base

const CustomIcon008Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon008Base = createLucideIcon('CustomIcon008', CustomIcon008Node)
export const CustomIcon008: CustomIconComponent = CustomIcon008Base

const CustomIcon009Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M13 10V3L4 14h7v7l9-11h-7z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon009Base = createLucideIcon('CustomIcon009', CustomIcon009Node)
export const CustomIcon009: CustomIconComponent = CustomIcon009Base

const CustomIcon010Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon010Base = createLucideIcon('CustomIcon010', CustomIcon010Node)
export const CustomIcon010: CustomIconComponent = CustomIcon010Base

const CustomIcon011Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6", fill: "none", stroke: "currentColor" }],
]
const CustomIcon011Base = createLucideIcon('CustomIcon011', CustomIcon011Node)
export const CustomIcon011: CustomIconComponent = CustomIcon011Base

const CustomIcon012Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.2", d: "M6 18L18 6M6 6l12 12", fill: "none", stroke: "currentColor" }],
]
const CustomIcon012Base = createLucideIcon('CustomIcon012', CustomIcon012Node)
export const CustomIcon012: CustomIconComponent = CustomIcon012Base

const CustomIcon013Node: IconNode = [
  ['path', { d: "M8 5v14l11-7z", fill: "currentColor" }],
]
const CustomIcon013Base = createLucideIcon('CustomIcon013', CustomIcon013Node)
export const CustomIcon013: CustomIconComponent = CustomIcon013Base

const CustomIcon014Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon014Base = createLucideIcon('CustomIcon014', CustomIcon014Node)
export const CustomIcon014: CustomIconComponent = CustomIcon014Base

const CustomIcon015Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 5l7 7-7 7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon015Base = createLucideIcon('CustomIcon015', CustomIcon015Node)
export const CustomIcon015: CustomIconComponent = CustomIcon015Base

const CustomIcon016Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon016Base = createLucideIcon('CustomIcon016', CustomIcon016Node)
export const CustomIcon016: CustomIconComponent = CustomIcon016Base

const CustomIcon017Node: IconNode = [
  ['rect', { x: "6", y: "5", width: "4", height: "14", rx: "1", fill: "currentColor" }],
  ['rect', { x: "14", y: "5", width: "4", height: "14", rx: "1", fill: "currentColor" }],
]
const CustomIcon017Base = createLucideIcon('CustomIcon017', CustomIcon017Node)
export const CustomIcon017: CustomIconComponent = CustomIcon017Base

const CustomIcon018Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", fill: "none", stroke: "currentColor" }],
]
const CustomIcon018Base = createLucideIcon('CustomIcon018', CustomIcon018Node)
export const CustomIcon018: CustomIconComponent = CustomIcon018Base

const CustomIcon019Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12", fill: "none", stroke: "currentColor" }],
]
const CustomIcon019Base = createLucideIcon('CustomIcon019', CustomIcon019Node)
export const CustomIcon019: CustomIconComponent = CustomIcon019Base

const CustomIcon020Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.8", d: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon020Base = createLucideIcon('CustomIcon020', CustomIcon020Node)
export const CustomIcon020: CustomIconComponent = CustomIcon020Base

const CustomIcon021Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.8", d: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon021Base = createLucideIcon('CustomIcon021', CustomIcon021Node)
export const CustomIcon021: CustomIconComponent = CustomIcon021Base

const CustomIcon022Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon022Base = createLucideIcon('CustomIcon022', CustomIcon022Node)
export const CustomIcon022: CustomIconComponent = CustomIcon022Base

const CustomIcon023Node: IconNode = [
  ['path', { fillRule: "evenodd", d: "M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z", clipRule: "evenodd", fill: "currentColor" }],
]
const CustomIcon023Base = createLucideIcon('CustomIcon023', CustomIcon023Node)
export const CustomIcon023: CustomIconComponent = forwardRef<SVGSVGElement, LucideProps>(function CustomIcon023(props, ref) {
  return <CustomIcon023Base ref={ref} {...props} viewBox="0 0 20 20" />
})

const CustomIcon024Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon024Base = createLucideIcon('CustomIcon024', CustomIcon024Node)
export const CustomIcon024: CustomIconComponent = CustomIcon024Base

const CustomIcon025Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "3", d: "M5 13l4 4L19 7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon025Base = createLucideIcon('CustomIcon025', CustomIcon025Node)
export const CustomIcon025: CustomIconComponent = CustomIcon025Base

const CustomIcon026Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 6v6m0 0v6m0-6h6m-6 0H6", fill: "none", stroke: "currentColor" }],
]
const CustomIcon026Base = createLucideIcon('CustomIcon026', CustomIcon026Node)
export const CustomIcon026: CustomIconComponent = CustomIcon026Base

const CustomIcon027Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon027Base = createLucideIcon('CustomIcon027', CustomIcon027Node)
export const CustomIcon027: CustomIconComponent = CustomIcon027Base

const CustomIcon028Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.2", d: "M5 13l4 4L19 7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon028Base = createLucideIcon('CustomIcon028', CustomIcon028Node)
export const CustomIcon028: CustomIconComponent = CustomIcon028Base

const CustomIcon029Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon029Base = createLucideIcon('CustomIcon029', CustomIcon029Node)
export const CustomIcon029: CustomIconComponent = CustomIcon029Base

const CustomIcon030Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon030Base = createLucideIcon('CustomIcon030', CustomIcon030Node)
export const CustomIcon030: CustomIconComponent = CustomIcon030Base

const CustomIcon031Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.3", d: "M5 13l4 4L19 7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon031Base = createLucideIcon('CustomIcon031', CustomIcon031Node)
export const CustomIcon031: CustomIconComponent = CustomIcon031Base

const CustomIcon032Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M4 6h16M4 12h16m-7 6h7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon032Base = createLucideIcon('CustomIcon032', CustomIcon032Node)
export const CustomIcon032: CustomIconComponent = CustomIcon032Base

const CustomIcon033Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z", fill: "none", stroke: "currentColor" }],
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon033Base = createLucideIcon('CustomIcon033', CustomIcon033Node)
export const CustomIcon033: CustomIconComponent = CustomIcon033Base

const CustomIcon034Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21", fill: "none", stroke: "currentColor" }],
]
const CustomIcon034Base = createLucideIcon('CustomIcon034', CustomIcon034Node)
export const CustomIcon034: CustomIconComponent = CustomIcon034Base

const CustomIcon035Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.4", d: "M5 13l4 4L19 7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon035Base = createLucideIcon('CustomIcon035', CustomIcon035Node)
export const CustomIcon035: CustomIconComponent = CustomIcon035Base

const CustomIcon036Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253", fill: "none", stroke: "currentColor" }],
]
const CustomIcon036Base = createLucideIcon('CustomIcon036', CustomIcon036Node)
export const CustomIcon036: CustomIconComponent = CustomIcon036Base

const CustomIcon037Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M15 19l-7-7 7-7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon037Base = createLucideIcon('CustomIcon037', CustomIcon037Node)
export const CustomIcon037: CustomIconComponent = CustomIcon037Base

const CustomIcon038Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.7", d: "M4 8l8-4 8 4-8 4-8-4z", fill: "none", stroke: "currentColor" }],
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.7", d: "M4 8v8l8 4 8-4V8", fill: "none", stroke: "currentColor" }],
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.7", d: "M12 12v8", fill: "none", stroke: "currentColor" }],
]
const CustomIcon038Base = createLucideIcon('CustomIcon038', CustomIcon038Node)
export const CustomIcon038: CustomIconComponent = CustomIcon038Base

const CustomIcon039Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon039Base = createLucideIcon('CustomIcon039', CustomIcon039Node)
export const CustomIcon039: CustomIconComponent = CustomIcon039Base

const CustomIcon040Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon040Base = createLucideIcon('CustomIcon040', CustomIcon040Node)
export const CustomIcon040: CustomIconComponent = CustomIcon040Base

const CustomIcon041Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon041Base = createLucideIcon('CustomIcon041', CustomIcon041Node)
export const CustomIcon041: CustomIconComponent = CustomIcon041Base

const CustomIcon042Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.5", d: "M5 13l4 4L19 7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon042Base = createLucideIcon('CustomIcon042', CustomIcon042Node)
export const CustomIcon042: CustomIconComponent = CustomIcon042Base

const CustomIcon043Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon043Base = createLucideIcon('CustomIcon043', CustomIcon043Node)
export const CustomIcon043: CustomIconComponent = CustomIcon043Base

const CustomIcon044Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon044Base = createLucideIcon('CustomIcon044', CustomIcon044Node)
export const CustomIcon044: CustomIconComponent = CustomIcon044Base

const CustomIcon045Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 1v11m0 0a4 4 0 004-4V5a4 4 0 00-8 0v3a4 4 0 004 4zm-7 3a7 7 0 0014 0M9 21h6", fill: "none", stroke: "currentColor" }],
]
const CustomIcon045Base = createLucideIcon('CustomIcon045', CustomIcon045Node)
export const CustomIcon045: CustomIconComponent = CustomIcon045Base

const CustomIcon046Node: IconNode = [
  ['circle', { cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4", fill: "none" }],
  ['path', { fill: "currentColor", d: "M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" }],
]
const CustomIcon046Base = createLucideIcon('CustomIcon046', CustomIcon046Node)
export const CustomIcon046: CustomIconComponent = CustomIcon046Base

const CustomIcon047Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 5v10l8 4V1L9 5zM5 9v6M3 10v4", fill: "none", stroke: "currentColor" }],
]
const CustomIcon047Base = createLucideIcon('CustomIcon047', CustomIcon047Node)
export const CustomIcon047: CustomIconComponent = CustomIcon047Base

const CustomIcon048Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 12h6M9 16h6M8 7h8a2 2 0 012 2v10l-3-2-3 2-3-2-3 2V9a2 2 0 012-2z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon048Base = createLucideIcon('CustomIcon048', CustomIcon048Node)
export const CustomIcon048: CustomIconComponent = CustomIcon048Base

const CustomIcon049Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z", fill: "none", stroke: "currentColor" }],
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon049Base = createLucideIcon('CustomIcon049', CustomIcon049Node)
export const CustomIcon049: CustomIconComponent = CustomIcon049Base

const CustomIcon050Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-4-4m4 4l4-4M19.07 4.93a10 10 0 010 14.14M5 12a7 7 0 0114 0", fill: "none", stroke: "currentColor" }],
]
const CustomIcon050Base = createLucideIcon('CustomIcon050', CustomIcon050Node)
export const CustomIcon050: CustomIconComponent = CustomIcon050Base

const CustomIcon051Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14", fill: "none", stroke: "currentColor" }],
]
const CustomIcon051Base = createLucideIcon('CustomIcon051', CustomIcon051Node)
export const CustomIcon051: CustomIconComponent = CustomIcon051Base

const CustomIcon052Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z", fill: "none", stroke: "currentColor" }],
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon052Base = createLucideIcon('CustomIcon052', CustomIcon052Node)
export const CustomIcon052: CustomIconComponent = CustomIcon052Base

const CustomIcon053Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon053Base = createLucideIcon('CustomIcon053', CustomIcon053Node)
export const CustomIcon053: CustomIconComponent = CustomIcon053Base

const CustomIcon054Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1", fill: "none", stroke: "currentColor" }],
]
const CustomIcon054Base = createLucideIcon('CustomIcon054', CustomIcon054Node)
export const CustomIcon054: CustomIconComponent = CustomIcon054Base

const CustomIcon055Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon055Base = createLucideIcon('CustomIcon055', CustomIcon055Node)
export const CustomIcon055: CustomIconComponent = CustomIcon055Base

const CustomIcon056Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M20 12H4", fill: "none", stroke: "currentColor" }],
]
const CustomIcon056Base = createLucideIcon('CustomIcon056', CustomIcon056Node)
export const CustomIcon056: CustomIconComponent = CustomIcon056Base

const CustomIcon057Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon057Base = createLucideIcon('CustomIcon057', CustomIcon057Node)
export const CustomIcon057: CustomIconComponent = CustomIcon057Base

const CustomIcon058Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M3 5h18v14H3zM9 19h6", fill: "none", stroke: "currentColor" }],
]
const CustomIcon058Base = createLucideIcon('CustomIcon058', CustomIcon058Node)
export const CustomIcon058: CustomIconComponent = CustomIcon058Base

const CustomIcon059Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 3a9 9 0 100 18h1a3 3 0 000-6h-1a3 3 0 010-6h1a3 3 0 100-6h-1z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon059Base = createLucideIcon('CustomIcon059', CustomIcon059Node)
export const CustomIcon059: CustomIconComponent = CustomIcon059Base

const CustomIcon060Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M13 7l5 5m0 0l-5 5m5-5H6", fill: "none", stroke: "currentColor" }],
]
const CustomIcon060Base = createLucideIcon('CustomIcon060', CustomIcon060Node)
export const CustomIcon060: CustomIconComponent = CustomIcon060Base

const CustomIcon061Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.7", d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z", fill: "none", stroke: "currentColor" }],
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.7", d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon061Base = createLucideIcon('CustomIcon061', CustomIcon061Node)
export const CustomIcon061: CustomIconComponent = CustomIcon061Base

const CustomIcon062Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 3l8 7-8 11L4 10l8-7z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon062Base = createLucideIcon('CustomIcon062', CustomIcon062Node)
export const CustomIcon062: CustomIconComponent = CustomIcon062Base

const CustomIcon063Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon063Base = createLucideIcon('CustomIcon063', CustomIcon063Node)
export const CustomIcon063: CustomIconComponent = CustomIcon063Base

const CustomIcon064Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M3 20h18M7 20l4-7 2 3 3-5 5 9H7z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon064Base = createLucideIcon('CustomIcon064', CustomIcon064Node)
export const CustomIcon064: CustomIconComponent = CustomIcon064Base

const CustomIcon065Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon065Base = createLucideIcon('CustomIcon065', CustomIcon065Node)
export const CustomIcon065: CustomIconComponent = CustomIcon065Base

const CustomIcon066Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", fill: "none", stroke: "currentColor" }],
]
const CustomIcon066Base = createLucideIcon('CustomIcon066', CustomIcon066Node)
export const CustomIcon066: CustomIconComponent = CustomIcon066Base

const CustomIcon067Node: IconNode = [
  ['path', { fillRule: "evenodd", d: "M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z", clipRule: "evenodd", fill: "currentColor" }],
]
const CustomIcon067Base = createLucideIcon('CustomIcon067', CustomIcon067Node)
export const CustomIcon067: CustomIconComponent = forwardRef<SVGSVGElement, LucideProps>(function CustomIcon067(props, ref) {
  return <CustomIcon067Base ref={ref} {...props} viewBox="0 0 20 20" />
})

const CustomIcon068Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.8", d: "M7 3h7l5 5v13a1 1 0 01-1 1H7a2 2 0 01-2-2V5a2 2 0 012-2z", fill: "none", stroke: "currentColor" }],
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.8", d: "M14 3v5h5M9 12h6M9 16h6", fill: "none", stroke: "currentColor" }],
]
const CustomIcon068Base = createLucideIcon('CustomIcon068', CustomIcon068Node)
export const CustomIcon068: CustomIconComponent = CustomIcon068Base

const CustomIcon069Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon069Base = createLucideIcon('CustomIcon069', CustomIcon069Node)
export const CustomIcon069: CustomIconComponent = CustomIcon069Base

const CustomIcon070Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z", fill: "none", stroke: "currentColor" }],
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2", fill: "none", stroke: "currentColor" }],
]
const CustomIcon070Base = createLucideIcon('CustomIcon070', CustomIcon070Node)
export const CustomIcon070: CustomIconComponent = CustomIcon070Base

const CustomIcon071Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M14 5l7 7m0 0l-7 7m7-7H3", fill: "none", stroke: "currentColor" }],
]
const CustomIcon071Base = createLucideIcon('CustomIcon071', CustomIcon071Node)
export const CustomIcon071: CustomIconComponent = CustomIcon071Base

const CustomIcon072Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 17v-6m3 6V7m3 10v-3M5 20h14a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v14a1 1 0 001 1z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon072Base = createLucideIcon('CustomIcon072', CustomIcon072Node)
export const CustomIcon072: CustomIconComponent = CustomIcon072Base

const CustomIcon073Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5", d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon073Base = createLucideIcon('CustomIcon073', CustomIcon073Node)
export const CustomIcon073: CustomIconComponent = CustomIcon073Base

const CustomIcon074Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.4", d: "M6 18L18 6M6 6l12 12", fill: "none", stroke: "currentColor" }],
]
const CustomIcon074Base = createLucideIcon('CustomIcon074', CustomIcon074Node)
export const CustomIcon074: CustomIconComponent = CustomIcon074Base

const CustomIcon075Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.8", d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M4 18h9a2 2 0 002-2V8a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon075Base = createLucideIcon('CustomIcon075', CustomIcon075Node)
export const CustomIcon075: CustomIconComponent = CustomIcon075Base

const CustomIcon076Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.2", d: "M9 5l7 7-7 7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon076Base = createLucideIcon('CustomIcon076', CustomIcon076Node)
export const CustomIcon076: CustomIconComponent = CustomIcon076Base

const CustomIcon077Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.2", d: "M12 4v16m8-8H4", fill: "none", stroke: "currentColor" }],
]
const CustomIcon077Base = createLucideIcon('CustomIcon077', CustomIcon077Node)
export const CustomIcon077: CustomIconComponent = CustomIcon077Base

const CustomIcon078Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2.1", d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16", fill: "none", stroke: "currentColor" }],
]
const CustomIcon078Base = createLucideIcon('CustomIcon078', CustomIcon078Node)
export const CustomIcon078: CustomIconComponent = CustomIcon078Base

const CustomIcon079Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M5 15l7-7 7 7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon079Base = createLucideIcon('CustomIcon079', CustomIcon079Node)
export const CustomIcon079: CustomIconComponent = CustomIcon079Base

const CustomIcon080Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M14.121 14.121L4.5 4.5m9.621 9.621l2.379 2.379m-2.379-2.379L21 7.242M6.75 6.75l-.75-.75M6 18l4.5-4.5m0 0L18 21", fill: "none", stroke: "currentColor" }],
]
const CustomIcon080Base = createLucideIcon('CustomIcon080', CustomIcon080Node)
export const CustomIcon080: CustomIconComponent = CustomIcon080Base

const CustomIcon081Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z", fill: "none", stroke: "currentColor" }],
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M21 12a9 9 0 11-18 0 9 9 0 0118 0z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon081Base = createLucideIcon('CustomIcon081', CustomIcon081Node)
export const CustomIcon081: CustomIconComponent = CustomIcon081Base

const CustomIcon082Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4", fill: "none", stroke: "currentColor" }],
]
const CustomIcon082Base = createLucideIcon('CustomIcon082', CustomIcon082Node)
export const CustomIcon082: CustomIconComponent = CustomIcon082Base

const CustomIcon083Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12", fill: "none", stroke: "currentColor" }],
]
const CustomIcon083Base = createLucideIcon('CustomIcon083', CustomIcon083Node)
export const CustomIcon083: CustomIconComponent = CustomIcon083Base

const CustomIcon084Node: IconNode = [
  ['path', { d: "M8 6h3v12H8zM13 6h3v12h-3z", fill: "currentColor" }],
]
const CustomIcon084Base = createLucideIcon('CustomIcon084', CustomIcon084Node)
export const CustomIcon084: CustomIconComponent = CustomIcon084Base

const CustomIcon085Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4", fill: "none", stroke: "currentColor" }],
]
const CustomIcon085Base = createLucideIcon('CustomIcon085', CustomIcon085Node)
export const CustomIcon085: CustomIconComponent = CustomIcon085Base

const CustomIcon086Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon086Base = createLucideIcon('CustomIcon086', CustomIcon086Node)
export const CustomIcon086: CustomIconComponent = CustomIcon086Base

const CustomIcon087Node: IconNode = [
  ['path', { stroke: "url(#icon-gradient)", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", fill: "none" }],
]
const CustomIcon087Base = createLucideIcon('CustomIcon087', CustomIcon087Node)
export const CustomIcon087: CustomIconComponent = CustomIcon087Base

const CustomIcon088Node: IconNode = [
  ['path', { stroke: "url(#icon-gradient)", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", fill: "none" }],
]
const CustomIcon088Base = createLucideIcon('CustomIcon088', CustomIcon088Node)
export const CustomIcon088: CustomIconComponent = CustomIcon088Base

const CustomIcon089Node: IconNode = [
  ['path', { stroke: "url(#icon-gradient)", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z", fill: "none" }],
]
const CustomIcon089Base = createLucideIcon('CustomIcon089', CustomIcon089Node)
export const CustomIcon089: CustomIconComponent = CustomIcon089Base

const CustomIcon090Node: IconNode = [
  ['path', { stroke: "url(#icon-gradient)", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z", fill: "none" }],
]
const CustomIcon090Base = createLucideIcon('CustomIcon090', CustomIcon090Node)
export const CustomIcon090: CustomIconComponent = CustomIcon090Base

const CustomIcon091Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon091Base = createLucideIcon('CustomIcon091', CustomIcon091Node)
export const CustomIcon091: CustomIconComponent = CustomIcon091Base

const CustomIcon092Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon092Base = createLucideIcon('CustomIcon092', CustomIcon092Node)
export const CustomIcon092: CustomIconComponent = CustomIcon092Base

const CustomIcon093Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon093Base = createLucideIcon('CustomIcon093', CustomIcon093Node)
export const CustomIcon093: CustomIconComponent = CustomIcon093Base

const CustomIcon094Node: IconNode = [
  ['path', { fillRule: "evenodd", d: "M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z", clipRule: "evenodd", fill: "currentColor" }],
]
const CustomIcon094Base = createLucideIcon('CustomIcon094', CustomIcon094Node)
export const CustomIcon094: CustomIconComponent = CustomIcon094Base

const CustomIcon095Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7", fill: "none", stroke: "currentColor" }],
]
const CustomIcon095Base = createLucideIcon('CustomIcon095', CustomIcon095Node)
export const CustomIcon095: CustomIconComponent = CustomIcon095Base

const CustomIcon096Node: IconNode = [
  ['path', { stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 9v4m0 4h.01M5.5 19h13a1 1 0 00.87-1.5l-6.5-11.5a1 1 0 00-1.74 0L4.63 17.5A1 1 0 005.5 19z", fill: "none" }],
]
const CustomIcon096Base = createLucideIcon('CustomIcon096', CustomIcon096Node)
export const CustomIcon096: CustomIconComponent = CustomIcon096Base

const CustomIcon097Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M12 9v4m0 4h.01M10.29 3.86l-8.18 14.4A1 1 0 003 20h18a1 1 0 00.89-1.74l-8.18-14.4a1 1 0 00-1.74 0z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon097Base = createLucideIcon('CustomIcon097', CustomIcon097Node)
export const CustomIcon097: CustomIconComponent = CustomIcon097Base

const CustomIcon098Node: IconNode = [
  ['path', { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "2", d: "M13 16h-1v-4h-1m1-4h.01M12 3a9 9 0 100 18 9 9 0 000-18z", fill: "none", stroke: "currentColor" }],
]
const CustomIcon098Base = createLucideIcon('CustomIcon098', CustomIcon098Node)
export const CustomIcon098: CustomIconComponent = CustomIcon098Base

export const IconGradientDefs = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(function IconGradientDefs(props, ref) {
  return (
    <svg ref={ref} {...props}>
      <defs>
                                <linearGradient id="icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#3b82f6" />
                                  <stop offset="100%" stopColor="#06b6d4" />
                                </linearGradient>
                              </defs>
    </svg>
  )
})

export const customIcons = {
  close: CustomIcon001,
  edit: CustomIcon002,
  trash: CustomIcon003,
  check: CustomIcon004,
  refresh: CustomIcon005,
  plus: CustomIcon006,
  chevronDown: CustomIcon007,
  mic: CustomIcon008,
  bolt: CustomIcon009,
  image: CustomIcon010,
  sparkles: CustomIcon011,
  closeSm: CustomIcon012,
  play: CustomIcon013,
  sparklesAlt: CustomIcon014,
  chevronRight: CustomIcon015,
  alert: CustomIcon016,
  pause: CustomIcon017,
  folderCards: CustomIcon018,
  upload: CustomIcon019,
  imageAlt: CustomIcon020,
  user: CustomIcon021,
  copy: CustomIcon022,
  checkSolid: CustomIcon023,
  video: CustomIcon024,
  checkSm: CustomIcon025,
  plusAlt: CustomIcon026,
  editSquare: CustomIcon027,
  checkTiny: CustomIcon028,
  info: CustomIcon029,
  searchPlus: CustomIcon030,
  checkXs: CustomIcon031,
  menu: CustomIcon032,
  eye: CustomIcon033,
  eyeOff: CustomIcon034,
  checkDot: CustomIcon035,
  bookOpen: CustomIcon036,
  chevronLeft: CustomIcon037,
  package: CustomIcon038,
  idea: CustomIcon039,
  userAlt: CustomIcon040,
  globe2: CustomIcon041,
  checkMicro: CustomIcon042,
  imagePreview: CustomIcon043,
  fileText: CustomIcon044,
  micOutline: CustomIcon045,
  loader: CustomIcon046,
  cube: CustomIcon047,
  bookmark: CustomIcon048,
  settingsHex: CustomIcon049,
  audioWave: CustomIcon050,
  externalLink: CustomIcon051,
  settingsHexAlt: CustomIcon052,
  receipt: CustomIcon053,
  logout: CustomIcon054,
  filter: CustomIcon055,
  minus: CustomIcon056,
  file: CustomIcon057,
  monitor: CustomIcon058,
  coins: CustomIcon059,
  arrowRight: CustomIcon060,
  settingsHexMinor: CustomIcon061,
  diamond: CustomIcon062,
  ideaAlt: CustomIcon063,
  imageLandscape: CustomIcon064,
  lock: CustomIcon065,
  imageEdit: CustomIcon066,
  closeSolid: CustomIcon067,
  fileFold: CustomIcon068,
  userCircle: CustomIcon069,
  volumeOff: CustomIcon070,
  arrowRightWide: CustomIcon071,
  chart: CustomIcon072,
  videoAlt: CustomIcon073,
  closeMd: CustomIcon074,
  videoWide: CustomIcon075,
  chevronRightMd: CustomIcon076,
  plusMd: CustomIcon077,
  trashAlt: CustomIcon078,
  chevronUp: CustomIcon079,
  wandOff: CustomIcon080,
  playCircle: CustomIcon081,
  clipboardCheck: CustomIcon082,
  cloudUpload: CustomIcon083,
  pauseSolid: CustomIcon084,
  download: CustomIcon085,
  folder: CustomIcon086,
  statsBarGradient: CustomIcon087,
  statsEpisodeGradient: CustomIcon088,
  statsImageGradient: CustomIcon089,
  statsVideoGradient: CustomIcon090,
  statsBar: CustomIcon091,
  clock: CustomIcon092,
  search: CustomIcon093,
  badgeCheck: CustomIcon094,
  searchAdd: CustomIcon095,
  alertSolid: CustomIcon096,
  alertOutline: CustomIcon097,
  infoCircle: CustomIcon098,
} as const

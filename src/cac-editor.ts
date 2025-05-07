import { Group } from 'konva-es/lib/Group'
import { Layer } from 'konva-es/lib/Layer'
import { Shape } from 'konva-es/lib/Shape'
import { Circle } from 'konva-es/lib/shapes/Circle'
import { Line, LineConfig } from 'konva-es/lib/shapes/Line'
import { Path } from 'konva-es/lib/shapes/Path'
import { Rect } from 'konva-es/lib/shapes/Rect'
import { Text } from 'konva-es/lib/shapes/Text'
import { Transformer } from 'konva-es/lib/shapes/Transformer'
import { Stage, StageConfig, stages } from 'konva-es/lib/Stage'
import { Vector2d } from 'konva-es/lib/types'

export const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

export type PIDIconType =
    | 'valve'
    | 'pump'
    | 'compressor'
    | 'heat-exchanger'
    | 'separator'
    | 'tank'
    | 'pipe'
    | 'fitting'
    | 'instrument'
    | 'control-valve'

export interface IPidAnchor {
    type: 'in' | 'out' | 'in-out'
    x: number
    y: number
}

/**
 * Defines the structure of a PID shape we can save.
 */
export interface IDtoPidShape {
    s: IPidShape
    x: number
    y: number
    /**
     * Unique id of a shape
     */
    id: number
    /**
     * Connections
     * We store the connections on the shape which ends the connection
     */
    c: {
        l: number[] // the array of points that make the line
        /**
         * Start Anchor Index
         */
        sai: number
        /**
         * The id of the IDtoPidShape which starts the connection
         */
        sid: number
        /**
         * End Anchor Index
         */
        eai: number
    }[]
}

/**
 * Defines the structure of a PID shape.
 * It's readonly.
 */
export interface IPidShape {
    name: string
    path: string
    height: number
    width: number
    type: PIDIconType
    anchors: IPidAnchor[]
}

export interface IPidIconSet {
    dataset?: string
    description?: string
    author?: string
    license?: string
    version?: string
    data: IPidShape[]
}

export interface CacEditorConfig extends StageConfig {}

/**
 * Represents a connection of a PID shape.
 * It's used internally to handle drag and drop of PID shapes and their connections.
 */
interface IConnector {
    line: Line
    anchorIndex: number
    type: 'start' | 'end'
}

const PID_DATASET_URL = 'https://raw.githubusercontent.com/tbo47/open-pid-icons/refs/heads/main/open-pid-icons.json'

/**
 * Fetches the PID icons from https://github.com/tbo47/open-pid-icons
 */
export const fetchPidIconSet = async (url = PID_DATASET_URL) => {
    const response = await fetch(url)
    const pidIconSet = (await response.json()) as IPidIconSet
    pidIconSet.data.forEach((item: IPidShape) => {
        item.anchors = item.anchors || []
        item.path = item.path || ''
        item.type = item.type || 'valve'
        item.name = item.name || 'Unnamed'
    })
    return pidIconSet
}

export const P = {
    anchor: {
        color: 'lightgray',
        radius: isTouchDevice ? 20 : 5,
        radiusOver: isTouchDevice ? 40 : 9,
    },
    shapePathParams: {
        stroke: 'black',
        strokeWidth: 1.4,
        strokeLineCap: 'round',
    },
    textParams: {
        fontSize: 12,
        fill: 'black',
        x: 0,
        y: -24,
    },
    lineParams: {
        stroke: 'black',
        strokeWidth: 1.4,
        lineCap: 'round',
        lineJoin: 'round',
    } as LineConfig,
}

/**
 * CacEditor is a class that creates a canvas editor for PID icons.
 * It initializes a Konva stage and allows the user to drag and drop PID icons onto the canvas.
 * The icons can be resized and moved around the canvas.
 */
export class CacEditor {
    private stage: Stage
    private layer: Layer
    private tr: Transformer

    constructor(config: CacEditorConfig) {
        this.stage = new Stage(config)
        this.layer = new Layer()
        this.stage.add(this.layer)
        this.tr = new Transformer({
            keepRatio: true,
            enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
            boundBoxFunc: (oldBox, newBox) => {
                const ratio = oldBox.width / oldBox.height
                newBox.width = Math.max(80, newBox.width)
                newBox.height = newBox.width / ratio
                if (newBox.height < 10) {
                    newBox.height = 10
                    newBox.width = newBox.height * ratio
                }
                return newBox
            },
        })
        this.init()
    }

    #createAnchorShapes(pidShape: IPidShape, pidKonvaPath: Path) {
        this.#cleanAnchorShapes()
        const { x, y } = pidKonvaPath.getClientRect({ relativeTo: this.layer })
        return pidShape.anchors.map((anchor, anchorIndex) => {
            const anchorShape = new Circle({
                x: anchor.x + x,
                y: anchor.y + y,
                radius: P.anchor.radius,
                fill: P.anchor.color,
                name: 'cacAnchor',
            })
            anchorShape.on('mouseover touchover', () => anchorShape.radius(P.anchor.radiusOver))
            anchorShape.on('mouseout touchout', () => anchorShape.radius(P.anchor.radius))
            anchorShape.on('mouseup touchend', () => {
                const pos = anchorShape.absolutePosition()
                const line = this.#endConnectingLine(pos)
                if (line) this.#addConnectorToPath(pidKonvaPath, line, anchorIndex, 'end')
            })
            anchorShape.on('mousedown touchstart', () => {
                const line = this.layer.findOne('.cacCurrentLine') as Line | undefined
                if (!line) {
                    const pos = anchorShape.absolutePosition()
                    const newLine = new Line({
                        points: [pos.x, pos.y],
                        ...P.lineParams,
                        name: 'cacCurrentLine',
                    })
                    newLine.setAttr('cacStartAnchorIndex', anchorIndex)
                    const dto = pidKonvaPath.getAttr('cacDto') as IDtoPidShape
                    newLine.setAttr('cacStartPidShapeId', dto.id)
                    this.layer.add(newLine)
                }
            })
            this.layer.add(anchorShape)
            anchorShape.moveToTop()
            return anchorShape
        })
    }

    #endConnectingLine(pos: Vector2d) {
        const line = this.layer.findOne('.cacCurrentLine') as Line | undefined
        if (!line) return
        recalculateTheLine(line, pos)
        line.name('cacConnectorTwoPidShape')
        this.#cleanAnchorShapes()
        const anchorIndexStart = line.getAttr('cacStartAnchorIndex') as number
        const pidShapeStartId = line.getAttr('cacStartPidShapeId') as number
        const shapeStart = this.layer
            .find('.pidshapename')
            .find((s) => s.getAttr('cacDto').id === pidShapeStartId) as Path
        this.#addConnectorToPath(shapeStart, line, anchorIndexStart, 'start')
        return line
    }

    #addConnectorToPath(shape: Path, line: Line, anchorIndex: number, type: 'start' | 'end', init = false) {
        if (!shape.getAttr('cacConnectors')) shape.setAttr('cacConnectors', [])
        const conn: IConnector = { line, anchorIndex, type }
        shape.getAttr('cacConnectors').push(conn)
        if (type === 'end') {
            // TODO move this code at export time
            const dto = shape.getAttr('cacDto') as IDtoPidShape
            const anchorIndexStart = line.getAttr('cacStartAnchorIndex') as number
            const pidShapeStartId = line.getAttr('cacStartPidShapeId') as number
            const points = line.points()
            dto.c.push({ l: points, sai: anchorIndexStart, sid: pidShapeStartId, eai: anchorIndex })
            if (!init) this.#fire()
        }
    }

    #cleanAnchorShapes() {
        this.layer.find('.cacAnchor').forEach((shape) => shape.destroy())
    }

    addShape(pidShape: IPidShape, x: number, y: number, id = Math.floor(Math.random() * 1000000)) {
        const group = new Group({ x, y, draggable: true })
        const pidKonvaPath = new Path({ data: pidShape.path, name: 'pidshapename', ...P.shapePathParams })
        const dto: IDtoPidShape = { s: pidShape, x, y, id, c: [] }
        pidKonvaPath.setAttr('cacDto', dto)
        pidKonvaPath.setAttr('cacPidKonvaShape', pidShape)
        group.on('click tap', () => {
            this.tr.nodes([])
            this.#createAnchorShapes(pidShape, pidKonvaPath)
        })
        group.add(pidKonvaPath)
        const text = new Text({ text: pidShape.name, ...P.textParams })
        group.add(text)
        {
            const { x, y, width, height } = pidKonvaPath.getClientRect({ relativeTo: group })
            text.x(width / 2 - text.width() / 2)
            const box = new Rect({
                x: Math.min(text.x(), x),
                y: Math.min(text.y(), y),
                width: Math.max(text.x() + text.width(), x + width) - Math.min(text.x(), x),
                height: Math.max(text.y() + text.height(), y + height) - Math.min(text.y(), y),
                fill: 'transparent',
            })
            group.add(box)
        }
        group.on('mouseover touchmove', (e) => {
            const line = this.layer.findOne('.cacCurrentLine') as Line | undefined
            if (line) {
                this.#createAnchorShapes(pidShape, pidKonvaPath)
            } else {
                e.target.getStage()!.container().style.cursor = 'move'
            }
        })
        group.on('mousedown touchstart', () => this.#cleanAnchorShapes())
        group.on('mouseout touchout', (e) => {
            e.target.getStage()!.container().style.cursor = 'default'
        })
        group.on('dragmove', () => {
            const connectors = pidKonvaPath.getAttr('cacConnectors') as IConnector[]
            if (!connectors) return
            connectors.forEach((c: IConnector) => {
                const g = group.absolutePosition()
                const anchor = pidShape.anchors[c.anchorIndex]
                g.x = g.x + anchor.x
                g.y = g.y + anchor.y
                if (c.type === 'end') {
                    recalculateTheLine(c.line, g)
                } else {
                    const endX = c.line.points().at(-2)!
                    const endY = c.line.points().at(-1)!
                    const startX = c.line.points().at(0)!
                    const middleX = (startX + endX) / 2
                    const points = [g.x, g.y, middleX, g.y, middleX, endY, endX, endY]
                    c.line.points(points)
                }
            })
        })
        group.on('dragend', () => {
            const { x, y } = group.absolutePosition()
            dto.x = x
            dto.y = y
            this.#fire()
        })
        this.layer.add(group)
        return { group, pidKonvaPath, text }
    }

    #eventHandler: (() => void)[] = []
    #fire() {
        this.#eventHandler.forEach((callback) => callback())
    }
    /**
     * This method allows you to register a callback function that will be called whenever the canvas is changed.
     * This is useful for updating the state of your application or saving the current state of the canvas.
     * @param callback - The callback function to be called on change.
     */
    onChange(callback: () => void) {
        this.#eventHandler.push(callback)
    }

    #export() {
        const pidShapes = this.layer.find('.pidshapename') as Path[]
        pidShapes.forEach((s) => {
            const dto = s.getAttr('cacDto') as IDtoPidShape
            const conns = s.getAttr('cacConnectors')
            if (!conns) return
            conns
                .filter((c: IConnector) => c.type === 'end')
                .forEach((c: IConnector, index: number) => {
                    dto.c[index].l = c.line.attrs.points
                })
        })
        const data = pidShapes.map((s) => s.getAttr('cacDto') as IDtoPidShape)
        return data
    }

    exportJson() {
        return this.#export()
    }

    importJson(data: IDtoPidShape[] | null) {
        if (!data) return
        const groupAndPidShapes = data.map((i: IDtoPidShape) => this.addShape(i.s, i.x, i.y, i.id))
        const lines: Line[] = []
        data.forEach((dto: IDtoPidShape) => {
            dto.c.forEach((conn) => {
                const newLine = new Line({ points: conn.l, ...P.lineParams, name: 'cacConnectorTwoPidShape' })
                newLine.setAttr('cacStartAnchorIndex', conn.sai)
                newLine.setAttr('cacStartPidShapeId', conn.sid)
                const groupAndPidShapeStart = groupAndPidShapes.find((g) => {
                    const dto = g.pidKonvaPath.attrs.cacDto as IDtoPidShape
                    return dto.id === conn.sid
                })!
                if (!groupAndPidShapeStart) return
                this.#addConnectorToPath(groupAndPidShapeStart.pidKonvaPath, newLine, conn.sai, 'start')
                const groupAndPidShapeEnd = groupAndPidShapes.find((g) => {
                    const dtoI = g.pidKonvaPath.attrs.cacDto as IDtoPidShape
                    return dtoI.id === dto.id
                })!
                this.#addConnectorToPath(groupAndPidShapeEnd.pidKonvaPath, newLine, conn.eai, 'end', true)
                this.layer.add(newLine)
                lines.push(newLine)
            })
        })
        this.layer.draw()
        return groupAndPidShapes
    }

    clear() {
        this.layer.destroyChildren()
    }

    #createEmtpyShape(pos: Vector2d) {
        const emptyEnd: IPidShape = {
            name: '',
            anchors: [
                { type: 'in-out', x: 0, y: 7 },
                { type: 'in-out', x: 14, y: 7 },
            ],
            path: 'm 0 0 a 5 5 0 0 1 14 0 a 5 5 0 0 1 -14 0',
            height: 10,
            width: 10,
            type: 'valve',
        }
        const { group } = this.addShape(emptyEnd, pos.x, pos.y)
        return group.children.find((c) => c.attrs.data) as Path
    }

    init() {
        this.stage.on('click tap', (e) => {
            if (e.target === this.stage) {
                this.tr.nodes([])
                this.#cleanAnchorShapes()
                const pos = this.stage.getPointerPosition()
                if (!pos) this.layer.findOne('.cacCurrentLine')?.destroy()
                else if (this.layer.findOne('.cacCurrentLine')) {
                    const line = this.#endConnectingLine(pos)
                    const emptyEnd = this.#createEmtpyShape(pos)
                    if (line) this.#addConnectorToPath(emptyEnd, line, 0, 'end')
                }
            }
        })
        this.layer.add(this.tr)
        this.layer.draw()
        this.stage.on('mousemove touchmove', () => {
            const pos = this.stage.getPointerPosition()
            if (!pos) return
            const line = this.layer.findOne('.cacCurrentLine') as Line | undefined
            if (line) {
                recalculateTheLine(line, pos)
            }
        })

        initRightClickMenu(
            this.stage,
            () => {
                this.tr.nodes([])
                this.#cleanAnchorShapes()
            },
            this.#customMenuItems,
            (action: string, s: Shape) => {
                if (action === 'cacDelete') {
                    this.#deleteShape(s)
                } else if (action === 'cacResize') {
                    const group = s.getParent() as Group
                    this.#cleanAnchorShapes()
                    this.tr.nodes([group])
                    group.moveToTop()
                } else {
                    this.#customMenuItems.find((item) => item.label === action)!.callback(s)
                }
            }
        )
    }

    #deleteShape(s: Shape) {
        this.#cleanAnchorShapes()
        const group = s.getParent() as Group
        if (!group) return
        const conns = group.children.find((c) => c.attrs.cacConnectors)?.attrs.cacConnectors as IConnector[]
        conns?.forEach((c: IConnector) => c.line.destroy())
        group.destroy()
        this.#fire()
    }

    #customMenuItems: { label: string; callback: (s: Shape) => void }[] = []

    /**
     * Adds a custom menu entry to the right-click menu.
     * @param label - The label of the menu entry.
     * @param callback - The callback function to be called when the menu entry is clicked.
     */
    addMenuEntry(label: string, callback: (s: Shape) => void) {
        this.#customMenuItems.push({ label, callback })
    }
}

/**
 *  Make the line with 90 degres angles
 */
const recalculateTheLine = (line: Line, pos: Vector2d) => {
    const startX = line.points().at(0)!
    const startY = line.points().at(1)!
    const middleX = (startX + pos.x) / 2
    const points = [startX, startY, middleX, startY, middleX, pos.y, pos.x, pos.y]
    line.points(points)
    return points
}

// Adjust canvas size on window resize
window.addEventListener('resize', () => {
    const stage = stages[0]
    stage.width(window.innerWidth)
    stage.height(window.innerHeight)
    // TODO
    // go()
})

export const initRightClickMenu = (
    stage: Stage,
    onShowMenu: () => void,
    customMenuItems: { label: string; callback: (s: Shape) => void }[],
    callback: (action: string, s: Shape) => void
) => {
    let currentShape: Shape | undefined
    const menuNode = document.createElement('div')
    menuNode.id = 'menu'
    menuNode.style.display = 'none'
    menuNode.style.position = 'absolute'
    menuNode.style.width = '160px'
    menuNode.style.backgroundColor = 'white'
    menuNode.style.boxShadow = '0 0 5px grey'
    menuNode.style.borderRadius = '3px'
    document.body.appendChild(menuNode)

    function createMenuItem(text: string, action: string) {
        const resizeButton = document.createElement('button')
        resizeButton.textContent = text
        resizeButton.style.width = '100%'
        resizeButton.style.backgroundColor = 'white'
        resizeButton.style.border = 'none'
        resizeButton.style.margin = '0'
        resizeButton.style.padding = '10px'
        resizeButton.addEventListener('mouseover', () => (resizeButton.style.backgroundColor = '#f3f4f7'))
        resizeButton.addEventListener('mouseout', () => (resizeButton.style.backgroundColor = 'white'))
        resizeButton.addEventListener('click', () => {
            menuNode.style.display = 'none'
            callback(action, currentShape!)
        })
        menuNode.appendChild(resizeButton)
    }

    window.addEventListener('click', () => (menuNode.innerHTML = ''))

    stage.on('contextmenu dbltap', (e) => {
        onShowMenu()
        e.evt.preventDefault()
        if (e.target === stage) return
        currentShape = e.target as Shape

        // createMenuItem('Resize and Rotate', 'cacResize')
        createMenuItem('Delete', 'cacDelete')
        customMenuItems.forEach((item) => createMenuItem(item.label, item.label))
        menuNode.style.display = 'initial'
        const containerRect = stage.container().getBoundingClientRect()
        menuNode.style.top = containerRect.top + stage.getPointerPosition()!.y + 4 + 'px'
        menuNode.style.left = containerRect.left + stage.getPointerPosition()!.x + 4 + 'px'
    })
}

export const CAC_TIPS = [
    'You can add icons from the left menu',
    isTouchDevice ? 'Double tap icons to edit them' : 'Right click icons to edit them',
    'You can drag icons on the whiteboard',
    // 'Press Ctrl + Z to undo your last action',
]

export const setDataInUrl = (data: any) => {
    const url = new URL(window.location.href)
    url.searchParams.set('data', encodeURIComponent(JSON.stringify(data)))
    window.history.replaceState(null, '', url.toString())
}

export const getDataInUrl = () => {
    const urlParams = new URLSearchParams(window.location.search)
    const dataParam = urlParams.get('data')
    if (dataParam) {
        return JSON.parse(decodeURIComponent(dataParam))
    }
    return null
}

/**
 * Initializes a menu with icons for the user to select from.
 */
export const initToolboxMenu = (
    conf: { container: string; iconSet: IPidIconSet },
    callback: (pidShape: IPidShape, x: number, y: number) => void
) => {
    const menuEle = document.querySelector(conf.container)
    if (!menuEle) throw new Error(`Element with selector "${conf.container}" not found`)

    const menuContainer = document.createElement('div')
    menuContainer.className = 'cac-menu-container'
    document.body.appendChild(menuContainer)

    conf.iconSet.data.map((pidShape: IPidShape) => {
        const iconElement = document.createElement('div')
        iconElement.className = 'menu-element'
        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svgElement.setAttribute('viewBox', `0 0 ${pidShape.width + 2} ${pidShape.height + 1}`)
        svgElement.setAttribute('width', pidShape.width.toString())
        svgElement.setAttribute('height', pidShape.height.toString())
        svgElement.setAttribute('fill', 'none')
        svgElement.setAttribute('stroke', P.shapePathParams.stroke)
        svgElement.setAttribute('stroke-linecap', P.shapePathParams.strokeLineCap)
        svgElement.setAttribute('stroke-width', P.shapePathParams.strokeWidth.toString())

        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        pathElement.setAttribute('d', pidShape.path)

        svgElement.appendChild(pathElement)
        const nameElement = document.createElement('span')
        nameElement.className = 'icon-name'
        nameElement.textContent = pidShape.name
        iconElement.appendChild(svgElement)
        iconElement.appendChild(nameElement)

        iconElement.addEventListener('mousedown', (event) => {
            menuContainer.style.display = 'none'
            const { x, y } = event
            callback(pidShape, x, y)
        })

        menuContainer.appendChild(iconElement)
    })

    menuEle.addEventListener('click', () => {
        const isMenuVisible = menuContainer.style.display === 'block'
        menuContainer.style.display = isMenuVisible ? 'none' : 'block'
    })

    document.addEventListener('click', (event: any) => {
        if (!menuContainer.contains(event.target) && !menuEle.contains(event.target)) {
            menuContainer.style.display = 'none'
        }
    })
}

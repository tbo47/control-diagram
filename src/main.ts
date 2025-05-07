import { Shape } from 'konva-es/lib/Shape'
import { CacEditor, fetchPidIconSet, getDataInUrl, initToolboxMenu, setDataInUrl } from './cac-editor'
import { initTip } from './util'

const TOP_BAR_HEIGHT = 40

const myInit = async () => {
    const iconSet = await fetchPidIconSet()

    const cacEditor = new CacEditor({
        container: 'app', // id of container <div>
        width: window.innerWidth,
        height: window.innerHeight - TOP_BAR_HEIGHT,
    })

    initToolboxMenu({ container: '.cac-editor-toolbox', iconSet }, (pidShape, x, y) => {
        cacEditor.addShape(pidShape, x - pidShape.width / 2, y - TOP_BAR_HEIGHT - pidShape.height / 2)
    })

    // save user changes to url for easy sharing
    cacEditor.onChange(() => setDataInUrl(cacEditor.exportJson()))

    // load data from url if available
    cacEditor.importJson(getDataInUrl())!

    cacEditor.addMenuEntry('Actions', (s: Shape) => console.log('Actions on shape:', s))

    /*
    diagramData.forEach(({ pidKonvaPath }) =>
        setInterval(() => pidKonvaPath.fill(pidKonvaPath.fill() === 'green' ? 'red' : 'green'), 600)
    )
    */
}
myInit()
initTip()

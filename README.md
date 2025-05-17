# Control diagram

An interactive and intuitive P&ID (Piping and Instrumentation Diagram) editor designed for your factory's needs.

[**Live Demo**](https://control-and-command.com/) | [**Icons Used**](https://github.com/tbo47/open-pid-icons)

### Key Features:

-   **High Performance**: Built for speed and efficiency.
-   **Seamless Integration**: Easily integrates with your existing software (React, Vue, Angular, etc.).
-   **Enterprise-Friendly**: Open-source with a business-friendly license.

### Install

`npm install control-diagram`

```javascript
const iconSet = await fetchPidIconSet()

const cacEditor = new CacEditor({
    container: 'app', // id of container <div>
    width: 300,
    height: 300,
})

// <button class="cac-editor-toolbox" />
initToolboxMenu({ container: '.cac-editor-toolbox', iconSet }, (pidShape, x, y) => {
    cacEditor.addShape(pidShape, x, y)
})
```

import { CAC_TIPS } from './cac-editor'

export const initTip = (tips = CAC_TIPS) => {
    const tip = document.getElementById('tip')!
    let index = 0
    tip.innerHTML = tips[index]
    setInterval(() => {
        tip.innerHTML = ''
        setTimeout(() => (tip.innerHTML = tips[++index % tips.length]), 1000)
    }, 8000)
}


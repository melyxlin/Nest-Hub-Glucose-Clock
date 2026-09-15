const displayKey = new URLSearchParams(
    window.location.search,
).get('key')

function protectedUrl(path) {
    if (!displayKey) {
        return path
    }

    const separator = path.includes('?') ? '&' : '?'

    return `${path}${separator}key=${encodeURIComponent(displayKey)}`
}

export default protectedUrl
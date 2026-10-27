export function wrap(string, ...wrappers) {
    return [...wrappers, string, ...wrappers.reverse()].join('');
}
export function isURL(string) {
    try {
        const url = new URL(string);
        const safeProtocols = ['http:', 'https:', 'ftp:', 'mailto:'];
        return safeProtocols.includes(url.protocol);
    }
    catch {
        return false;
    }
}
export function isPotentiallyEncoded(uri) {
    return uri !== decodeURIComponent(uri || '');
}

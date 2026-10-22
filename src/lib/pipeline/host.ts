export type Host = string & { readonly __brand: 'Host' };

export function hostOf(url: URL): Host {
  return url.host.toLowerCase().replace(/\.(?=(?::\d+)?$)/, '') as Host;
}

import { resolveWsUrl } from "./apiClient";

export const websocketClient = {
  create: (url: string, protocols?: string | string[]): WebSocket => {
    const resolvedUrl = resolveWsUrl(url);
    return new WebSocket(resolvedUrl, protocols);
  },
};
